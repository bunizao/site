// Prerendered search index for the docs-only search dialog (DocsSearch.astro).
// Public pages only; the owner's index is /dev/docs/search.json.
import { getDocsNav } from '@/features/docs/server/nav';
import { docsSearchResponse } from '@/features/docs/server/search-index';

export const prerender = true;

export async function GET() {
  return docsSearchResponse(await getDocsNav());
}
