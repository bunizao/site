-- Dev portal: subscriber channels + broadcast log
-- Apply via: bunx wrangler d1 execute <db-name> --file=scripts/sql/migrations/2026-05-21-admin-portal.sql
-- Idempotent: re-running on a database that already has the column or table is a no-op.

ALTER TABLE notify_subscribers
  ADD COLUMN channels TEXT NOT NULL DEFAULT '["mood"]';

CREATE TABLE IF NOT EXISTS notify_broadcasts (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT,
  audience_json TEXT NOT NULL,
  recipient_count INTEGER NOT NULL,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('draft','sending','sent','failed')),
  created_at TEXT NOT NULL,
  sent_at TEXT,
  sent_by TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notify_broadcasts_created
  ON notify_broadcasts(created_at);

CREATE INDEX IF NOT EXISTS idx_notify_broadcasts_status
  ON notify_broadcasts(status);
