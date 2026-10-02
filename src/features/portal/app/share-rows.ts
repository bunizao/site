import { replaceEqualDeep } from '@tanstack/react-query';

/* TanStack's default structural sharing matches array items by index, so a
   row that leaves or moves in a list (an act, a new row on top) turns every
   row after it into a fresh, equal copy, and each of those re-renders. This
   matches rows by id instead: an unchanged row keeps its object wherever it
   lands, and data that did not change at all (a quiet poll) keeps its
   identity.

   TanStack calls `structuralSharing` for fetched data, `setQueryData`
   writes, placeholder data and `select` results, so it takes all three
   shapes a list comes in: an infinite query's `{ pages }`, one page, and
   the bare row array a `select` returns. Anything else gets the default. */

type Page = Record<string, unknown>;

export function shareRowsById<Row>(field: string, idOf: (row: Row) => string): (old: unknown, next: unknown) => unknown {
  const rowsOf = (value: unknown): Row[] | null => {
    if (Array.isArray(value)) return value as Row[];
    const rows = (value as Page | null | undefined)?.[field];
    return Array.isArray(rows) ? (rows as Row[]) : null;
  };
  const pagesOf = (value: unknown): Page[] | null => {
    const pages = (value as Page | null | undefined)?.pages;
    return Array.isArray(pages) ? (pages as Page[]) : null;
  };

  return (old, next) => {
    const known = new Map<string, Row>();
    for (const page of pagesOf(old) ?? [old]) for (const row of rowsOf(page) ?? []) known.set(idOf(row), row);
    if (known.size === 0) return replaceEqualDeep(old, next);

    const share = (rows: Row[]): Row[] =>
      rows.map((row) => {
        const prior = known.get(idOf(row));
        return prior === undefined ? row : replaceEqualDeep(prior, row);
      });
    const sharePage = (page: Page): Page => {
      const rows = rowsOf(page);
      return rows ? { ...page, [field]: share(rows) } : page;
    };

    const pages = pagesOf(next);
    let shared: unknown;
    if (pages) shared = { ...(next as Page), pages: pages.map(sharePage) };
    else if (Array.isArray(next)) shared = share(next as Row[]);
    else if (rowsOf(next)) shared = sharePage(next as Page);
    else return replaceEqualDeep(old, next);
    return replaceEqualDeep(old, shared) === old ? old : shared;
  };
}
