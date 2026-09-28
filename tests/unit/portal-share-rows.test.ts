import { describe, expect, test } from 'bun:test';
import { shareRowsById } from '../../src/features/portal/app/share-rows';

interface Row {
  id: string;
  n: number;
}

const share = shareRowsById<Row>('rows', (row) => row.id);
const rows = (...ids: string[]): Row[] => ids.map((id) => ({ id, n: 1 }));

describe('shareRowsById', () => {
  test('keeps each row object when a row above it leaves', () => {
    const old = { pages: [{ rows: rows('a', 'b', 'c') }], pageParams: [0] };
    const next = { pages: [{ rows: rows('b', 'c') }], pageParams: [0] };
    const shared = share(old, next) as typeof next;
    expect(shared.pages[0].rows[0]).toBe(old.pages[0].rows[1]);
    expect(shared.pages[0].rows[1]).toBe(old.pages[0].rows[2]);
  });

  test('gives a changed row a new object and keeps the rest', () => {
    const old = { rows: rows('a', 'b') };
    const next = { rows: [{ id: 'b', n: 2 }, { id: 'a', n: 1 }] };
    const shared = share(old, next) as typeof next;
    expect(shared.rows[0]).not.toBe(old.rows[1]);
    expect(shared.rows[0]).toEqual({ id: 'b', n: 2 });
    expect(shared.rows[1]).toBe(old.rows[0]);
  });

  test('returns the old data when nothing changed', () => {
    const old = { pages: [{ rows: rows('a', 'b') }], pageParams: [0] };
    expect(share(old, structuredClone(old))).toBe(old);
  });

  test('matches a select result, the bare row array, by id too', () => {
    const old = rows('a', 'b', 'c');
    const shared = share(old, rows('c', 'a')) as Row[];
    expect(shared[0]).toBe(old[2]);
    expect(shared[1]).toBe(old[0]);
  });

  test('falls back to plain sharing for other shapes', () => {
    const old = { total: 3 };
    expect(share(old, { total: 3 })).toBe(old);
    expect(share(undefined, { total: 4 })).toEqual({ total: 4 });
  });
});
