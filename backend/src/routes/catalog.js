import { Router } from 'express';
import { pool } from '../db.js';
import { wrap } from '../middleware.js';

// Read-only catalog, visible to every logged-in user (customers use it in the launch wizard later)
const r = Router();

r.get('/regions', wrap(async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT r.region_id, r.code, r.name, r.country,
            (SELECT COUNT(*) FROM hosts h WHERE h.region_id = r.region_id AND h.status = 'active') AS active_hosts
     FROM regions r WHERE r.status = 'active' ORDER BY r.name`);
  res.json(rows);
}));

r.get('/instance-types', wrap(async (_req, res) => {
  const [rows] = await pool.query(
    'SELECT * FROM v_current_pricing WHERE active = TRUE ORDER BY vcpu, ram_gb, name');
  res.json(rows);
}));

r.get('/images', wrap(async (_req, res) => {
  const [rows] = await pool.query('SELECT * FROM images ORDER BY os_family, name, version');
  res.json(rows);
}));

export default r;
