import { Router } from 'express';
import { pool, DB_NAME } from '../db.js';
import { wrap } from '../middleware.js';

const r = Router();

// Public: used by the frontend home page to prove the whole chain works
r.get('/', wrap(async (_req, res) => {
  const [[v]] = await pool.query('SELECT VERSION() AS version, @@event_scheduler AS event_scheduler');
  const [[t]] = await pool.query(
    `SELECT COUNT(*) AS tables_count FROM information_schema.tables
     WHERE table_schema = ? AND table_type = 'BASE TABLE' AND table_name NOT LIKE '\\_%'`, [DB_NAME]);
  const [[m]] = await pool.query('SELECT COUNT(*) AS n, MAX(filename) AS latest FROM _migrations');
  res.json({ api: 'ok', database: DB_NAME, mysql_version: v.version,
             event_scheduler: v.event_scheduler, tables: t.tables_count,
             migrations: m.n, latest_migration: m.latest });
}));

export default r;
