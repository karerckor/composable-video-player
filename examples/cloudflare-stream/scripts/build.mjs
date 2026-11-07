import { build } from 'esbuild';
import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const preview = process.argv.includes('--pages');
const outdir = preview ? 'preview-dist' : 'dist';
await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });
const html = (await readFile('index.html', 'utf8')).replaceAll('href="/', 'href="./').replaceAll('src="/', 'src="./');
const { writeFile } = await import('node:fs/promises');
await Promise.all([
  writeFile(`${outdir}/index.html`, html),
  cp('public', outdir, { recursive: true }),
  build({ entryPoints: ['src/client.ts'], bundle: true, format: 'esm', target: 'es2022', outdir: `${outdir}/assets`, entryNames: 'app', minify: true, sourcemap: true,
    plugins: [{ name: 'example-data', setup(builder) {
      if (preview) builder.onResolve({ filter: /^\.\/data\.js$/ }, () => ({ path: resolve('src/preview-data.ts') }));
    } }, { name: 'example-source', setup(builder) {
      builder.onResolve({ filter: /\?raw$/ }, args => ({ path: resolve(args.resolveDir, args.path.slice(0, -4)), namespace: 'example-source' }));
      builder.onLoad({ filter: /.*/, namespace: 'example-source' }, async args => ({ contents: await readFile(args.path, 'utf8'), loader: 'text' }));
    } }],
  }),
]);
console.log(preview ? 'Built the public-only Pages preview in preview-dist/.' : 'Built the library frontend in dist/. Wrangler bundles the Hono Worker.');
