import { Router } from 'express';
import { pool, withUser } from '../db.js';
import { allow, wrap } from '../middleware.js';

const r = Router();

// Price history of one instance type (newest period first)
r.get('/:typeId', allow('super_admin', 'billing'), wrap(async (req, res) => {
  const [rows] = await pool.query(
    'SELECT * FROM v_pricing_history WHERE type_id = ? ORDER BY valid_from DESC', [req.params.typeId]);
  res.json(rows);
}));

// Price as of a date, using the stored function
r.get('/:typeId/as-of/:date', allow('super_admin', 'billing'), wrap(async (req, res) => {
  const [[row]] = await pool.query('SELECT fn_hourly_price(?, ?) AS price_per_hour', [req.params.typeId, req.params.date]);
  res.json(row);
}));

// Set a new price from a date: the procedure closes the old period and opens the new one atomically
r.post('/', allow('super_admin'), wrap(async (req, res) => {
  const { type_id, price_per_hour, effective_from } = req.body;
  await withUser(req.user, (c) => c.query('CALL sp_set_price(?,?,?)', [type_id, price_per_hour, effective_from]));
  res.status(201).json({ ok: true });
}));

export default r;
