import { Router } from 'express';
import { pool, withUser } from '../db.js';
import { allow, wrap } from '../middleware.js';

const r = Router();

// Customers must never see host names or other organizations' data, so they get an explicit column list
const CUSTOMER_COLS = `instance_id, org_id, name, status, type_name, vcpu, ram_gb, disk_gb, image,
  region_code, region_name, ip_address, auto_backup, created_at, terminated_at, price_per_hour`;

// ---- list: staff see everything (optional filters), customers see only their own organization ----
r.get('/', wrap(async (req, res) => {
  const u = req.user;
  const where = [];
  const params = [];
  if (u.role === 'customer') {
    if (!u.org_id) return res.json([]);
    where.push('org_id = ?'); params.push(u.org_id);
  } else if (req.query.org_id) {
    where.push('org_id = ?'); params.push(req.query.org_id);
  }
  if (req.query.status) { where.push('status = ?'); params.push(req.query.status); }
  const [rows] = await pool.query(
    `SELECT ${u.role === 'customer' ? CUSTOMER_COLS : '*'} FROM v_instances
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY status = 'terminated', instance_id DESC`, params);
  res.json(rows);
}));

// ---- quota: how many instances the plan allows ----
r.get('/quota', wrap(async (req, res) => {
  const u = req.user;
  if (u.role === 'customer') {
    const [rows] = await pool.query('SELECT * FROM v_org_quota WHERE org_id = ?', [u.org_id || 0]);
    return res.json(rows[0] || null);
  }
  const [rows] = await pool.query('SELECT * FROM v_org_quota ORDER BY org_name');
  res.json(rows);
}));

// ---- launch (customers only; the organization comes from the login token, never from the request body) ----
r.post('/', allow('customer'), wrap(async (req, res) => {
  const u = req.user;
  if (!u.org_id) return res.status(400).json({ error: 'Your account is not linked to an organization' });
  const b = req.body;
  const config = b.config && Object.keys(b.config).length ? JSON.stringify(b.config) : null;
  const [result] = await withUser(u, (c) =>
    c.query('CALL sp_launch_instance(?,?,?,?,?,?)', [u.org_id, b.type_id, b.image_id, b.region_id, b.name, config]));
  res.status(201).json(result[0][0]);
}));

// ---- start / stop / terminate (customers) and suspend / reactivate (super admin) ----
r.post('/:id/status', allow('customer', 'super_admin'), wrap(async (req, res) => {
  const u = req.user;
  const status = req.body.status;
  if (u.role === 'customer') {
    if (!['running', 'stopped', 'terminated'].includes(status))
      return res.status(403).json({ error: 'You can only start, stop or terminate instances' });
    if (status === 'terminated' && u.member_role !== 'owner')
      return res.status(403).json({ error: 'Only the organization owner can terminate instances' });
  }
  await withUser(u, (c) =>
    c.query('CALL sp_set_instance_status(?,?,?)', [req.params.id, u.role === 'customer' ? u.org_id : null, status]));
  res.json({ ok: true });
}));

// ---- audit trail of one instance (written by triggers) ----
r.get('/:id/history', wrap(async (req, res) => {
  const u = req.user;
  if (u.role === 'customer') {
    const [own] = await pool.query('SELECT 1 FROM instances WHERE instance_id = ? AND org_id = ?', [req.params.id, u.org_id || 0]);
    if (!own.length) return res.status(404).json({ error: 'Instance not found' });
  }
  const [rows] = await pool.query(
    `SELECT a.audit_id, a.action, a.old_data, a.new_data, a.changed_at,
            COALESCE(us.full_name, 'system') AS changed_by_name
     FROM audit_log a LEFT JOIN users us ON us.user_id = a.changed_by
     WHERE a.table_name = 'instances' AND a.record_id = ?
     ORDER BY a.audit_id DESC`, [req.params.id]);
  res.json(rows);
}));

export default r;
