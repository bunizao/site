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

  // Each pass matches the "/mood/embed" the previous pass just wrote, so a
  // shortcode used to come back wrapped in two figures.
  test('wraps each embed in exactly one figure', () => {
    const inputs = [
      '<p>[mood:482]</p>',
      'see [mood:482 theme=dark] inline',
      '<figure class="kg-bookmark-card"><a href="https://buxx.me/mood/12">x</a></figure>',
      '<figure><iframe src="/mood/embed?id=7&theme=dark"></iframe></figure>',
      '<iframe class="js-mood-embed" src="/mood/embed?id=9"></iframe>',
      '<p>[mood:1]</p><p>[mood:2]</p>',
    ];

    for (const input of inputs) {
      const output = enrichMoodEmbeds(input);
      const figures = output.match(/<figure/g) ?? [];
      const iframes = output.match(/<iframe/g) ?? [];
      expect(figures.length).toBe(iframes.length);
    }
  });
});
