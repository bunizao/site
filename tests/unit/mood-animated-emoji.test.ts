import { describe, expect, test } from 'bun:test';

describe('animated mood emoji hydration', () => {
  test('replaces the fallback glyph after animation data loads', async () => {
    const source = await Bun.file('src/features/mood/client/animated-emoji.ts').text();

    expect(source).toContain('node.replaceChildren(container)');
    expect(source).not.toContain('node.appendChild(container)');
  });

  test('loads near the viewport and keeps metadata cacheable', async () => {
    const source = await Bun.file('src/features/mood/client/animated-emoji.ts').text();

    expect(source).toContain("rootMargin: '100px 0px'");
    expect(source).toContain('nearViewportNodes');
    expect(source).not.toContain("cache: 'no-store'");
  });

  test('retries transient animation data failures without caching null', async () => {
    const source = await Bun.file('src/features/mood/client/animated-emoji.ts').text();

    expect(source).toContain('ANIMATION_FETCH_ATTEMPTS');
    expect(source).toContain('emojiCache.delete(emojiId)');
  });
});
