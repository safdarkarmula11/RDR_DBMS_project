import mysql from 'mysql2/promise';
import { config } from './config.js';

const basePoolOptions = {
  host: config.db.host,
  port: config.db.port,
  database: config.db.database,
  decimalNumbers: false,
  multipleStatements: false,
  namedPlaceholders: false,
  connectTimeout: 10000,
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,
};

// 4 role-specific pools: admin, support, billing, customer
export const pools = {
  admin: mysql.createPool({
    ...basePoolOptions,
    user: config.db.roles.admin.user,
    password: config.db.roles.admin.password,
  }),
  support: mysql.createPool({
    ...basePoolOptions,
    user: config.db.roles.support.user,
    password: config.db.roles.support.password,
  }),
  billing: mysql.createPool({
    ...basePoolOptions,
    user: config.db.roles.billing.user,
    password: config.db.roles.billing.password,
  }),
  customer: mysql.createPool({
    ...basePoolOptions,
    user: config.db.roles.customer.user,
    password: config.db.roles.customer.password,
  }),
};

// Backwards compatibility for existing scripts
export const pool = pools.admin;
export const dbConfig = {
  host: config.db.host,
  port: config.db.port,
  user: config.db.baseUser,
  password: config.db.basePassword,
};
export const DB_NAME = config.db.database;

export function getPool(role) {
  switch (role) {
    case 'super_admin':
      return pools.admin;
    case 'support':
      return pools.support;
    case 'billing':
      return pools.billing;
    case 'customer':
    default:
      return pools.customer;
  }
}

/**
 * withDb(req, fn) - Critical helper for setting tenant/user context per query connection.
 * Sets MySQL session variables @app_user_id, @app_org_id, @app_role, executes fn,
 * and clears them in finally before releasing connection back to pool.
 */
export async function withDb(req, fn) {
  const role = req.user?.role || 'customer';
  const selectedPool = getPool(role);
  const conn = await selectedPool.getConnection();
  try {
    await conn.execute('SET @app_user_id = ?, @app_org_id = ?, @app_role = ?', [
      req.user?.sub || 0,
      req.user?.org_id || null,
      role,
    ]);
    return await fn(conn);
  } finally {
    try {
      await conn.execute('SET @app_user_id = NULL, @app_org_id = NULL, @app_role = NULL');
    } catch {
      // Ignore cleanup error if connection severed
    }
    conn.release();
  }
}

/**
 * withTransactionRetry(conn, fn, maxRetries = 3)
 * Retries on errno 1213 (deadlock) and 1205 (lock wait timeout)
 * with jittered exponential backoff.
 */
export async function withTransactionRetry(conn, fn, maxRetries = 3) {
  let attempt = 0;
  while (true) {
    try {
      await conn.beginTransaction();
      const result = await fn(conn);
      await conn.commit();
      return result;
    } catch (err) {
      await conn.rollback().catch(() => {});
      const isDeadlockOrTimeout = err.errno === 1213 || err.errno === 1205;
      if (isDeadlockOrTimeout && attempt < maxRetries) {
        attempt++;
        const backoff = Math.pow(2, attempt) * 50 + Math.random() * 50;
        await new Promise((resolve) => setTimeout(resolve, backoff));
        continue;
      }
      throw err;
    }
  }
}
