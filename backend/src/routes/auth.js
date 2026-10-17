import { Router } from 'express';
import crypto from 'node:crypto';
import { withDb, withTransactionRetry } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import { loginSchema, registerSchema, createApiKeySchema } from '../validation/schemas.js';
import {
  hashPassword,
  isCommonPassword,
  authenticateWithPassword,
  rotateRefreshToken,
  revokeToken,
  createRefreshToken,
  generateAccessToken,
  sha256,
} from '../services/auth.service.js';
import { config } from '../config.js';

const router = Router();

const REFRESH_COOKIE_NAME = 'refresh_token';

function setRefreshCookie(res, token) {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'strict',
    maxAge: config.jwt.refreshDays * 24 * 60 * 60 * 1000,
    path: '/api/auth',
  });
}

function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'strict',
    path: '/api/auth',
  });
}

// POST /auth/register
router.post('/register', authLimiter, validate({ body: registerSchema }), async (req, res, next) => {
  try {
    const { email, password, full_name, org_name } = req.body;

    if (isCommonPassword(password)) {
      return res.status(400).json({
        code: 'WEAK_PASSWORD',
        msg: 'Password is too common and easily guessable. Please choose a more complex password.',
      });
    }

    const hashedPassword = await hashPassword(password);

    const result = await withDb(req, async (conn) => {
      return withTransactionRetry(conn, async () => {
        // Check existing email
        const [existingUser] = await conn.execute(
          'SELECT user_id FROM users WHERE email = ?',
          [email]
        );
        if (existingUser.length > 0) {
          const err = new Error('Email is already registered');
          err.statusCode = 409;
          err.code = 'DUPLICATE_EMAIL';
          throw err;
        }

        // Check existing org name
        const [existingOrg] = await conn.execute(
          'SELECT org_id FROM organizations WHERE name = ?',
          [org_name]
        );
        if (existingOrg.length > 0) {
          const err = new Error('Organization name is already taken');
          err.statusCode = 409;
          err.code = 'DUPLICATE_ORG';
          throw err;
        }

        // 1. Create Organization (defaulting to Starter tier or first active tier)
        const [tiers] = await conn.execute(
          `SELECT tier_id FROM account_tiers WHERE name = 'Starter' OR name = 'Free' ORDER BY tier_id ASC LIMIT 1`
        );
        const tierId = tiers[0]?.tier_id || 1;

        const [orgResult] = await conn.execute(
          'INSERT INTO organizations(name, tier_id, status) VALUES (?, ?, ?)',
          [org_name, tierId, 'active']
        );
        const orgId = orgResult.insertId;

        // 2. Create User
        const [userResult] = await conn.execute(
          'INSERT INTO users(email, password_hash, full_name, system_role, status) VALUES (?, ?, ?, ?, ?)',
          [email, hashedPassword, full_name, 'customer', 'active']
        );
        const userId = userResult.insertId;

        // 3. Link User as Owner in org_members
        await conn.execute(
          'INSERT INTO org_members(org_id, user_id, member_role) VALUES (?, ?, ?)',
          [orgId, userId, 'owner']
        );

        const user = {
          user_id: userId,
          email,
          name: full_name,
          role: 'customer',
          org_id: orgId,
          org_name,
          member_role: 'owner',
        };

        const accessToken = generateAccessToken(user);
        const refreshToken = await createRefreshToken(conn, userId);

        return {
          accessToken,
          refreshToken: refreshToken.rawToken,
          user,
        };
      });
    });

    setRefreshCookie(res, result.refreshToken);

    res.status(201).json({
      token: result.accessToken,
      user: result.user,
    });
  } catch (err) {
    next(err);
  }
});

// POST /auth/login
router.post('/login', authLimiter, validate({ body: loginSchema }), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'] || 'unknown';

    const result = await withDb(req, async (conn) => {
      return authenticateWithPassword(conn, {
        email,
        password,
        ipAddress,
        userAgent,
      });
    });

    setRefreshCookie(res, result.refreshToken);

    res.json({
      token: result.accessToken,
      user: result.user,
    });
  } catch (err) {
    next(err);
  }
});

// POST /auth/refresh
router.post('/refresh', async (req, res, next) => {
  try {
    const rawToken = req.cookies?.[REFRESH_COOKIE_NAME] || req.body?.refresh_token;
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'] || 'unknown';

    const result = await withDb(req, async (conn) => {
      return rotateRefreshToken(conn, {
        rawToken,
        ipAddress,
        userAgent,
      });
    });

    setRefreshCookie(res, result.refreshToken);

    res.json({
      token: result.accessToken,
      user: result.user,
    });
  } catch (err) {
    clearRefreshCookie(res);
    next(err);
  }
});

// POST /auth/logout
router.post('/logout', async (req, res, next) => {
  try {
    const rawToken = req.cookies?.[REFRESH_COOKIE_NAME] || req.body?.refresh_token;
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'] || 'unknown';

    await withDb(req, async (conn) => {
      await revokeToken(conn, {
        rawToken,
        userId: req.user?.sub,
        ipAddress,
        userAgent,
      });
    });

    clearRefreshCookie(res);
    res.json({ ok: true, msg: 'Logged out successfully' });
  } catch (err) {
    clearRefreshCookie(res);
    next(err);
  }
});

// GET /auth/me
router.get('/me', authenticate, async (req, res, next) => {
  try {
    res.json({
      ...req.user,
      user: req.user,
    });
  } catch (err) {
    next(err);
  }
});

// GET /auth/api-keys - List API keys for current user
router.get('/api-keys', authenticate, async (req, res, next) => {
  try {
    const keys = await withDb(req, async (conn) => {
      const [rows] = await conn.execute(
        `SELECT key_id, label, created_at, revoked
         FROM api_keys
         WHERE user_id = ?
         ORDER BY created_at DESC`,
        [req.user.sub]
      );
      return rows;
    });

    res.json(keys);
  } catch (err) {
    next(err);
  }
});

// POST /auth/api-keys - Generate API key
router.post('/api-keys', authenticate, validate({ body: createApiKeySchema }), async (req, res, next) => {
  try {
    const { label } = req.body;
    const rawKey = `nh_${crypto.randomBytes(32).toString('hex')}`;
    const keyHash = sha256(rawKey);

    const result = await withDb(req, async (conn) => {
      const [out] = await conn.execute(
        'INSERT INTO api_keys(user_id, key_hash, label) VALUES (?, ?, ?)',
        [req.user.sub, keyHash, label]
      );
      return {
        key_id: out.insertId,
        raw_key: rawKey,
        key: rawKey,
        label,
      };
    });

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// DELETE /auth/api-keys/:keyId - Revoke API key
router.delete('/api-keys/:keyId', authenticate, async (req, res, next) => {
  try {
    const keyId = Number(req.params.keyId);
    await withDb(req, async (conn) => {
      await conn.execute(
        'UPDATE api_keys SET revoked = TRUE WHERE key_id = ? AND user_id = ?',
        [keyId, req.user.sub]
      );
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
