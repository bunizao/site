CREATE TABLE IF NOT EXISTS notify_subscribers (
  email_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'unsubscribed')),
  delivery_mode TEXT CHECK (delivery_mode IN ('immediate', 'every_5h', 'daily')),
  timezone TEXT,
  daily_hour INTEGER CHECK (daily_hour BETWEEN 0 AND 23),
  pending_delivery_mode TEXT CHECK (pending_delivery_mode IN ('immediate', 'every_5h', 'daily')),
  pending_timezone TEXT,
  pending_daily_hour INTEGER CHECK (pending_daily_hour BETWEEN 0 AND 23),
  last_notified_at TEXT,
  last_notified_post_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  confirmed_at TEXT,
  last_confirm_sent_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_notify_subscribers_status
ON notify_subscribers(status);

CREATE TABLE IF NOT EXISTS notify_sent (
  post_id TEXT NOT NULL,
  email_hash TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  resend_id TEXT,
  PRIMARY KEY (post_id, email_hash)
);

CREATE INDEX IF NOT EXISTS idx_notify_sent_sent_at
ON notify_sent(sent_at);

CREATE TABLE IF NOT EXISTS notify_retries (
  post_id TEXT NOT NULL,
  email_hash TEXT NOT NULL,
  email TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  next_attempt_at TEXT NOT NULL,
  last_error TEXT NOT NULL,
  PRIMARY KEY (post_id, email_hash)
);

CREATE INDEX IF NOT EXISTS idx_notify_retries_next_attempt
ON notify_retries(next_attempt_at);

CREATE TABLE IF NOT EXISTS notify_dead_letters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id TEXT NOT NULL,
  email_hash TEXT NOT NULL,
  email TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_error TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notify_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL CHECK (event_type IN ('subscribe_requested', 'subscription_confirmed', 'unsubscribed')),
  email_hash TEXT NOT NULL,
  email TEXT NOT NULL,
  source TEXT NOT NULL,
  user_agent TEXT,
  ip_hash TEXT,
  token_hash TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notify_audit_email_hash_created_at
ON notify_audit(email_hash, created_at);

CREATE INDEX IF NOT EXISTS idx_notify_audit_event_type_created_at
ON notify_audit(event_type, created_at);
