# Composable Video Player

A PlayerJS-like HTML5 video player in pure TypeScript: zero runtime dependencies, a typed API, plugins, and a declarative JSON layout. hls.js is loaded on demand for HLS where it isn't native.

## Quick start

```ts
import { createPlayer } from 'composable-video-player';

const player = createPlayer({
  container: 'player',
  source: '[360p]https://cdn/v360.mp4,[720p]https://cdn/v720.mp4',
  subtitle: '[English]https://cdn/en.vtt',
  thumbnails: 'https://cdn/thumbs.vtt',
  title: 'My video',
});
player.on('time', (t) => console.log(t));
player.command('setQuality', 0);
```

`createPlayerCore` is the same as `createPlayer` but without default plugins — use it with your own plugin list for smaller bundles.

PlayerJS-style:

```html
<div id="player"></div>
<script src="player.umd.cjs"></script>
<script>
  var player = new Playerjs({ id: 'player', file: '//cdn/video.m3u8', default_quality: 'max' });
  function PlayerjsEvents(event, id, data) { /* … */ }
  player.api('seek', '+10');
</script>
```

### PlayerJS compat notes

- `postmessage` should be used together with `postmessageOrigin`.
- `ready` names a global function that is called after init.
- `PlayerjsAsync` must be defined before the bundle loads.

## Concepts

- **Source syntax** — `[Label]url` qualities, `{Label}url;…` audio tracks, `a or b` fallback, `a and b` random, `(subtitle:[En]url)`, `url[seek:10]`, JSON/URL playlists.
- **Plugins** — `defaultPlugins()`: quality, speed, audio tracks, subtitles, thumbnails, playlist, hotkeys, memory, autoplay, media session. A plugin is `{ name, setup(ctx) }` and can register providers, components, menus, hide rules, commands, source transforms and layers.
- **Layout** — JSON tree of component types with shared props (`hint`, `scale`, `margin`, `anchor`, `hide`, `action`, …). Start from `defaultLayout`.
- **Theme** — CSS custom properties (`--vp-color-1..3`, `--vp-toolbar-bg`, …) or the `theme` option.

## Development

```bash
npm install
npm run assets   # generate demo media (ffmpeg)
npm run dev      # demo at http://localhost:5173
npm test && npm run typecheck
npm run build    # dist/player.js (ESM), dist/player.umd.cjs, dist/types
npm run check:types-consumer  # typecheck the packed typings from a nodenext/bundler consumer
```

Relative imports carry explicit `.js` extensions (`tsconfig.json` uses `NodeNext` resolution, so a missing one fails typecheck).

Design: `docs/superpowers/specs/2026-10-14-composable-video-player-design.md`.
