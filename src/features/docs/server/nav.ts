import { getCollection, type CollectionEntry } from 'astro:content';

export interface DocsGroup {
  label: string;
  blurb: string;
  entries: CollectionEntry<'docs'>[];
}

// Sidebar sections, in the order they render. A group listed here but with no
// entries is dropped; an entry whose `group` is missing from this list lands in
// a trailing catch-all rather than disappearing, so a typo in frontmatter is
// visible on the page instead of silently swallowing a doc.
const GROUPS: Array<{ label: string; blurb: string }> = [
  {
    label: 'Start',
    blurb: 'What this site is, how it is put together, and how to run it.',
  },
  {
    label: 'Writing',
    blurb: 'Composing a post: the directive grammar, every directive, and tags.',
  },
  {
    label: 'API',
    blurb: 'Every HTTP route on buxx.me — public, gated, and internal.',
  },
  {
    label: 'Surfaces',
    blurb: 'The pages themselves and the design rules each one follows.',
  },
  {
    label: 'Platform',
    blurb: 'Workers, ingestion, delivery, auth, and what the tests cover.',
  },
];

const UNGROUPED = { label: 'More', blurb: 'Everything else.' };

export const docPath = (id: string): string => `/docs/${id}`;

export async function getDocsNav(): Promise<DocsGroup[]> {
  const entries = await getCollection('docs', ({ data }) => !data.draft);
  const byGroup = new Map<string, CollectionEntry<'docs'>[]>();
  for (const entry of entries) {
    const key = GROUPS.some((g) => g.label === entry.data.group)
      ? entry.data.group
      : UNGROUPED.label;
    byGroup.set(key, [...(byGroup.get(key) ?? []), entry]);
  }

  return [...GROUPS, UNGROUPED]
    .map(({ label, blurb }) => ({
      label,
      blurb,
      entries: (byGroup.get(label) ?? []).sort(
        (a, b) => a.data.order - b.data.order || a.data.title.localeCompare(b.data.title),
      ),
    }))
    .filter((group) => group.entries.length > 0);
}

// Previous/next across the flattened sidebar order, so a reader can walk the
// whole tree without going back to the index.
export function getDocsSiblings(groups: DocsGroup[], id: string) {
  const flat = groups.flatMap((group) => group.entries);
  const index = flat.findIndex((entry) => entry.id === id);
  return {
    prev: index > 0 ? flat[index - 1] : null,
    next: index >= 0 && index < flat.length - 1 ? flat[index + 1] : null,
  };
}
