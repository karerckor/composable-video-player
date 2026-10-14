import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: () => 'player.js',
    },
    sourcemap: true,
    target: 'es2020',
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    restoreMocks: true,
    // Keep the real stylesheet text for `?inline` imports (Vitest empties CSS by default).
    css: { include: /player\.css/ },
    setupFiles: ['tests/setup.ts'],
  },
});
