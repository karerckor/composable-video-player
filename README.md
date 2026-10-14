# composable-video-player

[![npm](https://img.shields.io/npm/v/composable-video-player)](https://www.npmjs.com/package/composable-video-player)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/karerckor/composable-video-player/actions/workflows/ci.yml/badge.svg)](https://github.com/karerckor/composable-video-player/actions/workflows/ci.yml)

An HTML5/HLS video player in TypeScript with no runtime dependencies. It has a typed API, a plugin system, and a UI you describe as a JSON layout. It reads the PlayerJS source syntax (`[720p]url,[1080p]url`, `{English}url;{French}url`, `a or b`, …) and includes a drop-in `new Playerjs({...})` facade. Qualities, audio tracks, subtitles, thumbnails, playlists, hotkeys, and memory are plugins you can replace or extend. hls.js is loaded on demand, and only for HLS.

**[Documentation](https://karerckor.github.io/composable-video-player/guide/getting-started.html)** · **[Live demo](https://karerckor.github.io/composable-video-player/demo/)** · **[PlayerJS compat demo](https://karerckor.github.io/composable-video-player/demo/compat.html)**

## Install

```bash
npm install composable-video-player
```

Or from a CDN:

```html
<!-- script tag: window.VP and window.Playerjs -->
<script src="https://cdn.jsdelivr.net/npm/composable-video-player@0.1/dist/player.umd.js"></script>

<!-- ES module -->
<script type="module">
  import { createPlayer } from 'https://cdn.jsdelivr.net/npm/composable-video-player@0.1/dist/player.js';
</script>
```

The CSS is bundled and injected automatically.

## Examples

**Typed API (bundler)**

```ts
import { createPlayer } from 'composable-video-player';

const player = createPlayer({
  container: 'player', // element id or HTMLElement
  source: '[360p]https://cdn.example.com/v360.mp4,[720p]https://cdn.example.com/v720.mp4',
  title: 'My video',
  subtitle: '[English]https://cdn.example.com/en.vtt',
  thumbnails: 'https://cdn.example.com/thumbs.vtt',
});

player.on('time', (t) => console.log(t));
player.command('setQuality', 0);
player.command('seek', '+10');
```

**Script tag (UMD)**

```html
<div id="player"></div>
<script src="https://cdn.jsdelivr.net/npm/composable-video-player@0.1/dist/player.umd.js"></script>
<script>
  var player = VP.createPlayer({ container: 'player', source: 'https://cdn.example.com/video.m3u8', theme: { color1: '#e11d48' } });
</script>
```

**PlayerJS compatible**

```html
<div id="player"></div>
<script src="https://cdn.jsdelivr.net/npm/composable-video-player@0.1/dist/player.umd.js"></script>
<script>
  function PlayerjsEvents(event, id, data) { if (event === 'end') console.log('done'); }
  var player = new Playerjs({ id: 'player', file: '//cdn.example.com/video.m3u8', default_quality: 'max' });
  player.api('seek', '+10');
</script>
```

## Features

- MP4/WebM and HLS: hls.js is lazy-loaded from jsDelivr (pinned, with SRI) where MSE exists, and native HLS is used on iPhone. Self-hosting is supported.
- PlayerJS source syntax: qualities, audio tracks, `or` fallbacks, `and` random pick, `[seek:N]`, inline subtitles. JSON/URL playlists with folders.
- Typed commands, events, and reactive state (`player.select`), plus the string `api()` of PlayerJS.
- Plugins: quality, speed, audio tracks, subtitles (WebVTT/SRT), sprite thumbnails, playlist, hotkeys, memory, autoplay with muted fallback, and Media Session. Write your own with typed options and commands.
- Declarative JSON layout: anchors, hide rules, click actions, text templates, and a headless mode (`layout: false`).
- Theming with CSS variables or the `theme` option (light themes included), replaceable icons, and English/Russian UI with per-key overrides.
- Timeline markers (`state.markers`) for chapters and ad breaks.
- PlayerJS facade: `new Playerjs`, `PlayerjsEvents`, DOM events, `PlayerjsAsync`, and an iframe `postMessage` bridge with an origin check.
- No runtime dependencies. About 33 KB (ESM) / 29 KB (UMD) gzipped, CSS included.

## Documentation

1. [Getting started](https://karerckor.github.io/composable-video-player/guide/getting-started.html): install, quick start, CDN, sizing, browser support
2. [Options](https://karerckor.github.io/composable-video-player/guide/options.html): every `PlayerOptions` field, core and plugin
3. [Sources](https://karerckor.github.io/composable-video-player/guide/sources.html): source syntax, `SourceSpec`, playlists, HLS, subtitles, thumbnails
4. [API](https://karerckor.github.io/composable-video-player/guide/api.html): methods, commands, events, state
5. [Layout](https://karerckor.github.io/composable-video-player/guide/layout.html): components, shared props, hide rules, actions, headless mode
6. [Theming](https://karerckor.github.io/composable-video-player/guide/theming.html): CSS variables, class hooks, icons, i18n
7. [Plugins](https://karerckor.github.io/composable-video-player/guide/plugins.html): built-in plugins, writing plugins, markers, worked examples
8. [PlayerJS compatibility](https://karerckor.github.io/composable-video-player/guide/playerjs-compat.html): options mapping, `api()`, events, postMessage
9. [CDN and builds](https://karerckor.github.io/composable-video-player/guide/cdn-and-builds.html): which file to use, version pinning, self-hosting, CSP

The Markdown sources are in [`docs/guide/`](docs/guide/).

## Development

```bash
npm install
npm run assets   # generate demo media (needs ffmpeg)
npm run dev      # demo at http://localhost:5173
npm test && npm run typecheck
npm run build    # dist/player.js (ESM), dist/player.umd.cjs + dist/player.umd.js (UMD), dist/types
npm run check:types-consumer  # typecheck the packed typings from a nodenext/bundler consumer
npm run site     # build the GitHub Pages site (docs, demo, cdn/) into site/
```

Relative imports carry explicit `.js` extensions. `tsconfig.json` uses `NodeNext` resolution, so a missing extension fails the typecheck.

## License

[MIT](LICENSE)
