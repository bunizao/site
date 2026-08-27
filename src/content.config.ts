import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

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
const docs = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/docs' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    group: z.string(),
    order: z.number().default(0),
    // Optional one-word label rendered next to the sidebar entry (e.g. "SSR").
    badge: z.string().optional(),
    // Optional live tool linked beside the page introduction.
    playground: z.string().regex(/^\/[^\s]+$/u).optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = {
  pages,
  components,
  docs,
};
