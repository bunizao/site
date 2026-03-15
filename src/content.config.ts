import { defineCollection } from 'astro:content';
import { z } from 'astro:schema';

const pages = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    updatedAt: z.string().optional(),
  }),
});

export const collections = {
  pages,
};
