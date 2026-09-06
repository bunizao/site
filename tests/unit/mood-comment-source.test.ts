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

  test('the chip is titled, so the glyph is never the only cue', () => {
    expect(shared).toContain('chip.title = title');
    expect(shared).toContain("chip.dataset.origin = origin");
  });

  test('the renderer stamps the origin and appends the chip', () => {
    expect(controller).toContain("root.dataset.origin = origin");
    expect(controller).toContain('createCommentSourceChip(origin, sourceLabel');
    expect(controller).toContain('moodCommentsCopy.sourceAria(sourceLabel)');
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
