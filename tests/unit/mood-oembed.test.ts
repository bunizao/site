import { describe, expect, test } from 'bun:test';
import { GET } from '../../src/pages/api/oembed.json';

function readIframeSrc(html: string | undefined): URL {
  const src = html?.match(/<iframe[^>]+src="([^"]+)"/)?.[1];
  if (!src) {
    throw new Error('Expected oEmbed payload to include an iframe src.');
  }
  return new URL(src);
}

async function requestOembed(requestUrl: string): Promise<{ html?: string }> {
  const url = new URL(requestUrl);
  const response = await GET({
    url,
    request: new Request(url),
    locals: {},
  } as any);

  expect(response.status).toBe(200);
  return await response.json() as { html?: string };
}

describe('mood oEmbed serialization', () => {
  test('keeps iframe URLs clean when old API mode inputs are supplied', async () => {
    const targetUrl = encodeURIComponent('https://buxx.me/mood/2?api-v2=true');
    const payload = await requestOembed(`https://buxx.me/api/oembed.json?api-v2=false&url=${targetUrl}`);
    const iframeUrl = readIframeSrc(payload.html);

    expect(iframeUrl.pathname).toBe('/mood/embed');
    expect(iframeUrl.searchParams.get('id')).toBe('2');
    expect(iframeUrl.searchParams.has('api-v2')).toBe(false);
  });
});
