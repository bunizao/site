import { afterEach, describe, expect, test } from 'bun:test';
import { adminCreateSubscriber } from '../../src/features/admin/server/subscribers-admin';
import { hashEmail } from '../../src/features/notify/server/security';

interface D1ResponseOptions {
  results?: unknown[];
  changes?: number;
  success?: boolean;
  error?: string;
}

function d1Response(options: D1ResponseOptions = {}): Response {
  return new Response(JSON.stringify({
    success: true,
    errors: [],
    result: [
      {
        success: options.success ?? true,
        error: options.error,
        results: options.results ?? [],
        meta: {
          changes: options.changes ?? 0,
        },
      },
    ],
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function adminContext() {
  return {
    request: new Request('https://buxx.me/dev/portal/subscribers'),
    actor: 'tester',
    locals: {
      env: {
        CLOUDFLARE_ACCOUNT_ID: 'account',
        CLOUDFLARE_API_TOKEN: 'token',
        CLOUDFLARE_NOTIFY_D1_DATABASE_ID: 'database',
      },
    },
  };
}

describe('admin subscriber writes', () => {
  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
  });

  test('does not fail subscriber creation when the audit insert fails', async () => {
    const auditErrors: unknown[][] = [];
    const persistedEmails: string[] = [];
    console.error = (...args: unknown[]) => {
      auditErrors.push(args);
    };

    globalThis.fetch = (async (url, init) => {
      const target = String(url);
      if (target.includes('/client/v4/accounts/account/d1/database/database/query')) {
        const body = JSON.parse(String(init?.body ?? '{}')) as { sql?: string; params?: unknown[] };
        const sql = (body.sql ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

        if (sql.startsWith('select') && sql.includes('from notify_subscribers')) {
          return d1Response({ results: [] });
        }

        if (sql.startsWith('insert into notify_subscribers')) {
          persistedEmails.push(String(body.params?.[0] ?? ''));
          return d1Response({ changes: 1 });
        }

        if (sql.startsWith('insert into notify_audit')) {
          return d1Response({ success: false, error: 'CHECK constraint failed: event_type' });
        }
      }

      throw new Error(`Unexpected fetch: ${target}`);
    }) as typeof fetch;

    const result = await adminCreateSubscriber(adminContext(), {
      email: 'Reader@Buxx.me',
      status: 'active',
      channels: ['mood'],
      deliveryMode: 'immediate',
    });

    expect(result.email).toBe('reader@buxx.me');
    expect(result.emailHash).toBe(hashEmail('reader@buxx.me'));
    expect(persistedEmails).toEqual(['reader@buxx.me']);
    expect(auditErrors[0]?.[0]).toBe('Admin audit write failed:');
  });
});
