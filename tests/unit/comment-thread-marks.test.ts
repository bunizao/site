import { describe, expect, test } from 'bun:test';

import { readThreadMarks } from '../../src/features/comments/thread-marks';
import { pinFirst } from '../../src/features/mood/shared/comments';

const row = (id: string, extra: { parentId?: string | null; pinned?: boolean; locked?: boolean } = {}) => ({
  id,
  parentId: null,
  ...extra,
});

describe('readThreadMarks', () => {
  test('reads the pinned root and the locked roots', () => {
    const marks = readThreadMarks([
      row('a'),
      row('pin', { pinned: true }),
      row('lock', { locked: true }),
    ]);
    expect(marks.pinnedId).toBe('pin');
    expect([...marks.lockedRoots]).toEqual(['lock']);
  });

  test('a locked root closes replies on itself and on every reply under it', () => {
    const marks = readThreadMarks([
      row('lock', { locked: true }),
      row('lock-reply', { parentId: 'lock' }),
      row('open'),
      row('open-reply', { parentId: 'open' }),
    ]);
    expect([...marks.noReply].sort()).toEqual(['lock', 'lock-reply']);
  });

  test('a reply carrying the pinned or locked flag marks nothing', () => {
    // Only roots can be pinned or locked; a flag on a reply is stale data.
    const marks = readThreadMarks([
      row('root'),
      row('reply', { parentId: 'root', pinned: true, locked: true }),
    ]);
    expect(marks.pinnedId).toBeNull();
    expect(marks.lockedRoots.size).toBe(0);
    expect(marks.noReply.size).toBe(0);
  });

  test('keeps the first pin when a page carries two', () => {
    const marks = readThreadMarks([row('first', { pinned: true }), row('second', { pinned: true })]);
    expect(marks.pinnedId).toBe('first');
  });

  test('an unmarked page reads as no marks', () => {
    const marks = readThreadMarks([row('a'), row('b', { parentId: 'a' })]);
    expect(marks).toEqual({ pinnedId: null, lockedRoots: new Set(), noReply: new Set() });
  });
});

describe('pinFirst', () => {
  type Item = { id: string; commentId?: string };
  const web = (id: string, commentId: string): Item => ({ id, commentId });
  const telegram = (id: string): Item => ({ id });

  test('moves the pinned web comment to the front and keeps the rest in order', () => {
    const result = pinFirst([telegram('1'), web('2', 'c2'), web('3', 'pin')], 'pin');
    expect(result.map((item) => item.id)).toEqual(['3', '1', '2']);
  });

  test('prepends the fallback when the pin is not on the page', () => {
    const fallback = web('site-pin', 'pin');
    const result = pinFirst([telegram('1'), web('2', 'c2')], 'pin', fallback);
    expect(result.map((item) => item.id)).toEqual(['site-pin', '1', '2']);
  });

  test('leaves the page alone without a pin, or without a fallback for a missing one', () => {
    const page = [telegram('1'), web('2', 'c2')];
    expect(pinFirst(page, null)).toBe(page);
    expect(pinFirst(page, 'pin')).toBe(page);
  });

  test('a Telegram item never matches the pin', () => {
    // Bridged rows carry no commentId; a Telegram message id that happens to
    // equal the site id must not be mistaken for the pinned comment.
    const result = pinFirst([web('2', 'c2'), telegram('pin')], 'pin');
    expect(result.map((item) => item.id)).toEqual(['2', 'pin']);
  });
});
