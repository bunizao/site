/**
 * Migrate notify data from Cloudflare KV to Cloudflare D1.
 *
 * Required environment variables:
 * - CLOUDFLARE_ACCOUNT_ID
 * - CLOUDFLARE_API_TOKEN
 * - CLOUDFLARE_NOTIFY_D1_DATABASE_ID
 * - CLOUDFLARE_NOTIFY_KV_NAMESPACE_ID (preferred) or CLOUDFLARE_KV_NAMESPACE_ID
 *
 * Run:
 *   bunx tsx scripts/migrate-notify-kv-to-d1.ts
 */

interface CloudflareKvListEntry {
  name: string;
}

interface CloudflareKvListResponse {
  result?: CloudflareKvListEntry[];
  result_info?: {
    cursor?: string;
  };
}

interface CloudflareD1Response {
  success?: boolean;
  errors?: Array<{ message?: string }>;
  result?: Array<{
    success?: boolean;
    error?: string;
    results?: unknown[];
  }>;
}

interface SubscriberRecord {
  email: string;
  emailHash: string;
  status: 'pending' | 'active' | 'unsubscribed';
  deliveryMode?: 'immediate' | 'every_5h' | 'daily';
  timezone?: string;
  dailyHour?: number;
  pendingDeliveryMode?: 'immediate' | 'every_5h' | 'daily';
  pendingTimezone?: string;
  pendingDailyHour?: number;
  lastNotifiedAt?: string;
  lastNotifiedPostId?: string;
  createdAt: string;
  updatedAt: string;
  confirmedAt?: string;
  lastConfirmSentAt?: string;
}

interface SentRecord {
  postId: string;
  emailHash: string;
  sentAt: string;
  resendId?: string;
}

interface RetryRecord {
  postId: string;
  email: string;
  emailHash: string;
  attempt: number;
  createdAt: string;
  updatedAt: string;
  nextAttemptAt: string;
  lastError: string;
}

interface DeadRecord {
  postId: string;
  email: string;
  emailHash: string;
  attempt: number;
  createdAt: string;
  updatedAt: string;
  lastError: string;
}

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getOptionalEnv(name: string): string {
  return process.env[name]?.trim() ?? '';
}

function nullableText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function nullableInt(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

function extractErrors(payload: CloudflareD1Response | null | undefined): string {
  const messages = (payload?.errors ?? [])
    .map((entry) => (entry?.message || '').trim())
    .filter(Boolean);
  return messages.join('; ');
}

class CloudflareNotifyMigrator {
  constructor(
    private readonly accountId: string,
    private readonly apiToken: string,
    private readonly kvNamespaceId: string,
    private readonly d1DatabaseId: string
  ) {}

  private buildKvUrl(path: string): string {
    return `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/storage/kv/namespaces/${this.kvNamespaceId}${path}`;
  }

  private buildD1Url(): string {
    return `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/d1/database/${this.d1DatabaseId}/query`;
  }

  private async fetchWithAuth(url: string, init: RequestInit = {}): Promise<Response> {
    return fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        ...(init.headers || {}),
      },
    });
  }

  private async listKvKeys(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '';
    const seen = new Set<string>();

    while (true) {
      if (cursor) {
        if (seen.has(cursor)) break;
        seen.add(cursor);
      }

      const params = new URLSearchParams({
        prefix,
        limit: '1000',
      });
      if (cursor) params.set('cursor', cursor);

      const response = await this.fetchWithAuth(this.buildKvUrl(`/keys?${params.toString()}`), {
        method: 'GET',
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`KV list failed (${response.status}): ${text}`);
      }

      const payload = (await response.json()) as CloudflareKvListResponse;
      const batch = payload.result?.map((entry) => entry.name).filter(Boolean) ?? [];
      keys.push(...batch);

      cursor = payload.result_info?.cursor ?? '';
      if (!cursor || batch.length === 0) {
        break;
      }
    }

    return keys;
  }

  private async getKvValue(key: string): Promise<string | null> {
    const response = await this.fetchWithAuth(
      this.buildKvUrl(`/values/${encodeURIComponent(key)}`),
      { method: 'GET' }
    );

    if (response.status === 404) return null;
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`KV get failed for ${key} (${response.status}): ${text}`);
    }

    return response.text();
  }

  private async d1Run(sql: string, params: unknown[] = []): Promise<void> {
    const response = await this.fetchWithAuth(this.buildD1Url(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql, params }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`D1 query failed (${response.status}): ${text}`);
    }

    const payload = (await response.json()) as CloudflareD1Response;
    if (!payload?.success) {
      throw new Error(`D1 query failed: ${extractErrors(payload) || 'unknown error'}`);
    }

    const statement = payload.result?.[0];
    if (statement?.success === false) {
      throw new Error(`D1 statement failed: ${statement.error || extractErrors(payload) || 'unknown error'}`);
    }
  }

  private parseJson<T>(raw: string, key: string): T | null {
    try {
      return JSON.parse(raw) as T;
    } catch {
      console.warn(`Skipping invalid JSON for key: ${key}`);
      return null;
    }
  }

  async migrateSubscribers(): Promise<{ scanned: number; migrated: number; skipped: number }> {
    const keys = await this.listKvKeys('notify:subscriber:');
    let migrated = 0;
    let skipped = 0;

    for (const key of keys) {
      const raw = await this.getKvValue(key);
      if (!raw) {
        skipped += 1;
        continue;
      }

      const record = this.parseJson<SubscriberRecord>(raw, key);
      if (!record?.email || !record?.emailHash || !record?.status || !record?.createdAt || !record?.updatedAt) {
        skipped += 1;
        continue;
      }

      await this.d1Run(
        `INSERT INTO notify_subscribers (
          email,
          email_hash,
          status,
          delivery_mode,
          timezone,
          daily_hour,
          pending_delivery_mode,
          pending_timezone,
          pending_daily_hour,
          last_notified_at,
          last_notified_post_id,
          created_at,
          updated_at,
          confirmed_at,
          last_confirm_sent_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(email_hash) DO UPDATE SET
          email = excluded.email,
          status = excluded.status,
          delivery_mode = excluded.delivery_mode,
          timezone = excluded.timezone,
          daily_hour = excluded.daily_hour,
          pending_delivery_mode = excluded.pending_delivery_mode,
          pending_timezone = excluded.pending_timezone,
          pending_daily_hour = excluded.pending_daily_hour,
          last_notified_at = excluded.last_notified_at,
          last_notified_post_id = excluded.last_notified_post_id,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at,
          confirmed_at = excluded.confirmed_at,
          last_confirm_sent_at = excluded.last_confirm_sent_at`,
        [
          record.email,
          record.emailHash,
          record.status,
          nullableText(record.deliveryMode),
          nullableText(record.timezone),
          nullableInt(record.dailyHour),
          nullableText(record.pendingDeliveryMode),
          nullableText(record.pendingTimezone),
          nullableInt(record.pendingDailyHour),
          nullableText(record.lastNotifiedAt),
          nullableText(record.lastNotifiedPostId),
          record.createdAt,
          record.updatedAt,
          nullableText(record.confirmedAt),
          nullableText(record.lastConfirmSentAt),
        ]
      );

      migrated += 1;
    }

    return { scanned: keys.length, migrated, skipped };
  }

  async migrateSent(): Promise<{ scanned: number; migrated: number; skipped: number }> {
    const keys = await this.listKvKeys('notify:sent:');
    let migrated = 0;
    let skipped = 0;

    for (const key of keys) {
      const raw = await this.getKvValue(key);
      if (!raw) {
        skipped += 1;
        continue;
      }

      const fromKey = key.match(/^notify:sent:([^:]+):(.+)$/);
      const parsed = this.parseJson<SentRecord>(raw, key);
      const postId = parsed?.postId || fromKey?.[1] || '';
      const emailHash = parsed?.emailHash || fromKey?.[2] || '';
      const sentAt = parsed?.sentAt || new Date().toISOString();

      if (!postId || !emailHash) {
        skipped += 1;
        continue;
      }

      await this.d1Run(
        `INSERT INTO notify_sent (post_id, email_hash, sent_at, resend_id)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(post_id, email_hash) DO UPDATE SET
           sent_at = excluded.sent_at,
           resend_id = excluded.resend_id`,
        [postId, emailHash, sentAt, nullableText(parsed?.resendId)]
      );

      migrated += 1;
    }

    return { scanned: keys.length, migrated, skipped };
  }

  async migrateRetries(): Promise<{ scanned: number; migrated: number; skipped: number }> {
    const keys = await this.listKvKeys('notify:retry:');
    let migrated = 0;
    let skipped = 0;

    for (const key of keys) {
      const raw = await this.getKvValue(key);
      if (!raw) {
        skipped += 1;
        continue;
      }

      const fromKey = key.match(/^notify:retry:([^:]+):(.+)$/);
      const record = this.parseJson<RetryRecord>(raw, key);

      const postId = record?.postId || fromKey?.[1] || '';
      const emailHash = record?.emailHash || fromKey?.[2] || '';
      const email = record?.email || '';
      const attempt = typeof record?.attempt === 'number' ? record.attempt : 1;
      const createdAt = record?.createdAt || new Date().toISOString();
      const updatedAt = record?.updatedAt || createdAt;
      const nextAttemptAt = record?.nextAttemptAt || updatedAt;
      const lastError = (record?.lastError || 'unknown').slice(0, 500);

      if (!postId || !emailHash || !email) {
        skipped += 1;
        continue;
      }

      await this.d1Run(
        `INSERT INTO notify_retries (
          post_id,
          email_hash,
          email,
          attempt,
          created_at,
          updated_at,
          next_attempt_at,
          last_error
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(post_id, email_hash) DO UPDATE SET
          email = excluded.email,
          attempt = excluded.attempt,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at,
          next_attempt_at = excluded.next_attempt_at,
          last_error = excluded.last_error`,
        [
          postId,
          emailHash,
          email,
          attempt,
          createdAt,
          updatedAt,
          nextAttemptAt,
          lastError,
        ]
      );

      migrated += 1;
    }

    return { scanned: keys.length, migrated, skipped };
  }

  async migrateDeadLetters(): Promise<{ scanned: number; migrated: number; skipped: number }> {
    const keys = await this.listKvKeys('notify:dead:');
    let migrated = 0;
    let skipped = 0;

    for (const key of keys) {
      const raw = await this.getKvValue(key);
      if (!raw) {
        skipped += 1;
        continue;
      }

      const fromKey = key.match(/^notify:dead:([^:]+):([^:]+):\d+$/);
      const record = this.parseJson<DeadRecord>(raw, key);
      const postId = record?.postId || fromKey?.[1] || '';
      const emailHash = record?.emailHash || fromKey?.[2] || '';
      const email = record?.email || '';
      const attempt = typeof record?.attempt === 'number' ? record.attempt : 1;
      const createdAt = record?.createdAt || new Date().toISOString();
      const updatedAt = record?.updatedAt || createdAt;
      const lastError = (record?.lastError || 'unknown').slice(0, 500);

      if (!postId || !emailHash || !email) {
        skipped += 1;
        continue;
      }

      await this.d1Run(
        `INSERT INTO notify_dead_letters (
          post_id,
          email_hash,
          email,
          attempt,
          created_at,
          updated_at,
          last_error
        )
        SELECT ?, ?, ?, ?, ?, ?, ?
        WHERE NOT EXISTS (
          SELECT 1
          FROM notify_dead_letters
          WHERE post_id = ?
            AND email_hash = ?
            AND created_at = ?
            AND updated_at = ?
            AND last_error = ?
        )`,
        [
          postId,
          emailHash,
          email,
          attempt,
          createdAt,
          updatedAt,
          lastError,
          postId,
          emailHash,
          createdAt,
          updatedAt,
          lastError,
        ]
      );

      migrated += 1;
    }

    return { scanned: keys.length, migrated, skipped };
  }
}

async function main(): Promise<void> {
  const accountId = getRequiredEnv('CLOUDFLARE_ACCOUNT_ID');
  const apiToken = getRequiredEnv('CLOUDFLARE_API_TOKEN');
  const d1DatabaseId = getRequiredEnv('CLOUDFLARE_NOTIFY_D1_DATABASE_ID');
  const kvNamespaceId =
    getOptionalEnv('CLOUDFLARE_NOTIFY_KV_NAMESPACE_ID')
    || getRequiredEnv('CLOUDFLARE_KV_NAMESPACE_ID');

  const migrator = new CloudflareNotifyMigrator(
    accountId,
    apiToken,
    kvNamespaceId,
    d1DatabaseId
  );

  console.log('Starting notify KV -> D1 migration...');
  console.log(`Source KV namespace: ${kvNamespaceId}`);
  console.log(`Target D1 database:   ${d1DatabaseId}`);

  const subscribers = await migrator.migrateSubscribers();
  console.log(`Subscribers: scanned=${subscribers.scanned}, migrated=${subscribers.migrated}, skipped=${subscribers.skipped}`);

  const sent = await migrator.migrateSent();
  console.log(`Sent records: scanned=${sent.scanned}, migrated=${sent.migrated}, skipped=${sent.skipped}`);

  const retries = await migrator.migrateRetries();
  console.log(`Retry records: scanned=${retries.scanned}, migrated=${retries.migrated}, skipped=${retries.skipped}`);

  const dead = await migrator.migrateDeadLetters();
  console.log(`Dead-letter records: scanned=${dead.scanned}, migrated=${dead.migrated}, skipped=${dead.skipped}`);

  console.log('Migration finished.');
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exitCode = 1;
});

export {};
