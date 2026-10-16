import { Router } from 'express';
import { pool, withUser } from '../db.js';
import { allow, wrap } from '../middleware.js';

const r = Router();
const view = allow('super_admin', 'support');
const manage = allow('super_admin');

// ---- capacity: per-host view plus per-region totals with a grand-total row (ROLLUP) ----
r.get('/capacity', view, wrap(async (_req, res) => {
  const [hosts] = await pool.query('SELECT * FROM v_host_capacity ORDER BY region_name, hostname');
  const [regions] = await pool.query(
    `SELECT IF(GROUPING(r.name), 'All regions', r.name) AS region, GROUPING(r.name) AS is_total,
            COUNT(*) AS hosts,
            SUM(h.total_vcpu) AS total_vcpu, SUM(h.used_vcpu) AS used_vcpu,
            SUM(h.total_ram_gb) AS total_ram_gb, SUM(h.used_ram_gb) AS used_ram_gb,
            SUM(h.total_disk_gb) AS total_disk_gb, SUM(h.used_disk_gb) AS used_disk_gb,
            ROUND(100 * SUM(h.used_vcpu) / SUM(h.total_vcpu), 1) AS cpu_pct,
            ROUND(100 * SUM(h.used_ram_gb) / SUM(h.total_ram_gb), 1) AS ram_pct
     FROM hosts h JOIN regions r ON r.region_id = h.region_id
     WHERE h.status = 'active'
     GROUP BY r.name WITH ROLLUP`);
  res.json({ hosts, regions });
}));

// ---- hosts ----
r.post('/hosts', manage, wrap(async (req, res) => {
  const b = req.body;
  const out = await withUser(req.user, (c) => c.query(
    'INSERT INTO hosts(region_id, hostname, total_vcpu, total_ram_gb, total_disk_gb) VALUES (?,?,?,?,?)',
    [b.region_id, b.hostname, b.total_vcpu, b.total_ram_gb, b.total_disk_gb]));
  res.status(201).json({ host_id: out[0].insertId });
}));

r.put('/hosts/:id', manage, wrap(async (req, res) => {
  const b = req.body;
  await withUser(req.user, (c) => c.query(
    'UPDATE hosts SET status = ?, total_vcpu = ?, total_ram_gb = ?, total_disk_gb = ? WHERE host_id = ?',
    [b.status, b.total_vcpu, b.total_ram_gb, b.total_disk_gb, req.params.id]));
  res.json({ ok: true });
}));

// ---- regions ----
r.get('/regions', view, wrap(async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT r.*, COUNT(h.host_id) AS hosts
     FROM regions r LEFT JOIN hosts h ON h.region_id = r.region_id
     GROUP BY r.region_id ORDER BY r.name`);
  res.json(rows);
}));

r.post('/regions', manage, wrap(async (req, res) => {
  const b = req.body;
  const out = await withUser(req.user, (c) => c.query(
    'INSERT INTO regions(code, name, country) VALUES (?,?,?)', [b.code, b.name, b.country]));
  res.status(201).json({ region_id: out[0].insertId });
}));

r.put('/regions/:id', manage, wrap(async (req, res) => {
  const b = req.body;
  await withUser(req.user, (c) => c.query(
    'UPDATE regions SET name = ?, country = ?, status = ? WHERE region_id = ?',
    [b.name, b.country, b.status, req.params.id]));
  res.json({ ok: true });
}));

// ---- instance types (all, including inactive) ----
r.get('/instance-types', allow('super_admin', 'billing', 'support'), wrap(async (_req, res) => {
  const [rows] = await pool.query('SELECT * FROM v_current_pricing ORDER BY vcpu, ram_gb, name');
  res.json(rows);
}));

r.post('/instance-types', manage, wrap(async (req, res) => {
  const b = req.body;
  const out = await withUser(req.user, (c) => c.query(
    'INSERT INTO instance_types(name, family, vcpu, ram_gb, disk_gb) VALUES (?,?,?,?,?)',
    [b.name, b.family, b.vcpu, b.ram_gb, b.disk_gb]));
  res.status(201).json({ type_id: out[0].insertId });
}));

r.put('/instance-types/:id', manage, wrap(async (req, res) => {
  const b = req.body;
  await withUser(req.user, (c) => c.query(
    'UPDATE instance_types SET name = ?, family = ?, vcpu = ?, ram_gb = ?, disk_gb = ?, active = ? WHERE type_id = ?',
    [b.name, b.family, b.vcpu, b.ram_gb, b.disk_gb, b.active ? 1 : 0, req.params.id]));
  res.json({ ok: true });
}));

export default r;
