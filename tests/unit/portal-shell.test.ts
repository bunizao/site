/* The phone shell's pure parts: which tab a path lights up, the inbox key
   the tab bar reads its unread count from, and the palette's Search group.
   The tab bar and the palette themselves are covered in
   tests/e2e/admin-portal.pw.ts. */

import { describe, expect, test } from 'bun:test';
import { messageKeys } from '@/features/portal/messages/data';
import { INBOX_KEY, tabFor } from '@/features/portal/app/shell/BottomTabs';
import { searchGroup } from '@/features/portal/app/shell/CommandPalette';

describe('portal tab bar', () => {
  test('a tab stays lit on every screen under it', () => {
    expect(tabFor('/')).toBe('home');
    expect(tabFor('/comments')).toBe('comments');
    expect(tabFor('/comments/bans')).toBe('comments');
    expect(tabFor('/comments/source/ip/1.2.3.4')).toBe('comments');
    expect(tabFor('/messages/m-1')).toBe('messages');
    expect(tabFor('/subscribers/abc')).toBe('subscribers');
  });

  test('any other screen belongs to More', () => {
    expect(tabFor('/analytics')).toBe('more');
    expect(tabFor('/broadcasts/new')).toBe('more');
    expect(tabFor('/commentsx')).toBe('more');
  });

  test('reads the same inbox query the Messages screen fills', () => {
    expect<readonly string[]>(INBOX_KEY).toEqual(messageKeys.list('inbox'));
  });
});

describe('portal palette search', () => {
  test('appears only for a typed query', () => {
    expect(searchGroup('')).toBeNull();
    expect(searchGroup('   ')).toBeNull();
  });

  test('offers comments first, and names the trimmed query', () => {
    const group = searchGroup('  moonpump ')!;
    expect(group.items.map((item) => item.label)).toEqual(['Comments matching “moonpump”', 'Subscribers matching “moonpump”']);
    expect(group.items.every((item) => item.search)).toBe(true);
  });

  test('puts subscribers first for an address', () => {
    expect(searchGroup('noah.kim@example.com')!.items[0].value).toBe('search:subscribers');
  });
});
