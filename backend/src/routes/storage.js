import { Router } from 'express';
import { pool, withUser } from '../db.js';
import { allow, wrap } from '../middleware.js';

const r = Router();
const customer = allow('customer');
const isCustomer = (u) => u.role === 'customer';

// Customers see only their organization; staff see everything (read-only)
const scope = (u, params) => {
  if (!isCustomer(u)) return '';
  params.push(u.org_id || 0);
  return 'WHERE org_id = ?';
};

// ---- storage quota ----
r.get('/quota', wrap(async (req, res) => {
  const u = req.user;
  if (isCustomer(u)) {
    const [rows] = await pool.query('SELECT * FROM v_org_storage WHERE org_id = ?', [u.org_id || 0]);
    return res.json(rows[0] || null);
  }
  const [rows] = await pool.query('SELECT * FROM v_org_storage ORDER BY org_name');
  res.json(rows);
}));

// ---- volumes ----
r.get('/volumes', wrap(async (req, res) => {
  const params = [];
  const [rows] = await pool.query(`SELECT * FROM v_volumes ${scope(req.user, params)} ORDER BY volume_id DESC`, params);
  res.json(rows);
}));

r.post('/volumes', customer, wrap(async (req, res) => {
  const u = req.user, b = req.body;
  const [out] = await withUser(u, (c) =>
    c.query('CALL sp_create_volume(?,?,?,?,?)', [u.org_id, b.region_id, b.name, b.size_gb, b.vol_type]));
  res.status(201).json(out[0][0]);
}));

r.post('/volumes/:id/attach', customer, wrap(async (req, res) => {
  await withUser(req.user, (c) => c.query('CALL sp_attach_volume(?,?,?)', [req.params.id, req.body.instance_id, req.user.org_id]));
  res.json({ ok: true });
}));

r.post('/volumes/:id/detach', customer, wrap(async (req, res) => {
  await withUser(req.user, (c) => c.query('CALL sp_detach_volume(?,?)', [req.params.id, req.user.org_id]));
  res.json({ ok: true });
}));

r.post('/volumes/:id/resize', customer, wrap(async (req, res) => {
  await withUser(req.user, (c) => c.query('CALL sp_resize_volume(?,?,?)', [req.params.id, req.user.org_id, req.body.size_gb]));
  res.json({ ok: true });
}));

r.delete('/volumes/:id', customer, wrap(async (req, res) => {
  await withUser(req.user, (c) => c.query('CALL sp_delete_volume(?,?)', [req.params.id, req.user.org_id]));
  res.json({ ok: true });
}));

// ---- snapshots ----
r.get('/snapshots', wrap(async (req, res) => {
  const params = [];
  const [rows] = await pool.query(`SELECT * FROM v_snapshots ${scope(req.user, params)} ORDER BY snapshot_id DESC`, params);
  res.json(rows);
}));

r.post('/volumes/:id/snapshots', customer, wrap(async (req, res) => {
  const [out] = await withUser(req.user, (c) =>
    c.query('CALL sp_take_snapshot(?,?,?)', [req.params.id, req.user.org_id, req.body.name]));
  res.status(201).json(out[0][0]);
}));

r.post('/snapshots/:id/restore', customer, wrap(async (req, res) => {
  const [out] = await withUser(req.user, (c) =>
    c.query('CALL sp_restore_snapshot(?,?,?)', [req.params.id, req.user.org_id, req.body.name]));
  res.status(201).json(out[0][0]);
}));

r.delete('/snapshots/:id', customer, wrap(async (req, res) => {
  await withUser(req.user, (c) => c.query('CALL sp_delete_snapshot(?,?)', [req.params.id, req.user.org_id]));
  res.json({ ok: true });
}));

export default r;