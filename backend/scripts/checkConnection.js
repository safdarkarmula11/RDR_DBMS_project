import mysql from 'mysql2/promise';
import { dbConfig, DB_NAME } from '../src/db.js';

try {
  const conn = await mysql.createConnection(dbConfig);
  const [[v]] = await conn.query('SELECT VERSION() AS v, @@event_scheduler AS ev');
  console.log(`Connected to MySQL ${v.v}`);
  const major = parseInt(v.v, 10);
  if (major < 8) console.warn('WARNING: MySQL 8.0+ is required (CHECK constraints, window functions, CTEs, SKIP LOCKED).');
  console.log(`Event scheduler: ${v.ev}  (turn on with: SET GLOBAL event_scheduler = ON;)`);
  const [dbs] = await conn.query('SHOW DATABASES LIKE ?', [DB_NAME]);
  console.log(dbs.length ? `Database "${DB_NAME}" exists.` : `Database "${DB_NAME}" not created yet. Run: npm run db:setup`);
  await conn.end();
} catch (e) {
  console.error('Connection failed:', e.message);
  console.error('Check DB_HOST / DB_USER / DB_PASSWORD in backend/.env and that MySQL is running.');
  process.exit(1);
}
