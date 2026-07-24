import { defineCollection, z } from "astro:content";

const writingSchema = z.object({
  title: z.string(),
  description: z.string(),
  publishedAt: z.coerce.date(),
  updatedAt: z.coerce.date().optional(),
  tags: z.array(z.string()).default([]),
  draft: z.boolean().default(false)
});

const articles = defineCollection({
  type: "content",
  schema: writingSchema
});

export const collections = { articles };
