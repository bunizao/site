CREATE TABLE IF NOT EXISTS office_asset_versions (
  room_id TEXT NOT NULL,
  asset_path TEXT NOT NULL,
  version_id TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  PRIMARY KEY (room_id, asset_path, version_id)
);

CREATE TABLE IF NOT EXISTS office_asset_state (
  room_id TEXT NOT NULL,
  asset_path TEXT NOT NULL,
  current_version_id TEXT,
  default_version_id TEXT,
  previous_version_id TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (room_id, asset_path)
);

CREATE TABLE IF NOT EXISTS office_asset_positions (
  room_id TEXT NOT NULL,
  asset_key TEXT NOT NULL,
  x REAL NOT NULL,
  y REAL NOT NULL,
  scale REAL NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (room_id, asset_key)
);

CREATE TABLE IF NOT EXISTS office_asset_defaults (
  room_id TEXT NOT NULL,
  asset_key TEXT NOT NULL,
  x REAL NOT NULL,
  y REAL NOT NULL,
  scale REAL NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (room_id, asset_key)
);

CREATE TABLE IF NOT EXISTS office_home_favorites (
  room_id TEXT NOT NULL,
  favorite_id TEXT NOT NULL,
  asset_path TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  content_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (room_id, favorite_id)
);

CREATE TABLE IF NOT EXISTS office_gemini_config (
  room_id TEXT NOT NULL PRIMARY KEY,
  cipher_text TEXT NOT NULL,
  iv_b64 TEXT NOT NULL,
  model TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_office_asset_versions_lookup
  ON office_asset_versions (room_id, asset_path, created_at);

CREATE INDEX IF NOT EXISTS idx_office_home_favorites_lookup
  ON office_home_favorites (room_id, created_at DESC);
