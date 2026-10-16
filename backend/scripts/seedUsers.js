import bcrypt from 'bcryptjs';
import { pool } from '../src/db.js';

// email, password, name, role, organization (null = staff), member_role
const users = [
  ['admin@nimbus.test',    'admin123',    'Asha Admin',    'super_admin', null, null],
  ['support@nimbus.test',  'support123',  'Sam Support',   'support',     null, null],
  ['billing@nimbus.test',  'billing123',  'Bela Billing',  'billing',     null, null],
  ['owner@acme.test',      'customer123', 'Omar Owner',    'customer',    'Acme Robotics', 'owner'],
  ['dev@acme.test',        'customer123', 'Dina Developer','customer',    'Acme Robotics', 'member'],
];

for (const [email, pw, name, role, org, memberRole] of users) {
  const hash = await bcrypt.hash(pw, 10);
  await pool.query(
    `INSERT INTO users(email, password_hash, full_name, system_role) VALUES (?,?,?,?)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), full_name = VALUES(full_name), system_role = VALUES(system_role)`,
    [email, hash, name, role]);
  if (org) {
    await pool.query(
      `INSERT IGNORE INTO org_members(org_id, user_id, member_role)
       SELECT o.org_id, u.user_id, ? FROM organizations o, users u WHERE o.name = ? AND u.email = ?`,
      [memberRole, org, email]);
  }
  console.log(`${role.padEnd(12)} ${email}  /  ${pw}`);
}
await pool.end();
