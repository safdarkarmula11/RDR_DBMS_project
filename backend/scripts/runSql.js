// Applies database/NN_*.sql files in order. Files that were already applied are skipped
// (tracked in the _migrations table), so you can run it again after pulling new steps.
//   npm run db:setup    create the database if missing and apply NEW files only
//   npm run db:reset    DROP the database (destroys all data) and apply every file
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { dbConfig, DB_NAME } from '../src/db.js';
import { splitSql } from '../src/lib/splitSql.js';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../database');
const reset = process.argv.includes('--reset');
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');

const files = fs.readdirSync(dir).filter((f) => /^\d\d_.*\.sql$/.test(f)).sort();
const conn = await mysql.createConnection(dbConfig);

try {
  if (reset) {
    console.log(`Dropping database ${DB_NAME} ...`);
    await conn.query(`DROP DATABASE IF EXISTS \`${DB_NAME}\``);
  }
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.query(`USE \`${DB_NAME}\``);
  await conn.query(`CREATE TABLE IF NOT EXISTS _migrations (
      filename   VARCHAR(120) PRIMARY KEY,
      checksum   CHAR(64) NOT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`);

  // Databases created by legacy runners might have no _migrations rows yet: adopt them if the files exist.
  const [[cnt]] = await conn.query('SELECT COUNT(*) AS c FROM _migrations');
  if (cnt.c === 0) {
    const [legacy] = await conn.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'users'`);
    if (legacy.length) {
      for (const f of ['01_core_identity.sql', '02_seed_core.sql']) {
        const filePath = path.join(dir, f);
        if (fs.existsSync(filePath)) {
          await conn.query('INSERT IGNORE INTO _migrations(filename, checksum) VALUES (?,?)',
            [f, sha(fs.readFileSync(filePath, 'utf8'))]);
        }
      }
    }
  }

  const [rows] = await conn.query('SELECT filename, checksum FROM _migrations');
  const applied = new Map(rows.map((r) => [r.filename, r.checksum]));
  let ran = 0;

  for (const f of files) {
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    if (applied.has(f)) {
      if (applied.get(f) !== sha(text)) {
        console.error(`\n${f} was edited after it was applied. Do not edit applied files: add a new numbered file,\n` +
                      `or (development only) run: npm run db:reset`);
        process.exit(1);
      }
      console.log(`${f} ... already applied`);
      continue;
    }
    const stmts = splitSql(text);
    process.stdout.write(`${f} (${stmts.length} statements) ... `);
    for (const [i, s] of stmts.entries()) {
      try { await conn.query(s); }
      catch (e) {
        console.error(`\nFAILED in ${f}, statement ${i + 1}:\n${s.slice(0, 400)}\n-> ${e.message}`);
        console.error('\nA failed file may be partly applied. Fix it, then run: npm run db:reset');
        process.exit(1);
      }
    }
    await conn.query('INSERT INTO _migrations(filename, checksum) VALUES (?,?)', [f, sha(text)]);
    console.log('ok');
    ran++;
  }
  console.log(ran ? `\nApplied ${ran} new file(s).` : '\nDatabase already up to date.');
  if (reset) console.log('Database was reset: run  npm run seed-users  again.');
} finally {
  await conn.end();
}
