import { describe, expect, test } from 'bun:test';

describe('animated mood emoji hydration', () => {
  test('replaces the fallback glyph after animation data loads', async () => {
    const source = await Bun.file('src/features/mood/client/animated-emoji.ts').text();

    expect(source).toContain('node.replaceChildren(container)');
    expect(source).not.toContain('node.appendChild(container)');
  });
});
