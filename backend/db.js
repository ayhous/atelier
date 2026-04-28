import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';

const DB_FILE = process.env.DB_FILE || './data/warehouse.db';

fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });

export const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    order_number TEXT NOT NULL,
    client TEXT NOT NULL,
    carton_type TEXT,
    note TEXT,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT,
    updated_by TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
  CREATE INDEX IF NOT EXISTS idx_orders_client ON orders(client);
  CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);

  CREATE TABLE IF NOT EXISTS order_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL,
    field TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    changed_by TEXT NOT NULL,
    changed_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
  );
`);

export function ensureDefaultAdmin() {
  const username = process.env.DEFAULT_ADMIN_USER || 'admin';
  const password = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';
  const displayName = process.env.DEFAULT_ADMIN_NAME || 'Administrateur';

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) return;

  const hash = bcrypt.hashSync(password, 10);
  db.prepare(
    'INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)'
  ).run(username, hash, displayName, 'admin');

  console.log(`[init] Admin créé : ${username} / ${password} (changez ce mot de passe !)`);
}
