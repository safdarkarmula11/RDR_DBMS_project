import { Router } from 'express';
import { pool, withUser } from '../db.js';
import { allow, wrap } from '../middleware.js';

const r = Router();
const customer = allow('customer');
const isCustomer = (u) => u.role === 'customer';

// A customer may only touch domains of their own organization
async function domainAccess(req, res, domainId) {
  const [rows] = await pool.query('SELECT org_id FROM domains WHERE domain_id = ?', [domainId]);
  const d = rows[0];
  if (!d || (isCustomer(req.user) && d.org_id !== req.user.org_id)) {
    res.status(404).json({ error: 'Domain not found' });
    return false;
  }
  return true;
}

// ---- IP addresses that are in use ----
r.get('/ips', wrap(async (req, res) => {
  const u = req.user;
  const [rows] = await pool.query(
    `SELECT * FROM v_org_ips ${isCustomer(u) ? 'WHERE org_id = ?' : ''} ORDER BY region_code, ip_address`,
    isCustomer(u) ? [u.org_id || 0] : []);
  res.json(rows);
}));

// ---- domains ----
r.get('/domains', wrap(async (req, res) => {
  const u = req.user;
  const [rows] = await pool.query(
    `SELECT * FROM v_domains ${isCustomer(u) ? 'WHERE org_id = ?' : ''} ORDER BY expires_on`,
    isCustomer(u) ? [u.org_id || 0] : []);
  res.json(rows);
}));

r.post('/domains', customer, wrap(async (req, res) => {
  const name = String(req.body.name || '').trim().toLowerCase();
  const [out] = await withUser(req.user, (c) => c.query('CALL sp_register_domain(?,?,?)', [req.user.org_id, name, req.body.years || 1]));
  res.status(201).json(out[0][0]);
}));

r.post('/domains/:id/renew', customer, wrap(async (req, res) => {
  await withUser(req.user, (c) => c.query('CALL sp_renew_domain(?,?,?)', [req.params.id, req.user.org_id, req.body.years || 1]));
  res.json({ ok: true });
}));

// ---- DNS records ----
r.get('/domains/:id/records', wrap(async (req, res) => {
  if (!(await domainAccess(req, res, req.params.id))) return;
  const [rows] = await pool.query('SELECT * FROM dns_records WHERE domain_id = ? ORDER BY rtype, name', [req.params.id]);
  res.json(rows);
}));

const cleanRecord = (b) => ({
  rtype: String(b.rtype || '').toUpperCase(),
  name: String(b.name || '@').trim().toLowerCase(),
  value: b.rtype === 'TXT' ? String(b.value || '') : String(b.value || '').trim().toLowerCase(),
  ttl: Number(b.ttl || 3600),
  priority: b.priority === '' || b.priority === undefined || b.priority === null ? null : Number(b.priority),
});

r.post('/domains/:id/records', customer, wrap(async (req, res) => {
  if (!(await domainAccess(req, res, req.params.id))) return;
  const x = cleanRecord(req.body);
  const [out] = await withUser(req.user, (c) => c.query(
    'INSERT INTO dns_records(domain_id, rtype, name, value, ttl, priority) VALUES (?,?,?,?,?,?)',
    [req.params.id, x.rtype, x.name, x.value, x.ttl, x.priority]));
  res.status(201).json({ record_id: out.insertId });
}));

// record -> its domain -> check ownership
async function recordAccess(req, res) {
  const [rows] = await pool.query('SELECT domain_id FROM dns_records WHERE record_id = ?', [req.params.id]);
  if (!rows[0]) { res.status(404).json({ error: 'Record not found' }); return null; }
  return (await domainAccess(req, res, rows[0].domain_id)) ? rows[0].domain_id : null;
}

r.put('/records/:id', customer, wrap(async (req, res) => {
  if (!(await recordAccess(req, res))) return;
  const x = cleanRecord(req.body);
  await withUser(req.user, (c) => c.query(
    'UPDATE dns_records SET rtype = ?, name = ?, value = ?, ttl = ?, priority = ? WHERE record_id = ?',
    [x.rtype, x.name, x.value, x.ttl, x.priority, req.params.id]));
  res.json({ ok: true });
}));

r.delete('/records/:id', customer, wrap(async (req, res) => {
  if (!(await recordAccess(req, res))) return;
  await withUser(req.user, (c) => c.query('DELETE FROM dns_records WHERE record_id = ?', [req.params.id]));
  res.json({ ok: true });
}));

export default r;