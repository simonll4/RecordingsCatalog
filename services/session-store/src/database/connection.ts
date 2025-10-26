import { Pool, PoolClient } from 'pg';
import { CONFIG } from '../config/config.js';

/**
 * PostgreSQL connection pool
 */
export const pool = new Pool({ 
  connectionString: CONFIG.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

/**
 * Get a client from the pool for transactions
 */
export async function getClient(): Promise<PoolClient> {
  return pool.connect();
}

/**
 * Health check for database connection
 */
export async function healthCheck(): Promise<boolean> {
  try {
    const result = await pool.query('SELECT 1');
    return result.rowCount === 1;
  } catch (error) {
    console.error('Database health check failed', error);
    return false;
  }
}

/**
 * Close the database connection pool
 */
export async function closeConnection(): Promise<void> {
  await pool.end();
}
