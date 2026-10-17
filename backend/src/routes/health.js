import { Router } from 'express';
import { pools, DB_NAME } from '../db.js';

const router = Router();

// Public: used by frontend home page and load balancers
router.get('/', async (_req, res, next) => {
  try {
    const [[v]] = await pools.customer.execute(
      'SELECT VERSION() AS version, @@event_scheduler AS event_scheduler'
    );
    const [[t]] = await pools.customer.execute(
      `SELECT COUNT(*) AS tables_count FROM information_schema.tables
       WHERE table_schema = ? AND table_type = 'BASE TABLE' AND table_name NOT LIKE '\\_%'`,
      [DB_NAME]
    );

    let migrations = 0;
    let latest = null;
    try {
      const [[m]] = await pools.customer.execute(
        'SELECT COUNT(*) AS n, MAX(filename) AS latest FROM _migrations'
      );
      migrations = m.n;
      latest = m.latest;
    } catch {
      // _migrations may not exist yet on fresh installations
    }

    res.json({
      api: 'ok',
      database: DB_NAME,
      mysql_version: v.version,
      event_scheduler: v.event_scheduler,
      tables: t.tables_count,
      migrations,
      latest_migration: latest,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
