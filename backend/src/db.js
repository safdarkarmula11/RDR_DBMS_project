import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

export const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
};
export const DB_NAME = process.env.DB_NAME || 'nimbushost';

export const pool = mysql.createPool({
  ...dbConfig,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,
});

// Run work on one connection with @app_user_id set, so audit triggers record WHO made the change.
// Every write route must go through this helper.
export async function withUser(user, fn) {
  const conn = await pool.getConnection();
  try {
    await conn.query('SET @app_user_id = ?', [user?.user_id ?? 0]);
    return await fn(conn);
  } finally {
    await conn.query('SET @app_user_id = NULL');
    conn.release();
  }
}
