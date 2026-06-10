import { describe, expect, test } from 'bun:test';
import { createNotifyD1Client } from '../../src/features/notify/server/d1';

interface D1Call {
  sql: string;
  params: unknown[];
}

function createD1Binding(results: unknown[], meta: Record<string, unknown> = {}) {
  const calls: D1Call[] = [];

  return {
    calls,
    binding: {
      prepare(sql: string) {
        const call: D1Call = { sql, params: [] };
        calls.push(call);

        return {
          bind(...params: unknown[]) {
            call.params = params;
            return this;
          },
          async all() {
            return {
              success: true,
              results,
              meta,
            };
          },
          async run() {
            return {
              success: true,
              results: [],
              meta,
            };
          },
        };
      },
    },
  };
}

describe('notify D1 client', () => {
  test('prefers a direct Worker D1 binding over HTTP API configuration', async () => {
    const originalFetch = globalThis.fetch;
    const d1 = createD1Binding([{ email: 'reader@example.com' }]);
    globalThis.fetch = (() => {
      throw new Error('HTTP D1 fallback should not run when NOTIFY_DB is bound');
    }) as unknown as typeof fetch;

    try {
      const client = createNotifyD1Client({
        locals: {
          env: {
            NOTIFY_DB: d1.binding,
            CLOUDFLARE_ACCOUNT_ID: 'account',
            CLOUDFLARE_API_TOKEN: 'token',
            CLOUDFLARE_NOTIFY_D1_DATABASE_ID: 'database',
          },
        },
      });

      const rows = await client.query<{ email: string }>(
        'select email from notify_subscribers where email = ?',
        ['reader@example.com']
      );

      expect(rows).toEqual([{ email: 'reader@example.com' }]);
      expect(d1.calls).toEqual([
        {
          sql: 'select email from notify_subscribers where email = ?',
          params: ['reader@example.com'],
        },
      ]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('runs writes through a direct Worker D1 binding', async () => {
    const d1 = createD1Binding([], { changes: 1, last_row_id: 42 });
    const client = createNotifyD1Client({
      locals: {
        env: {
          NOTIFY_DB: d1.binding,
        },
      },
    });

    const result = await client.run(
      'insert into notify_subscribers (email) values (?)',
      ['reader@example.com']
    );

    expect(result).toEqual({ changes: 1, lastRowId: 42 });
    expect(d1.calls).toEqual([
      {
        sql: 'insert into notify_subscribers (email) values (?)',
        params: ['reader@example.com'],
      },
    ]);
  });
});
