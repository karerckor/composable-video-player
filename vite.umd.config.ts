import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/umd.ts',
      name: 'VP',
      formats: ['umd'],
      fileName: () => 'player.umd.cjs',
    },
    emptyOutDir: false,
    sourcemap: true,
    target: 'es2020',
  },
});
