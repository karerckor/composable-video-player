// Assembles the GitHub Pages site in site/:
//   index.html        landing page (docs/site/landing.html)
//   guide/*.html      docs/guide/NN-name.md rendered with marked
//   demo/             built by vite.site.config.ts (run before this script) + demo media
//   cdn/              the dist/ bundles, so <script src=".../cdn/player.umd.js"> works from Pages
// Run via `npm run site`.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { marked } from 'marked';
import { execFileSync } from 'node:child_process';
import { renderCodeBlock, highlightHtmlCode } from './site-highlight.mjs';

const OUT = 'site';
// Vite has already built demo/. Rebuild the remaining outputs without stale files.
for (const directory of ['guide', 'assets', 'cdn', 'examples/stream-library']) {
  rmSync(join(OUT, directory), { recursive: true, force: true });
}
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const REPO = 'https://github.com/karerckor/composable-video-player';
const NPM = `https://www.npmjs.com/package/${pkg.name}`;
const [major, minor] = pkg.version.split('.');
const RANGE = `${major}.${minor}`;

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slug = (s) =>
  s
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z]+;/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '');

// ---------- guide pages ----------
const GUIDE_DIR = 'docs/guide';
const guideFiles = readdirSync(GUIDE_DIR)
  .filter((f) => /^\d\d-.+\.md$/.test(f))
  .sort();
const pageName = (file) => file.replace(/^\d\d-/, '').replace(/\.md$/, '');
const guides = guideFiles.map((file) => {
  const md = readFileSync(join(GUIDE_DIR, file), 'utf8');
  const title = (md.match(/^#\s+(.+)$/m)?.[1] ?? pageName(file)).trim();
  return { file, name: pageName(file), title, md };
});

marked.use({
  gfm: true,
  walkTokens(token) {
    if (token.type !== 'link') return;
    // Cross-links between guide files: 05-layout.md#x -> layout.html#x
    token.href = token.href.replace(/^(?:\.\/)?(\d\d-[\w-]+)\.md(#.*)?$/, (_m, file, hash = '') => `${pageName(`${file}.md`)}.html${hash}`);
  },
  renderer: {
    code({ text, lang }) {
      return renderCodeBlock(text, lang);
    },
    heading({ tokens, depth }) {
      const html = this.parser.parseInline(tokens);
      const id = slug(html);
      return `<h${depth} id="${id}"><a class="anchor" href="#${id}" aria-hidden="true">#</a>${html}</h${depth}>\n`;
    },
  },
});

function layout({ title, root, body, nav = '' }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(pkg.description)}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="A working video library with chapters, captions, timecoded sharing and custom plugins. Explore the open-source TypeScript player and deployable example." />
    <meta property="og:image" content="https://karerckor.github.io/composable-video-player/assets/images/video-library-link-preview.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <link rel="icon" href="data:," />
    <link rel="stylesheet" href="${root}assets/site.css" />
  </head>
  <body class="${nav ? 'guide-page' : 'home'}">
    <header class="top">
      <a class="brand" href="${root}">▶ ${pkg.name}</a>
      <nav>
        <a href="${root}guide/${guides[0]?.name ?? ''}.html">Docs</a>
        <a href="${root}examples/stream-library/">Video library</a>
        <a href="${root}demo/">Playground</a>
        <a href="${REPO}">GitHub</a>
        <a href="${NPM}">npm</a>
      </nav>
    </header>
    ${nav}
    <main class="content">${body}</main>
  </body>
</html>
`;
}

mkdirSync(join(OUT, 'guide'), { recursive: true });
mkdirSync(join(OUT, 'assets'), { recursive: true });
for (const g of guides) {
  const nav = `<aside class="sidebar"><nav>${guides
    .map((o) => `<a href="${o.name}.html"${o.name === g.name ? ' aria-current="page"' : ''}>${escapeHtml(o.title)}</a>`)
    .join('')}</nav><p class="edit"><a href="${REPO}/blob/main/${GUIDE_DIR}/${g.file}">Edit this page</a></p></aside>`;
  const body = marked.parse(g.md);
  writeFileSync(join(OUT, 'guide', `${g.name}.html`), layout({ title: `${g.title} — ${pkg.name}`, root: '../', body, nav }));
}

// ---------- landing page ----------
const guideList = guides.map((g) => `<li><a href="guide/${g.name}.html">${escapeHtml(g.title)}</a></li>`).join('');
const landing = readFileSync('docs/site/landing.html', 'utf8')
  .replaceAll('{{version}}', pkg.version)
  .replaceAll('{{range}}', RANGE)
  .replaceAll('{{name}}', pkg.name)
  .replaceAll('{{repo}}', REPO)
  .replaceAll('{{guides}}', guideList);
writeFileSync(join(OUT, 'index.html'), layout({ title: `${pkg.name} — composable video player`, root: '', body: highlightHtmlCode(landing) }));
cpSync('docs/site/site.css', join(OUT, 'assets/site.css'));

// ---------- CDN files and demo media ----------
mkdirSync(join(OUT, 'cdn'), { recursive: true });
for (const f of readdirSync('dist')) if (/^player\./.test(f)) cpSync(join('dist', f), join(OUT, 'cdn', f));

if (!existsSync('demo/assets/video-720.mp4')) throw new Error('demo/assets is missing: run `npm run assets` first');
cpSync('demo/assets', join(OUT, 'demo/assets'), { recursive: true });
cpSync('dist/player.umd.js', join(OUT, 'demo/assets/player.umd.js'));
cpSync('dist/player.umd.cjs.map', join(OUT, 'demo/assets/player.umd.cjs.map'));

// Same example frontend with public data; no Worker/API credentials on Pages.
execFileSync('npm', ['run', 'build:preview'], { cwd: 'examples/cloudflare-stream', stdio: 'inherit' });
mkdirSync(join(OUT, 'examples/stream-library'), { recursive: true });
cpSync('examples/cloudflare-stream/preview-dist', join(OUT, 'examples/stream-library'), { recursive: true });
// Only checked-in website images are published; local launch drafts are separate.
mkdirSync(join(OUT, 'assets/images'), { recursive: true });
cpSync('docs/site/images', join(OUT, 'assets/images'), { recursive: true });

// GitHub Pages: serve files as-is (no Jekyll processing of _-prefixed paths).
writeFileSync(join(OUT, '.nojekyll'), '');
console.log(`site/ ready: ${guides.length} guide pages, cdn/ (${pkg.version}), demo/`);
