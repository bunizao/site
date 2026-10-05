import { getCollection, type CollectionEntry } from 'astro:content';

export type DocsEntry = CollectionEntry<'docs'> | CollectionEntry<'internalDocs'>;

export interface DocsGroup {
  label: string;
  blurb: string;
  entries: DocsEntry[];
}

// Sidebar sections, in the order they render. A group listed here but with no
// entries is dropped; an entry whose `group` is missing from this list lands in
// a trailing catch-all rather than disappearing, so a typo in frontmatter is
// visible on the page instead of silently swallowing a doc.
const GROUPS: Array<{ label: string; blurb: string }> = [
  {
    label: 'Start',
    blurb: 'What buxx.me is, how it fits together, and how to run it locally.',
  },
  {
    label: 'Writing',
    blurb: 'How to write a post: the directive syntax, every directive, and tags.',
  },
  {
    label: 'API',
    blurb: 'Every public HTTP route on buxx.me, who can call it, and its limits.',
  },
  {
    label: 'Surfaces',
    blurb: 'How each part of the site is built and the rules it follows.',
  },
  {
    label: 'Platform',
    blurb: 'The Workers, data pipelines, delivery, auth, privacy, and tests.',
  },
];

const UNGROUPED = { label: 'More', blurb: 'Everything else.' };

export const docPath = (id: string): string => `/docs/${id}`;

// A *.internal.md page: listed in the rail with a lock, readable by the owner
// only (LockedDocPage.astro).
export const isInternalDoc = (entry: DocsEntry): boolean => entry.collection === 'internalDocs';

// Public pages only by default: that is what gets prerendered, indexed and
// listed in the sitemap. The rail passes includeInternal to show the locked ones.
export async function getDocsNav({ includeInternal = false } = {}): Promise<DocsGroup[]> {
  const entries: DocsEntry[] = await getCollection('docs', ({ data }) => !data.draft);
  if (includeInternal) {
    const ids = new Set(entries.map((entry) => entry.id));
    for (const entry of await getCollection('internalDocs', ({ data }) => !data.draft)) {
      // api/foo.md and api/foo.internal.md would both claim /docs/api/foo.
      if (ids.has(entry.id)) throw new Error(`Internal doc shadows a public page: ${entry.id}`);
      entries.push(entry);
    }
  }

  const byGroup = new Map<string, DocsEntry[]>();
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
// whole tree without going back to the index. Walking the public pages never
// steps onto a locked one; only the owner, already on a locked page, sees them.
export function getDocsSiblings(groups: DocsGroup[], current: DocsEntry) {
  const flat = groups
    .flatMap((group) => group.entries)
    .filter((entry) => isInternalDoc(current) || !isInternalDoc(entry));
  const index = flat.findIndex((entry) => entry.id === current.id);
  return {
    prev: index > 0 ? flat[index - 1] : null,
    next: index >= 0 && index < flat.length - 1 ? flat[index + 1] : null,
  };
}
