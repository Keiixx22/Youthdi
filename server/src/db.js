import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS merchants (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  qris_image TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  merchant_id INTEGER NOT NULL REFERENCES merchants(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','cashier')),
  active INTEGER NOT NULL DEFAULT 1
);

-- Items are deactivated, never deleted, so past transactions stay correct.
CREATE TABLE IF NOT EXISTS menu_items (
  id INTEGER PRIMARY KEY,
  merchant_id INTEGER NOT NULL REFERENCES merchants(id),
  name TEXT NOT NULL,
  price INTEGER NOT NULL CHECK (price >= 0),
  category TEXT NOT NULL DEFAULT 'Lainnya',
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY,
  merchant_id INTEGER NOT NULL REFERENCES merchants(id),
  cashier_id INTEGER NOT NULL REFERENCES users(id),
  total INTEGER NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('cash','qris')),
  cash_received INTEGER,
  change_amount INTEGER,
  note TEXT,
  client_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (merchant_id, client_id)
);
CREATE INDEX IF NOT EXISTS idx_tx_merchant_created ON transactions(merchant_id, created_at);

-- name and price are copied at time of sale, so later edits don't rewrite history.
CREATE TABLE IF NOT EXISTS transaction_items (
  id INTEGER PRIMARY KEY,
  transaction_id INTEGER NOT NULL REFERENCES transactions(id),
  menu_item_id INTEGER NOT NULL REFERENCES menu_items(id),
  name TEXT NOT NULL,
  price INTEGER NOT NULL,
  qty INTEGER NOT NULL CHECK (qty > 0),
  note TEXT
);
`;

export function openDb(file = ':memory:') {
  const db = new DatabaseSync(file);
  db.exec(SCHEMA);
  return db;
}
