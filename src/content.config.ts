import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

const pages = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    updatedAt: z.string().optional(),
  }),
});

const docs = defineCollection({
  loader: docsLoader(),
  // Public docs skip auth; non-public docs stay behind the admin session.
  schema: docsSchema({
    extend: z.object({
      public: z.boolean().default(false),
      internal: z.boolean().default(false),
    }),
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

export const collections = {
  pages,
  docs,
  components,
};
