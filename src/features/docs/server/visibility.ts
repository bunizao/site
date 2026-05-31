const DOCS_PREFIX = '/docs';

export type DocsVisibility = 'public' | 'protected' | 'missing';

type DocsEntry = {
  data: {
    public?: boolean;
  };
};

export type LoadDocsEntry = (slug: string) => Promise<DocsEntry | null | undefined>;

export function isDocsPath(pathname: string): boolean {
  return pathname === DOCS_PREFIX || pathname.startsWith(`${DOCS_PREFIX}/`);
}

export function docsPathToEntrySlug(pathname: string): string | null {
  if (!isDocsPath(pathname)) return null;

  const normalizedPath = pathname.replace(/\/+$/, '') || DOCS_PREFIX;
  if (normalizedPath === DOCS_PREFIX) return 'docs';

  return normalizedPath.replace(/^\//, '');
}

export function getDocsVisibilityFromEntry(entry: DocsEntry | null | undefined): DocsVisibility {
  if (!entry) return 'missing';
  return entry.data.public === true ? 'public' : 'protected';
}

export async function getDocsVisibility(
  pathname: string,
  loadEntry: LoadDocsEntry
): Promise<DocsVisibility> {
  const slug = docsPathToEntrySlug(pathname);
  if (!slug) return 'missing';

  const entry = await loadEntry(slug);
  return getDocsVisibilityFromEntry(entry);
}
