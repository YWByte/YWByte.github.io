import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://ywbyte.github.io',
  markdown: {
    shikiConfig: { themes: { light: 'github-light', dark: 'github-dark' } },
  },
});
