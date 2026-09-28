/* How the portal reads site-api's per-row answer to a bulk act: each row
   lands where site-api says it is, and one receipt sums up the rows it
   could not change. The hook around these is covered end to end in
   tests/e2e/portal-comments-actions.pw.ts. */

import { describe, expect, test } from 'bun:test';
import { staysIn, unchangedReceipt, type Outcome, type UnchangedRow } from '@/features/portal/comments/data';
import { inView } from '@/features/portal/messages/data';

const unchanged = (entries: Array<[string, UnchangedRow['status']]>): Map<string, UnchangedRow> =>
  new Map(entries.map(([id, status]) => [id, { status, line: 'why' }]));

describe('portal comments: rows site-api left as they were', () => {
  test('stay in a view only where their real status belongs', () => {
    const rows = unchanged([['a', 'deleted'], ['b', 'held'], ['gone', null]]);
    expect(staysIn(rows, 'held')).toEqual(['b']);
    expect(staysIn(rows, 'deleted')).toEqual(['a']);
    expect(staysIn(rows, 'published')).toEqual([]);
    // All keeps every row that still exists, in place with its status.
    expect(staysIn(rows, 'all')).toEqual(['a', 'b']);
  });

  test('one receipt: how many were done, how many were already elsewhere, and where', () => {
    const outcomes: Outcome[] = [
      { id: 'a', result: 'not_available', status: 'deleted' },
      { id: 'b', result: 'not_available', status: 'published' },
      { id: 'c', result: 'not_available', status: 'deleted' },
    ];
    expect(unchangedReceipt('approve', 5, outcomes)).toEqual({
      title: '2 approved, 3 already elsewhere',
      description: 'Someone moved them first: now Deleted (2), Published (1).',
    });
    expect(unchangedReceipt('hide', 2, outcomes.slice(0, 1))).toEqual({
      title: '1 unpublished, 1 already elsewhere',
      description: 'Someone moved it first: now Deleted (1).',
    });
  });

  test('a row with no status is gone, and a restore past its window is counted apart', () => {
    const receipt = unchangedReceipt('restore', 3, [
      { id: 'a', result: 'not_available', status: null },
      { id: 'b', result: 'not_restorable', status: 'deleted' },
    ]);
    expect(receipt.title).toBe('1 restored, 1 already elsewhere, 1 past restoring');
    expect(receipt.description).toBe('Someone moved it first: now Gone (1). Past 30 days, or removed by the writer or a ban.');
  });

  test('none changed says so', () => {
    const receipt = unchangedReceipt('approve', 2, [
      { id: 'a', result: 'not_available', status: 'deleted' },
      { id: 'b', result: 'not_available', status: 'deleted' },
    ]);
    expect(receipt.title).toBe('None of the 2 changed, 2 already elsewhere');
  });
});

describe('portal messages: trays', () => {
  test('Inbox holds new, read and replied; Archived and Spam their own', () => {
    expect(['new', 'read', 'replied', 'archived', 'spam'].filter((state) => inView('inbox', state as never))).toEqual(['new', 'read', 'replied']);
    expect(inView('archived', 'archived')).toBe(true);
    expect(inView('spam', 'read')).toBe(false);
  });
});
