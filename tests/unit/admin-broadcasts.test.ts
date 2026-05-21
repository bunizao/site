import { afterEach, describe, expect, test } from 'bun:test';
import {
  renderBodyToHtml,
  renderBodyToText,
  sendBroadcast,
} from '../../src/features/admin/server/broadcasts';
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
    request: new Request('https://buxx.me/dev/portal/broadcasts'),
    actor: 'tester',
    locals: {
      env: {
        RESEND_API_KEY: 're_test',
        NOTIFY_FROM_EMAIL: 'news@example.com',
        PUBLIC_SITE_URL: 'https://buxx.me',
        CLOUDFLARE_ACCOUNT_ID: 'account',
        CLOUDFLARE_API_TOKEN: 'token',
        CLOUDFLARE_NOTIFY_D1_DATABASE_ID: 'database',
      },
    },
  };
}

describe('admin broadcast rendering', () => {
  test('sanitizes raw HTML before previewing or storing broadcast bodies', () => {
    const html = renderBodyToHtml(`
      <p onclick="fetch('/api/admin/subscribers')">Hello <a href="javascript:alert(1)">link</a></p>
      <img src="data:image/svg+xml,%3Csvg%20onload=alert(1)%3E" alt="avatar">
      <script>alert('owned')</script>
    `);
    const text = renderBodyToText(`
      <p>Hello <a href="javascript:alert(1)">link</a></p>
      <script>alert('owned')</script>
    `);

    expect(html).toContain('<p>Hello <a>link</a></p>');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('data:');
    expect(text).toBe('Hello link');
  });
});

describe('admin broadcast sending', () => {
  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
  });

  test('marks a broadcast failed when any recipient fails', async () => {
    const finalStatuses: string[] = [];

    globalThis.fetch = (async (url, init) => {
      const target = String(url);
      if (target.includes('/client/v4/accounts/account/d1/database/database/query')) {
        const body = JSON.parse(String(init?.body ?? '{}')) as { sql?: string; params?: unknown[] };
        const sql = (body.sql ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

        if (sql.startsWith('select') && sql.includes('from notify_subscribers')) {
          return d1Response({
            results: [
              {
                email: 'reader@buxx.me',
                email_hash: hashEmail('reader@buxx.me'),
                status: 'active',
                delivery_mode: 'immediate',
                channels: '["mood"]',
              },
              {
                email: 'not-an-email',
                email_hash: 'bad',
                status: 'active',
                delivery_mode: 'immediate',
                channels: '["mood"]',
              },
            ],
          });
        }

        if (sql.startsWith('update notify_broadcasts')) {
          finalStatuses.push(String(body.params?.[2] ?? ''));
          return d1Response({ changes: 1 });
        }

        return d1Response({ changes: 1 });
      }

      if (target === 'https://api.resend.com/emails') {
        return new Response(JSON.stringify({ id: 'email_1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`Unexpected fetch: ${target}`);
    }) as typeof fetch;

    const result = await sendBroadcast(adminContext(), {
      subject: 'Policy update',
      body: 'Hello',
      audience: { status: 'active', channels: ['mood'] },
    });

    expect(result.sentCount).toBe(1);
    expect(result.failedCount).toBe(1);
    expect(result.status).toBe('failed');
    expect(finalStatuses).toEqual(['failed']);
  });

  test('does not fail a completed send when the audit insert fails', async () => {
    const auditErrors: unknown[][] = [];
    console.error = (...args: unknown[]) => {
      auditErrors.push(args);
    };

    globalThis.fetch = (async (url, init) => {
      const target = String(url);
      if (target.includes('/client/v4/accounts/account/d1/database/database/query')) {
        const body = JSON.parse(String(init?.body ?? '{}')) as { sql?: string };
        const sql = (body.sql ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

        if (sql.startsWith('select') && sql.includes('from notify_subscribers')) {
          return d1Response({
            results: [
              {
                email: 'reader@buxx.me',
                email_hash: hashEmail('reader@buxx.me'),
                status: 'active',
                delivery_mode: 'immediate',
                channels: '["mood"]',
              },
            ],
          });
        }

        if (sql.startsWith('insert into notify_audit')) {
          return d1Response({ success: false, error: 'CHECK constraint failed: event_type' });
        }

        return d1Response({ changes: 1 });
      }

      if (target === 'https://api.resend.com/emails') {
        return new Response(JSON.stringify({ id: 'email_1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`Unexpected fetch: ${target}`);
    }) as typeof fetch;

    const result = await sendBroadcast(adminContext(), {
      subject: 'Policy update',
      body: 'Hello',
      audience: { status: 'active', channels: ['mood'] },
    });

    expect(result.status).toBe('sent');
    expect(result.sentCount).toBe(1);
    expect(auditErrors[0]?.[0]).toBe('Broadcast audit write failed:');
  });
});
