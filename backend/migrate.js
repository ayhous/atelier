import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool } from './db.js';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    avatar TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- Migration idempotente pour les bases existantes (ajout avatar)
  ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT;

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    order_type TEXT NOT NULL DEFAULT 'Zone 53',
    order_number TEXT NOT NULL,
    client TEXT NOT NULL,
    carton_type TEXT,
    carton_count INTEGER NOT NULL DEFAULT 1,
    note TEXT,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ,
    updated_by TEXT
  );

  -- Migration idempotente pour les bases existantes (ajout carton_count)
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS carton_count INTEGER NOT NULL DEFAULT 1;

  CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
  CREATE INDEX IF NOT EXISTS idx_orders_client ON orders(client);
  CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
  CREATE INDEX IF NOT EXISTS idx_orders_type ON orders(order_type);

  CREATE TABLE IF NOT EXISTS order_history (
    id SERIAL PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    field TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    changed_by TEXT NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS todos (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    details TEXT,
    due_date DATE,
    requested_by TEXT,
    done BOOLEAN NOT NULL DEFAULT FALSE,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
  );

  CREATE INDEX IF NOT EXISTS idx_todos_done ON todos(done);
  CREATE INDEX IF NOT EXISTS idx_todos_due_date ON todos(due_date);
`;

export async function migrate() {
  await pool.query(SCHEMA);
}

export async function ensureDefaultAdmin() {
  const username = process.env.DEFAULT_ADMIN_USER || 'admin';
  const password = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';
  const displayName = process.env.DEFAULT_ADMIN_NAME || 'Administrateur';

  const existing = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
  if (existing.rows.length) return;

  const hash = bcrypt.hashSync(password, 10);
  await pool.query(
    'INSERT INTO users (username, password_hash, display_name, role) VALUES ($1, $2, $3, $4)',
    [username, hash, displayName, 'admin'],
  );
  console.log(`[init] Admin créé : ${username} / ${password} (changez-le !)`);
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  (async () => {
    try {
      console.log('[migrate] Création des tables...');
      await migrate();
      console.log('[migrate] Vérification admin par défaut...');
      await ensureDefaultAdmin();
      console.log('[migrate] OK');
      await pool.end();
    } catch (err) {
      console.error('[migrate] Erreur:', err.message);
      process.exit(1);
    }
  })();
}
