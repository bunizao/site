import { afterEach, describe, expect, test } from 'bun:test';
import {
  enrichAppleMusicEmbeds,
  resetAppleMusicEmbedLookupCacheForTests,
} from '@/features/posts/server/apple-music';

const originalFetch = globalThis.fetch;

function setFetchMock(handler: (...args: Parameters<typeof fetch>) => Promise<Response>): void {
  globalThis.fetch = Object.assign(handler, {
    preconnect: originalFetch.preconnect,
  }) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  resetAppleMusicEmbedLookupCacheForTests();
});

function base64Url(value: string): string {
  return btoa(value)
    .replace(/=+$/u, '')
    .replace(/\+/gu, '-')
    .replace(/\//gu, '_');
}

function fakeToken(expSeconds: number, keyId = 'WebPlayKid'): string {
  const header = base64Url(JSON.stringify({ alg: 'ES256', typ: 'JWT', kid: keyId }));
  const payload = base64Url(JSON.stringify({ exp: expSeconds }));
  return `${header}.${payload}.${'signature'.repeat(20)}`;
}

describe('Apple Music embed enrichment', () => {
  test('ignores iframe URLs with music.apple.com outside the hostname', async () => {
    const html = '<iframe src="https://example.com/embed/music.apple.com/us/song/1888707290?i=1888707290"></iframe>';
    let fetchCount = 0;

    setFetchMock(async () => {
      fetchCount += 1;
      throw new Error('Unexpected lookup');
    });

    const output = await enrichAppleMusicEmbeds(html);

    expect(output).toBe(html);
    expect(fetchCount).toBe(0);
  });

  test('rewrites entity-escaped Apple Music iframe sources', async () => {
    const requestedIds: string[] = [];
    const html = [
      '<figure class="kg-embed-card">',
      '<iframe src="https://embed.music.apple.com/us/album/all-the-love/1888707282?i=1888707290&amp;app=music"></iframe>',
      '</figure>',
    ].join('');
    const token = fakeToken(Math.floor(Date.now() / 1000) - 60);

    setFetchMock(async (input) => {
      const url = new URL(input.toString());
      if (url.hostname === 'itunes.apple.com') {
        requestedIds.push(url.searchParams.get('id') ?? '');
        expect(url.searchParams.get('country')).toBe('us');
        expect(url.searchParams.get('entity')).toBe('song');
        return new Response(JSON.stringify({
          results: [
            {
              trackName: 'A&B <Track>',
              artistName: 'Sample Artist',
              collectionName: 'Sample Collection',
              artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/a/b/c/source/100x100bb.jpg',
              previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/test.m4a',
              releaseDate: '2026-01-02T00:00:00Z',
              trackViewUrl: 'https://music.apple.com/us/song/all-the-love/1888707290',
            },
          ],
        }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.href === 'https://embed.music.apple.com/build/web-embed.esm.js') {
        return new Response('"p-cafebabe",[[1,"embed-root"', { status: 200 });
      }
      if (url.href === 'https://embed.music.apple.com/build/p-cafebabe.entry.js') {
        return new Response(`const token="${token}";`, { status: 200 });
      }
      if (url.hostname === 'amp-api.music.apple.com') {
        throw new Error('Expired AMP token should not be used');
      }
      throw new Error(`Unexpected lookup: ${url.href}`);
    });

    const output = await enrichAppleMusicEmbeds(html);

    expect(requestedIds).toEqual(['1888707290']);
    expect(output).toContain('data-blog-music');
    expect(output).toContain('data-track-id="1888707290"');
    expect(output).toContain('data-track-title="A&amp;B &lt;Track&gt;"');
    expect(output).toContain('data-track-artist="Sample Artist"');
    expect(output).toContain('A&amp;B &lt;Track&gt;');
    expect(output).not.toContain('kg-embed-card');
  });

  test('prefers Apple extended preview URLs when available', async () => {
    const html = [
      '<figure class="kg-embed-card">',
      '<iframe src="https://embed.music.apple.com/us/album/all-the-love/1888707282?i=1888707291"></iframe>',
      '</figure>',
    ].join('');
    const token = fakeToken(Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60);

    setFetchMock(async (input, init) => {
      const url = new URL(input.toString());
      if (url.hostname === 'itunes.apple.com') {
        return Response.json({
          results: [
            {
              trackName: 'ALL THE LOVE',
              artistName: 'Sample Artist',
              artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/a/b/c/source/100x100bb.jpg',
              previewUrl: 'https://audio-ssl.itunes.apple.com/test.plus.aac.p.m4a',
              trackViewUrl: 'https://music.apple.com/us/song/all-the-love/1888707290',
            },
          ],
        });
      }
      if (url.href === 'https://embed.music.apple.com/build/web-embed.esm.js') {
        return new Response('"p-deadbeef",[[1,"embed-root"', { status: 200 });
      }
      if (url.href === 'https://embed.music.apple.com/build/p-deadbeef.entry.js') {
        return new Response(`const token="${token}";`, { status: 200 });
      }
      if (url.hostname === 'amp-api.music.apple.com') {
        expect(url.pathname).toBe('/v1/catalog/us/songs/1888707291');
        expect(new Headers(init?.headers).get('Origin')).toBe('https://embed.music.apple.com');
        return Response.json({
          data: [{
            attributes: {
              previews: [{ url: 'https://audio-ssl.itunes.apple.com/test.plus.aac.ep.m4a' }],
            },
          }],
        });
      }
      throw new Error(`Unexpected lookup: ${url.href}`);
    });

    const output = await enrichAppleMusicEmbeds(html);

    expect(output).toContain('data-preview-url="https://audio-ssl.itunes.apple.com/test.plus.aac.ep.m4a"');
    expect(output).not.toContain('test.plus.aac.p.m4a');
  });

  test('skips expired AMP tokens and uses the rotated bundle token', async () => {
    const html = [
      '<figure class="kg-embed-card">',
      '<iframe src="https://embed.music.apple.com/us/album/all-the-love/1888707282?i=1888707292"></iframe>',
      '</figure>',
    ].join('');
    const nowSeconds = Math.floor(Date.now() / 1000);
    const expiredToken = fakeToken(nowSeconds - 60, 'OldWebPlayKid');
    const rotatedToken = fakeToken(nowSeconds + 90 * 24 * 60 * 60, 'RotatedWebPlayKid');

    setFetchMock(async (input, init) => {
      const url = new URL(input.toString());
      if (url.hostname === 'itunes.apple.com') {
        return Response.json({
          results: [
            {
              trackName: 'Rotated Track',
              artistName: 'Sample Artist',
              artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/a/b/c/source/100x100bb.jpg',
              previewUrl: 'https://audio-ssl.itunes.apple.com/rotated.plus.aac.p.m4a',
              trackViewUrl: 'https://music.apple.com/us/song/rotated-track/1888707292',
            },
          ],
        });
      }
      if (url.href === 'https://embed.music.apple.com/build/web-embed.esm.js') {
        return new Response('"p-aaaa1111";"p-bbbb2222"', { status: 200 });
      }
      if (url.href === 'https://embed.music.apple.com/build/p-aaaa1111.entry.js') {
        return new Response(`const token="${expiredToken}";`, { status: 200 });
      }
      if (url.href === 'https://embed.music.apple.com/build/p-bbbb2222.entry.js') {
        return new Response(`const token="${rotatedToken}";`, { status: 200 });
      }
      if (url.hostname === 'amp-api.music.apple.com') {
        expect(new Headers(init?.headers).get('Authorization')).toBe(`Bearer ${rotatedToken}`);
        return Response.json({
          data: [{
            attributes: {
              previews: [{ url: 'https://audio-ssl.itunes.apple.com/rotated.plus.aac.ep.m4a' }],
            },
          }],
        });
      }
      throw new Error(`Unexpected lookup: ${url.href}`);
    });

    const output = await enrichAppleMusicEmbeds(html);

    expect(output).toContain('data-preview-url="https://audio-ssl.itunes.apple.com/rotated.plus.aac.ep.m4a"');
    expect(output).not.toContain('rotated.plus.aac.p.m4a');
  });
});
