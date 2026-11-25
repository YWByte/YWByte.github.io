import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ base: './src/content/blog', pattern: '**/*.md' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    tag: z.string().default('随笔'),
    draft: z.boolean().default(false),
    // 独立 HTML 页面（含交互图）放在 public/ 下，列表直接链接过去
    link: z.string().optional(),
    minutes: z.number().optional(),
  }),
});

export const collections = { blog };
