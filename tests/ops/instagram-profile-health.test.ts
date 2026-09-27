import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { instagramSnapshot } from '@/data/site';
import { expectHttpOk } from './http-diagnostics';

// The homepage Instagram card is a hand-updated snapshot (instagramSnapshot in
// src/data/site.ts plus public/instagram-avatar.jpg): Instagram refuses
// logged-out reads from servers, so nothing refreshes it. These checks catch
// the card drifting from that snapshot: the picture it links, the bytes the
// site serves for it, the counts it prints, or a return to linking or inlining
// Instagram's own addresses, whose signed CDN links expire and whose login
// wall serves the Instagram logo.

const SITE = (process.env.SITE_URL || process.env.PUBLIC_SITE_URL || 'https://buxx.me').replace(/\/+$/, '');
const REQUEST_TIMEOUT_MS = 8_000;
const TEST_TIMEOUT_MS = 30_000;
const AVATAR_FILE = new URL(`../../public${instagramSnapshot.avatar}`, import.meta.url);

async function get(url: string, accept: string): Promise<Response> {
  const response = await fetch(url, {
    headers: { Accept: accept, 'Cache-Control': 'no-cache' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  await expectHttpOk(response, `GET ${url}`);
  return response;
}

async function readCard(): Promise<string> {
  const html = await (await get(`${SITE}/`, 'text/html')).text();
  const start = html.indexOf('data-card-id="instagram"');
  return start >= 0 ? html.slice(start, html.indexOf('</a>', start)) : '';
}

const sha256 = (bytes: ArrayBuffer | Uint8Array) =>
  createHash('sha256').update(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).digest('hex');
const compactCount = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

describe('instagram card health', () => {
  test('the homepage card shows the snapshot picture and counts', async () => {
    const card = await readCard();
    expect(card, 'homepage has no Instagram card').not.toBe('');

    const src = card.match(/<img class="ig-avatar"[^>]*\ssrc="([^"]+)"/)?.[1];
    expect(src, 'Instagram card picture').toBe(instagramSnapshot.avatar);
    expect(card, 'the card must not inline or link Instagram directly').not.toMatch(/data:image|cdninstagram|fbcdn/);

    const printed = [...card.matchAll(/<dd class="hc-num"[^>]*>([^<]*)<\/dd><dt[^>]*>([^<]*)<\/dt>/g)]
      .map(([, value, label]) => `${label}:${value}`);
    expect(printed).toEqual([
      `Posts:${compactCount.format(instagramSnapshot.counts.posts)}`,
      `Followers:${compactCount.format(instagramSnapshot.counts.followers)}`,
      `Following:${compactCount.format(instagramSnapshot.counts.following)}`,
    ]);
  }, { timeout: TEST_TIMEOUT_MS });

  test('the site serves the committed snapshot picture', async () => {
    const response = await get(new URL(instagramSnapshot.avatar, SITE).toString(), 'image/*');
    const served = await response.arrayBuffer();
    const committed = await readFile(AVATAR_FILE);

    expect(response.headers.get('content-type') ?? '').toMatch(/^image\/jpeg/);
    expect(served.byteLength).toBeGreaterThan(1_024);
    expect(sha256(served), 'served picture differs from public/instagram-avatar.jpg').toBe(sha256(committed));
  }, { timeout: TEST_TIMEOUT_MS });
});
