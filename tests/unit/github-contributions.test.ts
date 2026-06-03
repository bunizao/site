import { afterEach, describe, expect, test } from 'bun:test';

import {
  fetchGitHubContributions,
  getGitHubContributionRange,
} from '../../src/lib/github';
import { GET as getGitHubContributions } from '../../src/pages/api/github/contributions';

const originalFetch = globalThis.fetch;
const originalE2EFixture = process.env.E2E_SITE_FIXTURE;

function restoreGlobals(): void {
  globalThis.fetch = originalFetch;

  if (originalE2EFixture === undefined) {
    delete process.env.E2E_SITE_FIXTURE;
  } else {
    process.env.E2E_SITE_FIXTURE = originalE2EFixture;
  }
}

function createRequest(path = '/api/github/contributions'): Request {
  return new Request(`https://buxx.me${path}`, {
    headers: {
      'x-client-ip': crypto.randomUUID(),
    },
  });
}

describe('GitHub contributions', () => {
  afterEach(() => {
    restoreGlobals();
  });

  test('builds a 365-day UTC contribution range', () => {
    expect(getGitHubContributionRange(new Date('2026-06-04T13:30:00.000Z'))).toEqual({
      from: '2025-06-05T00:00:00.000Z',
      to: '2026-06-04T23:59:59.999Z',
      fromDate: '2025-06-05',
      toDate: '2026-06-04',
    });
  });

  test('normalizes GitHub GraphQL contribution calendar data', async () => {
    globalThis.fetch = (async (
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1]
    ): Promise<Response> => {
      expect(input).toBe('https://api.github.com/graphql');
      expect(init?.method).toBe('POST');
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer test-token');
      expect(init?.signal).toBeInstanceOf(AbortSignal);

      const body = JSON.parse(String(init?.body)) as {
        variables: {
          username: string;
          from: string;
          to: string;
        };
      };
      expect(body.variables).toEqual({
        username: 'bunizao',
        from: '2025-06-05T00:00:00.000Z',
        to: '2026-06-04T23:59:59.999Z',
      });

      return new Response(JSON.stringify({
        data: {
          user: {
            contributionsCollection: {
              contributionCalendar: {
                totalContributions: 9,
                weeks: [
                  {
                    contributionDays: [
                      {
                        date: '2025-06-04',
                        contributionCount: 99,
                        contributionLevel: 'FOURTH_QUARTILE',
                      },
                      {
                        date: '2025-06-05',
                        contributionCount: 0,
                        contributionLevel: 'NONE',
                      },
                      {
                        date: '2026-06-04',
                        contributionCount: 4,
                        contributionLevel: 'FOURTH_QUARTILE',
                      },
                    ],
                  },
                  {
                    contributionDays: [
                      {
                        date: '2025-06-06',
                        contributionCount: 2,
                        contributionLevel: 'SECOND_QUARTILE',
                      },
                    ],
                  },
                ],
              },
            },
          },
        },
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }) as unknown as typeof fetch;

    const data = await fetchGitHubContributions(
      'bunizao',
      { GITHUB_TOKEN: 'test-token' } as unknown as ImportMetaEnv,
      undefined,
      { now: new Date('2026-06-04T13:30:00.000Z') }
    );

    expect(data).toEqual({
      total: {
        lastYear: 9,
      },
      contributions: [
        {
          date: '2025-06-05',
          count: 0,
          level: 0,
        },
        {
          date: '2025-06-06',
          count: 2,
          level: 2,
        },
        {
          date: '2026-06-04',
          count: 4,
          level: 4,
        },
      ],
    });
  });

  test('uses the external contributions API when the GitHub token is missing', async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0]): Promise<Response> => {
      const url = input instanceof Request ? input.url : String(input);
      calls.push(url);

      return new Response(JSON.stringify({
        total: {
          lastYear: 7,
        },
        contributions: [
          {
            date: '2025-06-04',
            count: 99,
            level: 4,
          },
          {
            date: '2025-06-05',
            count: 2,
            level: 2,
          },
        ],
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }) as unknown as typeof fetch;

    const data = await fetchGitHubContributions(
      'bunizao',
      {} as ImportMetaEnv,
      undefined,
      { now: new Date('2026-06-04T13:30:00.000Z') }
    );

    expect(calls).toEqual(['https://github-contributions-api.jogruber.de/v4/bunizao?y=last']);
    expect(data).toEqual({
      total: {
        lastYear: 7,
      },
      contributions: [
        {
          date: '2025-06-05',
          count: 2,
          level: 2,
        },
      ],
    });
  });

  test('falls back to the external API when GitHub GraphQL returns errors', async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0]): Promise<Response> => {
      const url = input instanceof Request ? input.url : String(input);
      calls.push(url);

      if (url === 'https://api.github.com/graphql') {
        return new Response(JSON.stringify({
          errors: [
            {
              message: 'rate limited',
            },
          ],
        }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        });
      }

      return new Response(JSON.stringify({
        contributions: [
          {
            date: '2026-06-04',
            count: 3,
            level: 3,
          },
        ],
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }) as unknown as typeof fetch;

    const data = await fetchGitHubContributions(
      'bunizao',
      { GITHUB_TOKEN: 'test-token' } as unknown as ImportMetaEnv,
      undefined,
      { now: new Date('2026-06-04T13:30:00.000Z') }
    );

    expect(calls).toEqual([
      'https://api.github.com/graphql',
      'https://github-contributions-api.jogruber.de/v4/bunizao?y=last',
    ]);
    expect(data).toEqual({
      total: {
        lastYear: 3,
      },
      contributions: [
        {
          date: '2026-06-04',
          count: 3,
          level: 3,
        },
      ],
    });
  });

  test('falls back to the external API when GitHub GraphQL rejects', async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0]): Promise<Response> => {
      const url = input instanceof Request ? input.url : String(input);
      calls.push(url);

      if (url === 'https://api.github.com/graphql') {
        throw new DOMException('timed out', 'AbortError');
      }

      return new Response(JSON.stringify({
        contributions: [
          {
            date: '2026-06-04',
            count: 5,
            level: 4,
          },
        ],
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }) as unknown as typeof fetch;

    const data = await fetchGitHubContributions(
      'bunizao',
      { GITHUB_TOKEN: 'test-token' } as unknown as ImportMetaEnv,
      undefined,
      { now: new Date('2026-06-04T13:30:00.000Z') }
    );

    expect(calls).toEqual([
      'https://api.github.com/graphql',
      'https://github-contributions-api.jogruber.de/v4/bunizao?y=last',
    ]);
    expect(data).toEqual({
      total: {
        lastYear: 5,
      },
      contributions: [
        {
          date: '2026-06-04',
          count: 5,
          level: 4,
        },
      ],
    });
  });

  test('rejects unsupported usernames at the API boundary', async () => {
    process.env.E2E_SITE_FIXTURE = '1';

    const response = await getGitHubContributions({
      request: createRequest('/api/github/contributions?username=octocat'),
      locals: {},
    } as any);

    expect(response.status).toBe(400);
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0');
    expect(await response.json()).toEqual({ error: 'Unsupported GitHub username' });
  });

  test('accepts the allowed username case-insensitively at the API boundary', async () => {
    process.env.E2E_SITE_FIXTURE = '1';

    const response = await getGitHubContributions({
      request: createRequest('/api/github/contributions?username=BUNIZAO'),
      locals: {},
    } as any);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('s-maxage=3600');
  });

  test('serves fixture data in E2E mode', async () => {
    process.env.E2E_SITE_FIXTURE = '1';

    const response = await getGitHubContributions({
      request: createRequest(),
      locals: {},
    } as any);
    const payload = await response.json() as {
      total?: { lastYear?: number };
      contributions?: unknown[];
    };

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('s-maxage=3600');
    expect(payload.total?.lastYear).toBeGreaterThan(0);
    expect(payload.contributions).toHaveLength(365);
  });
});
