# CDN and builds

## Which file to use

| File | Format | Use it for |
| --- | --- | --- |
| `dist/player.js` | ES module, self-contained (CSS included, no imports) | Bundlers (`import … from 'composable-video-player'`) and `<script type="module">`. Tree-shakable: importing it has no side effects. |
| `dist/player.umd.js` | UMD | Classic `<script src>` tags. Defines `window.VP` (the full API) and `window.Playerjs`, and calls `window.PlayerjsAsync()` if defined. |
| `dist/player.umd.cjs` | UMD (same bundle) | `require('composable-video-player')` in CommonJS. Some static hosts serve `.cjs` with a MIME type that browsers refuse for `<script>`, so use the `.js` copy in pages. |
| `dist/types/` | `.d.ts` | TypeScript declarations (resolved automatically). |

Source maps (`player.js.map`, `player.umd.cjs.map`) ship next to the bundles. The package's `exports` map `import` to `player.js` and `require` to `player.umd.cjs`, and also exposes `composable-video-player/dist/*`.

Sizes for 0.1.0, gzipped: about **33 KB** for the ESM file (not whitespace-minified, so your bundler shrinks it further) and about **29 KB** for the minified UMD bundle. Both include the CSS. hls.js is not included. It is fetched only when an HLS source plays in a browser with MSE.

With a bundler, `createPlayerCore` plus only the plugins you import keeps unused plugins and the PlayerJS layer out of your bundle (see [Plugins](07-plugins.md#using-plugins)).

## CDN URLs

**jsDelivr (npm)**, recommended:

```html
<!-- UMD: window.VP and window.Playerjs -->
<script src="https://cdn.jsdelivr.net/npm/composable-video-player@0.1/dist/player.umd.js"></script>

<!-- ES module -->
<script type="module">
  import { createPlayer } from 'https://cdn.jsdelivr.net/npm/composable-video-player@0.1/dist/player.js';
  createPlayer({ container: 'player', source: 'https://example.com/video.mp4' });
</script>
```

**unpkg**:

```html
<script src="https://unpkg.com/composable-video-player@0.1/dist/player.umd.js"></script>
```

**GitHub Pages** (always the latest build from `main`, unversioned):

```html
<script src="https://karerckor.github.io/composable-video-player/cdn/player.umd.js"></script>
<script type="module">
  import { createPlayer } from 'https://karerckor.github.io/composable-video-player/cdn/player.js';
</script>
```

The Pages copy changes with every push to `main`. Use it for experiments, and use a pinned npm CDN URL in production.

### Version pinning

| URL part | Resolves to |
| --- | --- |
| `composable-video-player@0.1.0` | Exactly 0.1.0. Required if you add an SRI `integrity` attribute. |
| `composable-video-player@0.1` | Latest 0.1.x patch (recommended). |
| `composable-video-player@0` | Latest 0.x. Before 1.0, minor versions may contain breaking changes. |
| `composable-video-player` | Latest version. Avoid in production. |

For Subresource Integrity, pin an exact version and add `integrity="sha384-…" crossorigin="anonymous"`. jsDelivr shows the hash on the package's page.

## Self-hosting

Copy the bundle from the installed package to your static files:

```bash
npm install composable-video-player
cp node_modules/composable-video-player/dist/player.umd.js public/vendor/
# optional: source map for debugging
cp node_modules/composable-video-player/dist/player.umd.cjs.map public/vendor/
```

```html
<script src="/vendor/player.umd.js"></script>
```

Nothing else is needed. There are no fonts, images, or separate CSS files.

## HLS engine

HLS playback in browsers with MSE needs hls.js. By default the player loads it on first use from:

```text
https://cdn.jsdelivr.net/npm/hls.js@1.7.3/dist/hls.min.js
```

It uses a pinned SRI hash and `crossorigin="anonymous"`, and loads it once per page. To avoid the third-party request:

1. **Self-host the file** and point the player at it:

   ```ts
   createPlayer({
     container: 'player',
     source: 'https://example.com/master.m3u8',
     hlsUrl: '/vendor/hls.min.js',
     hlsIntegrity: 'sha384-…', // optional; no integrity check unless you set it
   });
   ```

2. **Provide `window.Hls` yourself.** If `window.Hls` exists when an HLS source loads, the player uses it and downloads nothing. You can bundle it:

   ```ts
   import Hls from 'hls.js';
   (window as unknown as { Hls: typeof Hls }).Hls = Hls;
   ```

   or load it with a regular `<script>` tag before playback.

`hlsConfig` is passed to the hls.js constructor in all cases (for example `{ maxBufferLength: 60 }`).

## Content Security Policy

What the player needs from your CSP:

| Directive | Why |
| --- | --- |
| `style-src 'unsafe-inline'` (or the stylesheet's hash) | The CSS is injected as an inline `<style id="vp-styles">`. Per-element styles are set through the CSSOM (`element.style`), which CSP does not restrict. |
| `script-src https://cdn.jsdelivr.net` | Only if HLS sources play with the default hls.js loader. Not needed with `hlsUrl` on your origin or a pre-provided `window.Hls`. |
| `media-src <video hosts> blob:` | Video URLs. hls.js plays through MediaSource `blob:` URLs. |
| `connect-src <hosts>` | HLS manifests and segments (fetched by hls.js), and the subtitle, thumbnail, and playlist files (fetched with `fetch`). |
| `img-src <hosts>` | Poster, thumbnail sprites, and playlist posters. |

If the page already contains an element with `id="vp-styles"`, the player does not inject its stylesheet. You can use that to serve the CSS yourself under a strict `style-src`, for example as `<link id="vp-styles" rel="stylesheet" href="/vendor/player.css">` or as a nonce'd `<style id="vp-styles">`. The CSS is not published as a separate file. Copy `src/theme/player.css` from the repository at the tag that matches your version.

## Building from source

```bash
git clone https://github.com/karerckor/composable-video-player.git
cd composable-video-player
npm install
npm run build   # dist/player.js, dist/player.umd.cjs, dist/player.umd.js, dist/types
```
