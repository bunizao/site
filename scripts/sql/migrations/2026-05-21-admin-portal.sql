-- Dev portal: subscriber channels + broadcast log
-- Apply via: bunx wrangler d1 execute <db-name> --file=scripts/sql/migrations/2026-05-21-admin-portal.sql
-- Apply once to databases that do not yet have notify_subscribers.channels.

ALTER TABLE notify_subscribers
  ADD COLUMN channels TEXT NOT NULL DEFAULT '["mood"]';

CREATE TABLE notify_audit_admin_portal_migration (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'subscribe_requested',
    'subscription_confirmed',
    'unsubscribed',
    'admin_create',
    'admin_update',
    'admin_delete',
    'admin_resend_confirm',
    'broadcast_sent'
  )),
  email_hash TEXT NOT NULL,
  email TEXT NOT NULL,
  source TEXT NOT NULL,
  user_agent TEXT,
  ip_hash TEXT,
  token_hash TEXT,
  created_at TEXT NOT NULL
);

INSERT INTO notify_audit_admin_portal_migration (
  id,
  event_type,
  email_hash,
  email,
  source,
  user_agent,
  ip_hash,
  token_hash,
  created_at
)
SELECT
  id,
  event_type,
  email_hash,
  email,
  source,
  user_agent,
  ip_hash,
  token_hash,
  created_at
FROM notify_audit;

DROP TABLE notify_audit;
ALTER TABLE notify_audit_admin_portal_migration RENAME TO notify_audit;

CREATE INDEX IF NOT EXISTS idx_notify_audit_email_hash_created_at
  ON notify_audit(email_hash, created_at);

CREATE INDEX IF NOT EXISTS idx_notify_audit_event_type_created_at
  ON notify_audit(event_type, created_at);

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
