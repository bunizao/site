import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { redirectLegacyBlogUrl } from '@/features/agent-markdown/server/responses';
import {
  manifestEntryForPath,
  resetI18nManifestForTests,
  type I18nManifest,
} from '@/features/posts/server/i18n-manifest';

const manifest: I18nManifest = {
  'quiet-architecture': { translations: { en: 'on-quiet-architecture' } },
  'on-quiet-architecture': { canonical: 'quiet-architecture', locale: 'en' },
};

function assets() {
  let manifestReads = 0;
  const binding = {
    fetch: async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (url.pathname === '/_i18n/posts.json') {
        manifestReads += 1;
        return new Response(JSON.stringify(manifest), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(null, { status: 404 });
    },
  };
  return { binding, reads: () => manifestReads };
}

async function redirect(url: string, locals: unknown): Promise<string | null> {
  const response = await redirectLegacyBlogUrl(new Request(url), locals);
  if (!response) return null;
  expect(response.status).toBe(301);
  return response.headers.get('Location');
}

// The manifest is cached at module scope; another file's fake ASSETS binding
// would otherwise hand this one a manifest it never wrote.
beforeEach(() => resetI18nManifestForTests());
afterEach(() => resetI18nManifestForTests());

describe('legacy blog article URLs', () => {
  test('sends a translation\'s Ghost slug to its locale URL', async () => {
    const locals = { env: { ASSETS: assets().binding } };
    expect(await redirect('https://buxx.me/blog/on-quiet-architecture', locals))
      .toBe('/blog/en/quiet-architecture');
    expect(await redirect('https://buxx.me/blog/on-quiet-architecture/?ref=tg', locals))
      .toBe('/blog/en/quiet-architecture?ref=tg');
  });

  // The first i18n round indexed `?lang=`; anything still holding that form
  // lands on the version it meant, and the parameter never survives.
  test('turns the retired ?lang= form into the version URL', async () => {
    const locals = { env: { ASSETS: assets().binding } };
    expect(await redirect('https://buxx.me/blog/quiet-architecture?lang=en', locals))
      .toBe('/blog/en/quiet-architecture');
    expect(await redirect('https://buxx.me/blog/quiet-architecture?lang=EN&ref=tg', locals))
      .toBe('/blog/en/quiet-architecture?ref=tg');
    expect(await redirect('https://buxx.me/blog/quiet-architecture?lang=zh', locals))
      .toBe('/blog/quiet-architecture');
    expect(await redirect('https://buxx.me/blog/quiet-architecture?lang=fr', locals))
      .toBe('/blog/quiet-architecture');
  });

  test('leaves every served URL alone', async () => {
    const { binding, reads } = assets();
    const locals = { env: { ASSETS: binding } };
    expect(await redirect('https://buxx.me/blog/quiet-architecture', locals)).toBeNull();
    expect(await redirect('https://buxx.me/blog/quiet-architecture?ref=tg', locals)).toBeNull();
    expect(await redirect('https://buxx.me/blog/en/quiet-architecture', locals)).toBeNull();
    expect(await redirect('https://buxx.me/blog/demo-effects?lang=en', locals)).toBeNull();
    expect(await redirect('https://buxx.me/blog/tag/systems', locals)).toBeNull();
    expect(reads()).toBe(1);
  });

  test('rejects malformed encoded paths', () => {
    expect(manifestEntryForPath(manifest, '/blog/%ZZ')).toBeNull();
  });
});
