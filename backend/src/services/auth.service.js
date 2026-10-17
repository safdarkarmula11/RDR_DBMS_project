import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { pools } from '../db.js';

const BCRYPT_COST = 12;
const DUMMY_HASH = '$2b$12$e8Yy8s0mJmS1gHq/c7W5iOxvjK9Vq9z/L90f4E7hF2mB6wQzPqS9C';

const COMMON_PASSWORDS = new Set([
  'password1234',
  '123456789012',
  'administrator',
  'admin1234567',
  'welcome12345',
  'qwertyuiop12',
  'password12345',
  'changeme1234',
  'letmein123456',
  'iloveyou1234',
]);

export async function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, BCRYPT_COST);
}

export function isCommonPassword(password) {
  return COMMON_PASSWORDS.has(password.toLowerCase());
}

export function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

export async function logSecurityEvent(conn, { eventType, userId = null, ipAddress = null, userAgent = null, detail = null }) {
  try {
    const detailJson = detail ? JSON.stringify(detail) : null;
    await conn.execute(
      `INSERT INTO security_log(event_type, user_id, ip_address, user_agent, detail)
       VALUES (?, ?, ?, ?, ?)`,
      [eventType, userId, ipAddress, userAgent, detailJson]
    );
  } catch (err) {
    console.error('Failed to write security log:', err);
  }
}

export function generateAccessToken(user) {
  const payload = {
    sub: user.user_id,
    role: user.system_role,
    org_id: user.org_id || null,
    member_role: user.member_role || null,
    jti: crypto.randomUUID(),
  };

  return jwt.sign(payload, config.jwt.secret, {
    algorithm: 'HS256',
    expiresIn: config.jwt.expiresIn,
  });
}

export async function createRefreshToken(conn, userId, familyId = null) {
  const rawToken = crypto.randomBytes(40).toString('hex');
  const tokenHash = sha256(rawToken);
  const actualFamilyId = familyId || crypto.randomUUID();
  const expiresAt = new Date(Date.now() + config.jwt.refreshDays * 24 * 60 * 60 * 1000);

  await conn.execute(
    `INSERT INTO refresh_tokens(user_id, token_hash, family_id, expires_at)
     VALUES (?, ?, ?, ?)`,
    [userId, tokenHash, actualFamilyId, expiresAt]
  );

  return { rawToken, expiresAt };
}

export async function authenticateWithPassword(conn, { email, password, ipAddress, userAgent }) {
  // Query user record
  const [rows] = await conn.execute(
    `SELECT user_id, email, password_hash, full_name, system_role, status, failed_logins, locked_until
     FROM users WHERE email = ?`,
    [email]
  );

  const user = rows[0];

  // Constant-time comparison on unknown email to protect against timing enumeration
  if (!user) {
    await bcrypt.compare(password || '', DUMMY_HASH);
    await logSecurityEvent(conn, {
      eventType: 'login_failure',
      userId: null,
      ipAddress,
      userAgent,
      detail: { reason: 'user_not_found', email },
    });
    const err = new Error('Wrong email or password');
    err.statusCode = 401;
    err.code = 'INVALID_CREDENTIALS';
    throw err;
  }

  // Check lockout status
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    await logSecurityEvent(conn, {
      eventType: 'lockout',
      userId: user.user_id,
      ipAddress,
      userAgent,
      detail: { reason: 'account_locked', locked_until: user.locked_until },
    });
    const err = new Error('Account is temporarily locked due to multiple failed login attempts');
    err.statusCode = 429;
    err.code = 'ACCOUNT_LOCKED';
    throw err;
  }

  // Validate account status
  if (user.status !== 'active') {
    const err = new Error('Account is disabled or inactive');
    err.statusCode = 401;
    err.code = 'ACCOUNT_DISABLED';
    throw err;
  }

  const isMatch = await bcrypt.compare(password || '', user.password_hash);
  if (!isMatch) {
    const newFailedCount = user.failed_logins + 1;
    let lockoutSql = '';
    let lockoutParams = [newFailedCount, user.user_id];

    if (newFailedCount >= 5) {
      // Exponential backoff: (2^(failures - 5)) * 5 minutes
      const lockMinutes = Math.min(Math.pow(2, newFailedCount - 5) * 5, 1440); // Max 24 hours
      await conn.execute(
        `UPDATE users
         SET failed_logins = ?, locked_until = DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? MINUTE)
         WHERE user_id = ?`,
        [newFailedCount, lockMinutes, user.user_id]
      );
      await logSecurityEvent(conn, {
        eventType: 'lockout',
        userId: user.user_id,
        ipAddress,
        userAgent,
        detail: { failed_logins: newFailedCount, lock_minutes: lockMinutes },
      });
    } else {
      await conn.execute(
        `UPDATE users SET failed_logins = ? WHERE user_id = ?`,
        [newFailedCount, user.user_id]
      );
      await logSecurityEvent(conn, {
        eventType: 'login_failure',
        userId: user.user_id,
        ipAddress,
        userAgent,
        detail: { failed_logins: newFailedCount },
      });
    }

    const err = new Error('Wrong email or password');
    err.statusCode = 401;
    err.code = 'INVALID_CREDENTIALS';
    throw err;
  }

  // Password correct: Reset failed login count and lockout timer
  await conn.execute(
    `UPDATE users SET failed_logins = 0, locked_until = NULL WHERE user_id = ?`,
    [user.user_id]
  );

  // Fetch organization membership
  const [orgs] = await conn.execute(
    `SELECT om.org_id, om.member_role, o.name AS org_name, o.status AS org_status
     FROM org_members om
     JOIN organizations o ON o.org_id = om.org_id
     WHERE om.user_id = ?
     ORDER BY om.joined_at ASC
     LIMIT 1`,
    [user.user_id]
  );

  const org = orgs[0] || {};
  if (user.system_role === 'customer' && org.org_status && org.org_status !== 'active') {
    const err = new Error('Organization is suspended or closed');
    err.statusCode = 401;
    err.code = 'SUSPENDED';
    throw err;
  }

  const authenticatedUser = {
    user_id: user.user_id,
    email: user.email,
    name: user.full_name,
    role: user.system_role,
    org_id: org.org_id || null,
    org_name: org.org_name || null,
    member_role: org.member_role || null,
  };

  const accessToken = generateAccessToken(authenticatedUser);
  const refreshToken = await createRefreshToken(conn, user.user_id);

  await logSecurityEvent(conn, {
    eventType: 'login_success',
    userId: user.user_id,
    ipAddress,
    userAgent,
  });

  return {
    accessToken,
    refreshToken: refreshToken.rawToken,
    user: authenticatedUser,
  };
}

export async function rotateRefreshToken(conn, { rawToken, ipAddress, userAgent }) {
  if (!rawToken) {
    const err = new Error('Refresh token is required');
    err.statusCode = 401;
    err.code = 'TOKEN_REQUIRED';
    throw err;
  }

  const tokenHash = sha256(rawToken);

  // Query token by hash
  const [tokens] = await conn.execute(
    `SELECT token_id, user_id, family_id, expires_at, revoked_at
     FROM refresh_tokens
     WHERE token_hash = ?`,
    [tokenHash]
  );

  const existingToken = tokens[0];
  if (!existingToken) {
    const err = new Error('Invalid refresh token');
    err.statusCode = 401;
    err.code = 'INVALID_TOKEN';
    throw err;
  }

  // Detect token reuse: If token was already revoked, someone is replaying it!
  if (existingToken.revoked_at !== null) {
    // Revoke the entire token family immediately
    await conn.execute(
      `UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE family_id = ?`,
      [existingToken.family_id]
    );

    await logSecurityEvent(conn, {
      eventType: 'reuse_detected',
      userId: existingToken.user_id,
      ipAddress,
      userAgent,
      detail: { family_id: existingToken.family_id, attempted_token_id: existingToken.token_id },
    });

    const err = new Error('Refresh token reuse detected. All sessions in this chain have been revoked.');
    err.statusCode = 401;
    err.code = 'TOKEN_REUSE_DETECTED';
    throw err;
  }

  // Check expiration
  if (new Date(existingToken.expires_at) < new Date()) {
    const err = new Error('Refresh token has expired');
    err.statusCode = 401;
    err.code = 'TOKEN_EXPIRED';
    throw err;
  }

  // Revoke the used refresh token
  await conn.execute(
    `UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE token_id = ?`,
    [existingToken.token_id]
  );

  // Retrieve user & org details
  const [users] = await conn.execute(
    `SELECT u.user_id, u.email, u.full_name, u.system_role, u.status,
            om.org_id, om.member_role, o.name AS org_name, o.status AS org_status
     FROM users u
     LEFT JOIN org_members om ON om.user_id = u.user_id
     LEFT JOIN organizations o ON o.org_id = om.org_id
     WHERE u.user_id = ?
     LIMIT 1`,
    [existingToken.user_id]
  );

  const user = users[0];
  if (!user || user.status !== 'active') {
    const err = new Error('User account is inactive');
    err.statusCode = 401;
    err.code = 'ACCOUNT_DISABLED';
    throw err;
  }

  if (user.system_role === 'customer' && user.org_status && user.org_status !== 'active') {
    const err = new Error('Organization is suspended');
    err.statusCode = 401;
    err.code = 'SUSPENDED';
    throw err;
  }

  // Create new refresh token within the same family
  const newRefreshToken = await createRefreshToken(conn, user.user_id, existingToken.family_id);

  const authUser = {
    user_id: user.user_id,
    email: user.email,
    name: user.full_name,
    role: user.system_role,
    org_id: user.org_id || null,
    org_name: user.org_name || null,
    member_role: user.member_role || null,
  };

  const newAccessToken = generateAccessToken(authUser);

  await logSecurityEvent(conn, {
    eventType: 'token_refresh',
    userId: user.user_id,
    ipAddress,
    userAgent,
    detail: { family_id: existingToken.family_id },
  });

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken.rawToken,
    user: authUser,
  };
}

export async function revokeToken(conn, { rawToken, userId, ipAddress, userAgent }) {
  if (rawToken) {
    const tokenHash = sha256(rawToken);
    await conn.execute(
      `UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE token_hash = ?`,
      [tokenHash]
    );
  } else if (userId) {
    await conn.execute(
      `UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ? AND revoked_at IS NULL`,
      [userId]
    );
  }

  await logSecurityEvent(conn, {
    eventType: 'logout',
    userId,
    ipAddress,
    userAgent,
  });
}
