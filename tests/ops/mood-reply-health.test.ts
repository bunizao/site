import { describe, expect, test } from 'bun:test';
import { expectHttpOk } from './http-diagnostics';

interface MoodReplyCanary {
  childId: string;
  parentId: string;
}

interface MoodReplyDocument {
  quote?: {
    href?: string;
  } | null;
}

const DEFAULT_REPLY_CANARIES = '1609:1600';
const MAX_REPLY_CANARIES = 10;

function readEnv(name: string): string {
  return (process.env[name] ?? '').trim();
}

function getSiteUrl(): string {
  return (readEnv('SITE_URL') || readEnv('PUBLIC_SITE_URL') || 'https://buxx.me').replace(/\/+$/, '');
}

function getReplyCanaries(): MoodReplyCanary[] {
  const mappings = (readEnv('MOOD_REPLY_CANARIES') || DEFAULT_REPLY_CANARIES)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  expect(mappings.length, 'MOOD_REPLY_CANARIES should contain at least one child:parent mapping').toBeGreaterThan(0);
  expect(mappings.length, `MOOD_REPLY_CANARIES should contain at most ${MAX_REPLY_CANARIES} mappings`)
    .toBeLessThanOrEqual(MAX_REPLY_CANARIES);

  return mappings.map((mapping) => {
    const match = mapping.match(/^([1-9]\d*):([1-9]\d*)$/);
    expect(match, `invalid MOOD_REPLY_CANARIES mapping: ${mapping}`).not.toBeNull();

    return {
      childId: match?.[1] ?? '',
      parentId: match?.[2] ?? '',
    };
  });
}

async function fetchArchiveDetail(siteUrl: string, childId: string): Promise<MoodReplyDocument> {
  const url = new URL(`/api/v2/mood/${encodeURIComponent(childId)}`, siteUrl);
  url.searchParams.set('fresh', '1');
  url.searchParams.set('fallback', '0');

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'Cache-Control': 'no-cache',
    },
    signal: AbortSignal.timeout(10_000),
  });
  await expectHttpOk(response, `GET ${url}`);
  return await response.json() as MoodReplyDocument;
}

describe('mood reply health', () => {
  test('archived replies preserve their parent quote links', async () => {
    const siteUrl = getSiteUrl();
    const canaries = getReplyCanaries();

    for (const { childId, parentId } of canaries) {
      const document = await fetchArchiveDetail(siteUrl, childId);
      expect(document.quote, `mood ${childId} should quote parent ${parentId}`).toBeTruthy();

      const href = document.quote?.href;
      expect(href, `mood ${childId} quote should link to parent ${parentId}`).toBeTruthy();
      if (!href) continue;

      expect(new URL(href, siteUrl).pathname).toBe(`/mood/${parentId}`);
    }
  }, { timeout: 30_000 });
});
