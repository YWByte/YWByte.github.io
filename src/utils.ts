import { getCollection } from 'astro:content';

export async function getPosts() {
  const posts = await getCollection('blog', ({ data }) => !data.draft);
  return posts.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

export const postHref = (p: { id: string; data: { link?: string } }) => p.data.link ?? `/blog/${p.id}/`;

export const formatDate = (d: Date) => d.toISOString().slice(0, 10);

// 中文按字数、英文按词数估算，约 400 字/分钟
export function readingTime(body = '') {
  const cjk = (body.match(/[\u4e00-\u9fff]/g) || []).length;
  const words = (body.replace(/[\u4e00-\u9fff]/g, ' ').match(/\b\w+\b/g) || []).length;
  return Math.max(1, Math.round((cjk + words * 1.5) / 400));
}
