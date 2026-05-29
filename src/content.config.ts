import { defineCollection } from 'astro:content';
import { z } from 'astro:schema';
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
  // Extend Starlight's schema with an `internal` flag that drives the auth gate
  // and the lock badge in the sidebar.
  schema: docsSchema({
    extend: z.object({
      internal: z.boolean().default(false),
    }),
  }),
});

export const collections = {
  pages,
  docs,
};
