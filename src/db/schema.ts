export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS push_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sink_key TEXT NOT NULL,
  notification_id TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  sub_index INTEGER NOT NULL,
  block_number INTEGER NOT NULL,
  event_name TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  delivered_at INTEGER,
  UNIQUE (sink_key, notification_id)
);

CREATE TABLE IF NOT EXISTS shop_listing (
  listing_id INTEGER PRIMARY KEY,
  line_count INTEGER NOT NULL DEFAULT 0,
  is_bundle INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 0,
  eth_enabled INTEGER NOT NULL DEFAULT 0,
  eth_price TEXT,
  updated_block INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS shop_listing_line (
  listing_id INTEGER NOT NULL,
  line_index INTEGER NOT NULL,
  collection_id INTEGER NOT NULL,
  token_id TEXT NOT NULL,
  amount_per_unit TEXT NOT NULL,
  PRIMARY KEY (listing_id, line_index)
);

CREATE TABLE IF NOT EXISTS shop_listing_erc20_price (
  listing_id INTEGER NOT NULL,
  token TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  price TEXT NOT NULL,
  decimals INTEGER NOT NULL DEFAULT 18,
  PRIMARY KEY (listing_id, token)
);

CREATE INDEX IF NOT EXISTS idx_listing_line_token ON shop_listing_line(token_id);
`;
