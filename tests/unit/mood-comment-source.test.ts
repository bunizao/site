// The thread mixes group messages and comments typed on the page, and before
// this marker they rendered identically -- a reader had no way to tell where
// a comment came from. Source assertions, the same way the repo covers its
// other client scripts (see mood-comments-live-refresh.test.ts).

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import { moodCommentsCopy } from '@/features/comments/copy';

const read = (path: string): string =>
  readFileSync(new URL(`../../src/${path}`, import.meta.url), 'utf8');

const shared = read('features/mood/shared/comments.ts');
const controller = read('features/mood/client/detail-comments-controller.ts');
const styles = read('features/mood/ui/CommentsSection.astro');
const compose = read('features/mood/ui/CommentCompose.astro');
const richText = read('features/mood/styles/feed-rich-text.css');

// The rule whose selector list *starts* with this selector -- anchored, so
// `.mood-comment-body` does not match `.mood-comment--skeleton .mood-comment-body`.
const ruleBody = (source: string, selector: string): string => {
  const start = source.search(new RegExp(`^\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{`, 'm'));
  expect(start).toBeGreaterThan(-1);
  const rest = source.slice(start);
  return rest.slice(0, rest.indexOf('}'));
};

describe('mood comment source marker', () => {
  test('names both origins', () => {
    expect(moodCommentsCopy.sourceTelegram).toBe('Telegram');
    expect(moodCommentsCopy.sourceWeb).toBe('Web');
    expect(moodCommentsCopy.sourceAria('Telegram')).toBe('Written on Telegram');
  });

  test('ships a glyph for each origin', () => {
    expect(shared).toContain('const SOURCE_ICONS: Record<CommentOrigin, string>');
    expect(shared).toContain('telegram:');
    expect(shared).toContain('web:');
    expect(shared).toContain('createCommentSourceChip');
  });

  // The marker is one glyph, no label beside it: two words of chrome in a
  // header that already carries a name and a timestamp is a third column of
  // text the reader has to parse before reaching the message.
  test('the chip is a bare glyph, named for assistive tech', () => {
    expect(shared).toContain('chip.dataset.origin = origin');
    expect(shared).toContain('chip.title = title');
    expect(shared).toContain("chip.setAttribute('role', 'img')");
    expect(shared).toContain("chip.setAttribute('aria-label', title)");
    // No text node: a label would put the source back on screen.
    expect(shared).not.toContain('chip.textContent');
  });

  test('the renderer stamps the origin and appends the chip', () => {
    expect(controller).toContain('root.dataset.origin = origin');
    expect(controller).toContain(
      'createCommentSourceChip(origin, moodCommentsCopy.sourceAria(sourceLabel))',
    );
  });

  test('reactions and the reply button share one footer row', () => {
    expect(controller).toContain("footer.className = 'mood-comment-footer'");
    expect(controller).toContain('footer.appendChild(reactionsWrap)');
    expect(controller).toContain('footer.appendChild(replyBtn)');
    // An empty footer would still cost the bubble its top margin.
    expect(controller).toContain('if (footer.childElementCount > 0)');
    expect(styles).toContain('.mood-comment-footer');
  });

  test('the bubble uses the shared radius and motion scales', () => {
    expect(styles).toContain('--comment-body-radius: var(--radius-sm)');
    expect(styles).toContain('animation: comment-fade-in var(--dur-enter) var(--ease-out)');
  });
});

// GitHub, Telegram Web and Discourse all run a comment on two sizes at most,
// give the author name the body's own size, and drop the timestamp no more
// than one step. `.blog-comments` in this repo already settled on the same
// shape (16/13); the mood bubble is narrower, so it runs 15/13.
describe('mood comment type scale', () => {
  test('two sizes, one family, one leading', () => {
    const root = ruleBody(styles, '.mood-comments');
    expect(root).toContain('--comment-body: 15px');
    expect(root).toContain('--comment-meta: 13px');
    expect(root).toContain('--comment-lead: 1.65');
    expect(ruleBody(styles, '.mood-comment-body')).toContain('font-family: var(--font-sans)');
  });

  test('the name runs at the body size, the timestamp one step under', () => {
    const author = ruleBody(styles, '.mood-comment-author');
    expect(author).toContain('font-size: var(--comment-body)');
    expect(author).toContain('font-weight: 600');

    const date = ruleBody(styles, '.mood-comment-date');
    expect(date).toContain('font-size: var(--comment-meta)');
    // A relative timestamp is a value, not a label: shouting it reads as a
    // quantity ("42M AGO"), and tracking it apart makes it a third voice.
    expect(date).not.toContain('text-transform');
    expect(date).not.toContain('letter-spacing');
  });

  test('Reply sits on the meta step, in the bubble font', () => {
    const reply = ruleBody(compose, '.mood-comment-reply-btn');
    expect(reply).toContain('font-family: inherit');
    expect(reply).toContain('font-size: var(--comment-meta)');
    expect(reply).not.toContain('text-transform');
  });

  // Lives in feed-rich-text.css, which is unlayered -- an @layer rule in
  // globals.css loses to it whatever its specificity.
  test('a quoted parent stays on the scale rather than shrinking to a third size', () => {
    expect(richText).toContain('.mood-comment-content .mood-comment-quote');
    const quoteAuthor = ruleBody(
      richText,
      '.mood-comment-content .mood-comment-quote .mood-item-quote-author',
    );
    expect(quoteAuthor).toContain('font-size: var(--comment-meta)');
    const quoteText = ruleBody(
      richText,
      '.mood-comment-content .mood-comment-quote .mood-item-quote-text',
    );
    expect(quoteText).toContain('font-size: var(--comment-meta)');
  });

  test('the header carries no bullet separator', () => {
    expect(styles).not.toContain('.mood-comment-date::before');
  });
});
