import { render } from 'astro:content';
import type { DocsGroup } from '@/features/docs/server/nav';
import { docsHtmlToText } from '@/features/docs/server/search-text';

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

// Built from the same groups the sidebar renders, so the index and the nav can
// never disagree about what pages exist in a view.
export async function docsSearchResponse(groups: DocsGroup[]): Promise<Response> {
  const entries: SearchEntry[] = [];

  for (const group of groups) {
    for (const entry of group.entries) {
      // headings comes from render(); body text is the same cached HTML the
      // page renders from, so nothing is compiled twice.
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
