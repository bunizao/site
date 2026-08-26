// Prerendered search index for the docs-only search dialog (DocsSearch.astro).
// Built once at compile time from the same content collection the sidebar
// reads, so the index and the nav can never disagree about what pages exist.
import { render } from 'astro:content';
import { getDocsNav } from '@/features/docs/server/nav';
import { docsHtmlToText } from '@/features/docs/server/search-text';

export const prerender = true;

interface SearchHeading {
  slug: string;
  text: string;
  depth: 2 | 3;
}

interface SearchEntry {
  id: string;
  title: string;
  description: string;
  group: string;
  headings: SearchHeading[];
  text: string;
}

export async function GET() {
  const groups = await getDocsNav();
  const entries: SearchEntry[] = [];

  for (const group of groups) {
    for (const entry of group.entries) {
      // headings comes from render(); body text is the same cached HTML
      // [...slug].astro renders the page from, so nothing is compiled twice.
      const { headings } = await render(entry);
      entries.push({
        id: entry.id,
        title: entry.data.title,
        description: entry.data.description,
        group: group.label,
        headings: headings
          .filter((heading) => heading.depth === 2 || heading.depth === 3)
          .map((heading) => ({
            slug: heading.slug,
            text: heading.text,
            depth: heading.depth as 2 | 3,
          })),
        text: docsHtmlToText(entry.rendered?.html ?? ''),
      });
    }
  }

  return new Response(JSON.stringify(entries), {
    headers: { 'Content-Type': 'application/json' },
  });
}
