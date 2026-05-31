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
  // Public docs skip auth; non-public docs stay behind the admin session.
  schema: docsSchema({
    extend: z.object({
      public: z.boolean().default(false),
      internal: z.boolean().default(false),
    }),
  }),
});

export const collections = {
  pages,
  docs,
};
