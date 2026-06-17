import { describe, expect, test } from 'bun:test';
import {
  buildMoodRichTextFixtureDocument,
  isMoodRichTextFixtureEnabled,
  MOOD_RICH_TEXT_FIXTURE_ID,
} from '../../src/features/mood/server/rich-text-fixture';
import {
  loadMoodComments,
  loadMoodDocument,
  loadMoodFeed,
  loadMoodProbe,
} from '../../src/features/mood/server/api-client';
import { renderStructuredMoodDetailContent } from '../../src/features/mood/shared/detail-content';

describe('mood rich-text fixture', () => {
  test('renders the full Telegram Bot API entity set through the structured pipeline', () => {
    const html = renderStructuredMoodDetailContent(buildMoodRichTextFixtureDocument());

    // Inline styles.
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
    expect(html).toContain('<u>underline</u>');
    expect(html).toContain('<s>strikethrough</s>');
    expect(html).toContain('<strong><em>bold italic</em></strong>');

    // Spoiler, including nested formatting.
    expect(html).toContain('<span class="tg-spoiler">42, obviously</span>');
    expect(html).toContain('<span class="tg-spoiler"><strong>nested bold</strong> inside</span>');

    // Links: external gets target/rel, mailto and internal are preserved.
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('href="mailto:hi@buxx.me"');
    expect(html).toContain('href="/mood"');

    // Code: inline, language-tagged block, plain block.
    expect(html).toContain('<code>code()</code>');
    expect(html).toContain('<pre><code class="language-typescript">');
    expect(html).toContain('<pre><code>plain pre block');

    // Custom emoji.
    expect(html).toContain('<span class="tg-emoji" data-emoji-id="5458403743835889060">');

    // Auto-detected entities: mention resolves to a t.me link, the rest are
    // preserved as styled spans through the sanitizer's class allowlist.
    expect(html).toContain('href="https://t.me/durov"');
    expect(html).toContain('<span class="tg-mention">Pavel</span>');
    expect(html).toContain('<span class="tg-hashtag">#telegram</span>');
    expect(html).toContain('<span class="tg-cashtag">$TON</span>');
    expect(html).toContain('<span class="tg-bot-command">/start</span>');
    expect(html).toContain('<span class="tg-datetime">June 17, 2026</span>');

    // Blockquotes: normal and expandable.
    expect(html).toContain('<blockquote>A normal blockquote');
    expect(html).toContain('<blockquote class="tg-blockquote-expandable">');

    // Sanitizer still strips anything unsafe.
    expect(html).not.toContain('<script');
  });

  test('flag parsing treats common falsy aliases as disabled', () => {
    expect(isMoodRichTextFixtureEnabled({ env: { MOOD_RICHTEXT_FIXTURE: '1' } })).toBe(true);
    expect(isMoodRichTextFixtureEnabled({ env: { MOOD_RICHTEXT_FIXTURE: 'true' } })).toBe(true);
    expect(isMoodRichTextFixtureEnabled({ env: { MOOD_RICHTEXT_FIXTURE: '0' } })).toBe(false);
    expect(isMoodRichTextFixtureEnabled({ env: { MOOD_RICHTEXT_FIXTURE: 'off' } })).toBe(false);
    expect(isMoodRichTextFixtureEnabled({ env: {} })).toBe(false);
  });

  test('fixture mode serves structured data through live reader helpers', async () => {
    const locals = { env: { MOOD_RICHTEXT_FIXTURE: '1' } };
    const context = {
      request: new Request(`https://buxx.me/mood/${MOOD_RICH_TEXT_FIXTURE_ID}`),
      locals,
    };

    const feed = await loadMoodFeed(context);
    const document = await loadMoodDocument(context, MOOD_RICH_TEXT_FIXTURE_ID);
    const probe = await loadMoodProbe(context);
    const comments = await loadMoodComments(context, MOOD_RICH_TEXT_FIXTURE_ID);

    expect(feed.posts[0]?.id).toBe(MOOD_RICH_TEXT_FIXTURE_ID);
    expect(document?.id).toBe(MOOD_RICH_TEXT_FIXTURE_ID);
    expect(probe.latestId).toBe(MOOD_RICH_TEXT_FIXTURE_ID);
    expect(comments).toEqual({ comments: [], hasMore: false, nextBefore: '' });
  });
});
