import { defineConfig } from 'vite';

// Builds the demo pages for the GitHub Pages site (scripts/build-site.mjs adds docs, CDN files and media).
// Paths below are relative to `root`.
export default defineConfig({
  root: 'demo',
  // Relative URLs: the site is served from /composable-video-player/demo/.
  base: './',
  publicDir: false,
  build: {
    outDir: '../site/demo',
    emptyOutDir: true,
    target: 'es2020',
    rollupOptions: {
      input: { index: 'index.html', compat: 'compat.html' },
    },
  },
});
