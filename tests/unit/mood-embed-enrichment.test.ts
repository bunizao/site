import { describe, expect, test } from 'bun:test';
import { enrichMoodEmbeds } from '../../src/features/posts/server/mood-embed';

describe('mood embed enrichment', () => {
  test('rewrites mood references to same-origin transparent embeds', () => {
    const html = '<p>[mood:2556 theme=dark]</p>';

    const output = enrichMoodEmbeds(html);

    expect(output).toContain('class="kg-card blog-mood-embed"');
    expect(output).toContain('src="/mood/embed?id=2556&theme=dark&density=regular&link=false"');
    expect(output).toContain('allowtransparency="true"');
  });
});
