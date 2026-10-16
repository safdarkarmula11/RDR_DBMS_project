import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';
import { auth, signToken, wrap } from '../middleware.js';

const r = Router();

r.post('/login', wrap(async (req, res) => {
  const { email, password } = req.body;
  const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
  const u = rows[0];
  if (!u || u.status !== 'active' || !(await bcrypt.compare(password || '', u.password_hash)))
    return res.status(401).json({ error: 'Wrong email or password' });

  // customers belong to an organization; take the first membership
  const [orgs] = await pool.query(
    `SELECT om.org_id, om.member_role, o.name AS org_name
     FROM org_members om JOIN organizations o ON o.org_id = om.org_id
     WHERE om.user_id = ? ORDER BY om.joined_at LIMIT 1`, [u.user_id]);
  const org = orgs[0] || {};
  const user = { user_id: u.user_id, email: u.email, name: u.full_name, role: u.system_role,
                 org_id: org.org_id || null, org_name: org.org_name || null, member_role: org.member_role || null };
  res.json({ token: signToken(user), user });
}));

r.get('/me', auth, wrap(async (req, res) => res.json(req.user)));

export default r;
