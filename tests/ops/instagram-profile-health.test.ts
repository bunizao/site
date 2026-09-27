import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import type { InstagramProfile } from '@bunizao/contracts/instagram';
import { API_PREFIX, INSTAGRAM_AVATAR_PATH, INSTAGRAM_PROFILE_PATH } from '@bunizao/contracts/routes';
import { hero } from '@/data/site';
import { expectHttpOk } from './http-diagnostics';

// The homepage Instagram card reads its picture and counts from site-api,
// which stores the last profile read the refresh job
// (site-api .github/workflows/instagram-refresh.yml) got past validation.
// These checks catch the ways that can drift: the job stops landing reads,
// the stored picture stops matching the profile that names it, the handle on
// the site and the one site-api reads part ways, or the card goes back to
// linking something other than the stored picture.

const SITE = (process.env.SITE_URL || process.env.PUBLIC_SITE_URL || 'https://buxx.me').replace(/\/+$/, '');
const REQUEST_TIMEOUT_MS = 8_000;
const TEST_TIMEOUT_MS = 30_000;
// The job runs every three hours with four tries each; a day without one
// stored read is eight failed runs in a row.
const MAX_AGE_HOURS = Number(process.env.INSTAGRAM_MAX_AGE_HOURS) || 24;

function expectedUsername(): string {
  const link = hero.socials.find((social) => social.name === 'Instagram');
  const target = link && 'canonicalUrl' in link ? link.canonicalUrl : undefined;
  if (!target) throw new Error('The Instagram link in src/data/site.ts has no canonicalUrl.');
  return new URL(target).pathname.split('/').filter(Boolean)[0];
}

async function get(url: string, accept: string): Promise<Response> {
  const response = await fetch(url, {
    headers: { Accept: accept, 'Cache-Control': 'no-cache' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  await expectHttpOk(response, `GET ${url}`);
  return response;
}

// A query the edge has not seen, so the check reads the stored copy and not a
// response cached before the last refresh.
async function readProfile(): Promise<InstagramProfile> {
  const url = new URL(`${API_PREFIX}${INSTAGRAM_PROFILE_PATH}`, SITE);
  url.searchParams.set('ops', String(Date.now()));
  return (await get(url.toString(), 'application/json')).json() as Promise<InstagramProfile>;
}

async function readImage(url: string): Promise<{ contentType: string; bytes: ArrayBuffer; etag: string | null }> {
  const response = await get(url, 'image/*');
  return {
    contentType: response.headers.get('content-type') ?? '',
    etag: response.headers.get('etag'),
    bytes: await response.arrayBuffer(),
  };
}

const sha256 = (bytes: ArrayBuffer) => createHash('sha256').update(new Uint8Array(bytes)).digest('hex');

describe('instagram profile health', () => {
  test('site-api holds a recent profile read for the handle the site links', async () => {
    const profile = await readProfile();
    const lastAttempt = `last attempt ${profile.lastAttempt?.at} ok=${profile.lastAttempt?.ok} error=${profile.lastAttempt?.error}`;

    expect(profile.username, 'site-api reads a different Instagram account than the site links').toBe(expectedUsername());
    const ageHours = (Date.now() - Date.parse(profile.refreshedAt)) / 3_600_000;
    expect(Number.isFinite(ageHours), `refreshedAt is not a date: ${profile.refreshedAt}`).toBe(true);
    expect(ageHours, `stored read is ${ageHours.toFixed(1)}h old; ${lastAttempt}`).toBeLessThanOrEqual(MAX_AGE_HOURS);

    for (const [name, value] of Object.entries(profile.counts)) {
      expect(Number.isSafeInteger(value) && value >= 0, `${name} count is ${value}`).toBe(true);
    }
    expect(profile.counts.followers, 'a real profile has followers').toBeGreaterThan(0);
  }, { timeout: TEST_TIMEOUT_MS });

  test('the stored picture is the one the profile names', async () => {
    let profile = await readProfile();
    let image = await readImage(profile.avatar.url);
    // A refresh can land between the two reads; the next profile read names it.
    if (sha256(image.bytes) !== profile.avatar.sha256) {
      profile = await readProfile();
      image = await readImage(profile.avatar.url);
    }

    expect(new URL(profile.avatar.url).pathname).toBe(`${API_PREFIX}${INSTAGRAM_AVATAR_PATH}`);
    expect(image.contentType).toMatch(/^image\//);
    expect(image.contentType).toBe(profile.avatar.contentType);
    expect(image.bytes.byteLength).toBe(profile.avatar.bytes);
    expect(sha256(image.bytes), 'served picture bytes differ from the stored profile').toBe(profile.avatar.sha256);
    expect(image.etag).toBe(`"${profile.avatar.sha256}"`);
  }, { timeout: TEST_TIMEOUT_MS });

  test('the homepage card shows the stored picture', async () => {
    const response = await get(`${SITE}/`, 'text/html');
    const html = await response.text();
    const start = html.indexOf('data-card-id="instagram"');
    const card = start >= 0 ? html.slice(start, html.indexOf('</a>', start)) : '';
    expect(card, 'homepage has no Instagram card').not.toBe('');

    const src = card.match(/<img class="ig-avatar"[^>]*\ssrc="([^"]+)"/)?.[1];
    expect(src, 'Instagram card picture').toBe(`${API_PREFIX}${INSTAGRAM_AVATAR_PATH}`);
    expect(card, 'the card must not inline or link Instagram directly').not.toMatch(/data:image|cdninstagram|fbcdn/);

    const image = await readImage(new URL(src!, SITE).toString());
    expect(image.contentType).toMatch(/^image\//);
    expect(image.bytes.byteLength).toBeGreaterThan(1_024);
  }, { timeout: TEST_TIMEOUT_MS });
});
