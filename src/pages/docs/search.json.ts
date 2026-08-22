// Prerendered search index for the docs-only search dialog (DocsSearch.astro).
// Built once at compile time from the same content collection the sidebar
// reads, so the index and the nav can never disagree about what pages exist.
import { render } from 'astro:content';
import { getDocsNav } from '@/features/docs/server/nav';

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

// Truncate per page so the whole corpus stays a small, single fetch — the
// client only ever needs enough body text to find and snippet a match, not
// the whole article.
const MAX_BODY_CHARS = 4000;

// Rendered markdown -> plain text. A regex strip is enough at build time: no
// DOM parser available here, and the output only feeds substring matching.
function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
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
        text: htmlToText(entry.rendered?.html ?? '').slice(0, MAX_BODY_CHARS),
      });
    }
  }

  return new Response(JSON.stringify(entries), {
    headers: { 'Content-Type': 'application/json' },
  });
}
