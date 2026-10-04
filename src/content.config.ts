import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { DOCS_DIR, INTERNAL_DOCS_SUFFIX, isInternalDocsUnlocked } from './features/docs/server/internal-lock';

const pages = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    updatedAt: z.string().optional(),
  }),
});

// One entry per showcased component. The slug is the entry id (filename); the
// usage snippet lives in the Markdown body as its first fenced code block.
const components = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/components' }),
  schema: z.object({
    title: z.string(),
    tagline: z.string(),
    tier: z.enum(['primitive', 'showpiece', 'composition']),
    order: z.number().default(0),
    // Dual install mechanism: registry (shadcn add, name = slug) or npm package.
    install: z.discriminatedUnion('type', [
      z.object({ type: z.literal('npm'), pkg: z.string() }),
      z.object({ type: z.literal('registry') }),
    ]),
    source: z.string().url(),
    credits: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

// One entry per documentation page. The entry id is the URL path under /docs
// (`api/oembed.md` -> /docs/api/oembed), so the folder layout is the route
// layout. `group` decides which sidebar section it lands in; the group order
// itself lives in features/docs/server/nav.ts.
const docsSchema = z.object({
  title: z.string(),
  description: z.string(),
  group: z.string(),
  order: z.number().default(0),
  // Optional one-word label rendered next to the sidebar entry (e.g. "SSR").
  badge: z.string().optional(),
  // Optional live tool linked beside the page introduction.
  playground: z.string().regex(/^\/[^\s]+$/u).optional(),
  draft: z.boolean().default(false),
});

// One tree, two collections. Public pages are everything except
// `*.internal.md`, so no reader of `docs` (the /docs routes, search, sitemap,
// Markdown alternates) can publish an owner-only page by forgetting a filter.
const docs = defineCollection({
  loader: glob({ pattern: ['**/*.md', `!**/*${INTERNAL_DOCS_SUFFIX}`], base: `./${DOCS_DIR}` }),
  schema: docsSchema,
});

// Owner-only pages, rendered per request at /docs/<id> for the owner and as a
// lock screen for everyone else (LockedDocPage.astro). Their id drops
// the suffix, so api/endpoints.internal.md becomes api/endpoints. They are
// transcrypt ciphertext in any checkout without the key, so the collection
// stays empty there instead of failing the schema on encrypted frontmatter.
const internalDocs = defineCollection({
  loader: isInternalDocsUnlocked()
    ? glob({
        pattern: `**/*${INTERNAL_DOCS_SUFFIX}`,
        base: `./${DOCS_DIR}`,
        generateId: ({ entry }) => entry.slice(0, -INTERNAL_DOCS_SUFFIX.length),
      })
    : async () => [],
  schema: docsSchema,
});

export const collections = {
  pages,
  components,
  docs,
  internalDocs,
};
