// The owner's docs search index: public and internal pages together. Rendered
// per request so the /dev Access gate in the middleware applies to it.
import { getDocsNav } from '@/features/docs/server/nav';
import { docsSearchResponse } from '@/features/docs/server/search-index';

export const prerender = false;

export async function GET() {
  return docsSearchResponse(await getDocsNav({ includeInternal: true }));
}
