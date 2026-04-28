import pkg from 'pg';
const { Pool } = pkg;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL manquant. Créez un .env (voir .env.example).');
}

const isLocal = /\b(localhost|127\.0\.0\.1)\b/.test(process.env.DATABASE_URL);

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30_000,
});

pool.on('error', (err) => {
  console.error('[pg pool error]', err);
});

export async function query(text, params) {
  const res = await pool.query(text, params);
  return res;
}
