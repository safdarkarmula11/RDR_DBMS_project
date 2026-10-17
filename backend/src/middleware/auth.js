import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { pools } from '../db.js';

export async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      code: 'UNAUTHORIZED',
      msg: 'Authentication token required',
    });
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return res.status(401).json({
      code: 'UNAUTHORIZED',
      msg: 'Authentication token required',
    });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, config.jwt.secret, {
      algorithms: ['HS256'],
    });
  } catch (err) {
    return res.status(401).json({
      code: 'UNAUTHORIZED',
      msg: 'Invalid or expired token',
    });
  }

  const userId = decoded.sub || decoded.user_id;
  if (!userId) {
    return res.status(401).json({
      code: 'UNAUTHORIZED',
      msg: 'Malformed token payload',
    });
  }

  try {
    // Live database check for user status and organization status on EVERY request
    const [rows] = await pools.customer.execute(
      `SELECT u.user_id, u.email, u.full_name, u.system_role, u.status AS user_status,
              om.org_id, om.member_role, o.name AS org_name, o.status AS org_status
       FROM users u
       LEFT JOIN org_members om ON om.user_id = u.user_id
       LEFT JOIN organizations o ON o.org_id = om.org_id
       WHERE u.user_id = ?
       ORDER BY om.joined_at ASC
       LIMIT 1`,
      [userId]
    );

    const user = rows[0];
    if (!user || user.user_status !== 'active') {
      return res.status(401).json({
        code: 'UNAUTHORIZED',
        msg: 'User account is disabled or suspended',
      });
    }

    // Customers must belong to an active organization
    if (user.system_role === 'customer') {
      if (!user.org_id || user.org_status !== 'active') {
        return res.status(401).json({
          code: 'UNAUTHORIZED',
          msg: 'Organization is not active or suspended',
        });
      }
    }

    // Attach validated identity to req.user
    req.user = {
      sub: user.user_id,
      user_id: user.user_id,
      role: user.system_role,
      org_id: user.org_id || null,
      org_name: user.org_name || null,
      member_role: user.member_role || null,
      email: user.email,
      name: user.full_name,
    };

    next();
  } catch (err) {
    next(err);
  }
}

export default authenticate;
