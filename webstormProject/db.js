import 'dotenv/config';
import pg from 'pg';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is missing. Create a .env file (see .env.example).');
}

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: true }, // Neon requires SSL
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000, // Neon may need a few seconds to wake from idle
});

export const query = (text, params) => pool.query(text, params);
