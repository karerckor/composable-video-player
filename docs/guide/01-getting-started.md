# Getting started

`composable-video-player` is an HTML5 video player written in TypeScript. It has a typed API, a plugin system, and a UI that you describe as a JSON layout tree. It understands the PlayerJS source syntax and has a PlayerJS-compatible facade, so `new Playerjs({...})` pages can switch to it. There are no runtime dependencies. hls.js is downloaded on demand, and only when an HLS (`.m3u8`) source needs it.

- Live demo: <https://karerckor.github.io/composable-video-player/demo/>
- PlayerJS compat demo: <https://karerckor.github.io/composable-video-player/demo/compat.html>
- Source: <https://github.com/karerckor/composable-video-player>

## Features

- **Sources**: MP4/WebM/anything the browser plays, HLS via lazy-loaded hls.js (native HLS where MSE is missing), quality lists (`[720p]url,[1080p]url`), audio tracks (`{English}url;{French}url`), fallback chains (`a or b`), random alternatives (`a and b`), start offsets (`url[seek:30]`). See [Sources](03-sources.md).
- **Typed API**: `player.command('seek', 30)`, `player.on('time', t => …)`, `player.state`, and `player.select(selector, cb)` for reactive state. See [API](04-api.md).
- **PlayerJS-style API**: `player.api('seek', '+10')`, `PlayerjsEvents`, DOM events, and a `postMessage` bridge for iframes. See [PlayerJS compatibility](08-playerjs-compat.md).
- **Plugins**: quality, speed, audio tracks, subtitles (WebVTT/SRT), sprite thumbnails (WebVTT `#xywh`), playlists with folders, hotkeys, memory (position/volume/quality/…), autoplay with a muted fallback, and Media Session. You can write your own. See [Plugins](07-plugins.md).
- **Declarative layout**: the UI is a JSON tree of components with shared props (anchors, hide rules, click actions, …). A headless mode (`layout: false`) renders no UI. See [Layout](05-layout.md).
- **Theming**: CSS custom properties or the `theme` option. Light themes work. Icons and UI strings can be replaced (English by default, Russian built in). See [Theming](06-theming.md).
- **Timeline markers**: setting `state.markers` draws ticks on the timeline (chapters, ad breaks, bookmarks).

## Install

```bash
npm install composable-video-player
```

The package ships an ES module (`dist/player.js`), a UMD bundle (`dist/player.umd.cjs` / `dist/player.umd.js`), and TypeScript declarations. The CSS is bundled: styles are injected into `<head>` the first time a player is created, so there is no stylesheet to import. See [CDN and builds](09-cdn-and-builds.md).

## Quick start (bundler)

```html
<div id="player"></div>
```

```ts
import { createPlayer } from 'composable-video-player';

const player = createPlayer({
  container: 'player', // element id, or an HTMLElement
  source: '[360p]https://example.com/v360.mp4,[720p]https://example.com/v720.mp4',
  title: 'My video',
  poster: 'https://example.com/poster.jpg',
  subtitle: '[English]https://example.com/en.vtt',
  thumbnails: 'https://example.com/thumbs.vtt',
});

player.on('time', (t) => console.log('time', t));
player.on('end', () => console.log('finished'));

player.command('setQuality', 0); // switch to 360p
player.seek(30);
await player.play();
```

`container` takes an element **id** (no `#`, it is looked up with `document.getElementById`) or an `HTMLElement`. Creating a second player in the same container destroys the first one.

`createPlayer` includes all default plugins. If you want a smaller bundle, use `createPlayerCore` and pick the plugins you need:

```ts
import { createPlayerCore, qualityPlugin, subtitlesPlugin, hotkeysPlugin } from 'composable-video-player';

const player = createPlayerCore({
  container: 'player',
  source: 'https://example.com/video.mp4',
  plugins: [qualityPlugin(), subtitlesPlugin(), hotkeysPlugin()],
});
```

## Script tag (UMD from a CDN)

The UMD bundle exposes the whole public API as `window.VP` and the PlayerJS-compatible constructor as `window.Playerjs`.

```html
<div id="player"></div>
<script src="https://cdn.jsdelivr.net/npm/composable-video-player@0.1/dist/player.umd.js"></script>
<script>
  var player = VP.createPlayer({
    container: 'player',
    source: 'https://example.com/video.mp4',
    title: 'My video',
  });
  player.on('play', function () { console.log('playing'); });
</script>
```

## ES module from a CDN

```html
<div id="player"></div>
<script type="module">
  import { createPlayer } from 'https://cdn.jsdelivr.net/npm/composable-video-player@0.1/dist/player.js';

  createPlayer({ container: 'player', source: 'https://example.com/video.mp4' });
</script>
```

[CDN and builds](09-cdn-and-builds.md) covers version pinning, unpkg, and self-hosting.

## Sizing and aspect ratio

The player fills the container's width (`.vp-root { width: 100% }`) and gets its height from an aspect ratio:

| `ratio` value | Result |
| --- | --- |
| *(omitted)* | `16:9` |
| `'4:3'`, `'21:9'`, `'16/9'`, `'2.35:1'` | That ratio (`W:H` or `W/H`, decimals allowed) |
| `'auto'` | `16:9` until metadata loads, then the video's own aspect ratio |

To limit the size, size the container:

```css
#player { max-width: 960px; margin: 0 auto; }
```

For a container with a fixed height (a full-viewport hero, a grid cell, and so on), give the player root a height as well. `aspect-ratio` has no effect once both dimensions are set:

```css
#player { height: 100vh; }
#player .vp-root { height: 100%; }
```

The video uses `object-fit: contain` (letterboxing on a black background). In fullscreen the root fills the screen and ignores the ratio.

## TypeScript

- The types ship with the package (`dist/types`). Every public type is exported, including `Player`, `PlayerOptions`, `PlayerState`, `PlayerEvents`, `PlayerCommands`, `Plugin`, `PluginContext`, `LayoutNode`, `ThemeVars`, `SourceSpec`, `PlaylistItem`, and `TimelineMarker`.
- Commands and events are fully typed: `player.command('seek', '+10')` checks the argument types, and `player.on('quartile', q => …)` infers `q: 25 | 50 | 75 | 100`.
- Plugins add their options, state fields, and commands to these interfaces through module augmentation. The `subtitle`, `thumbnails`, `hotkeys`, and other plugin options type-check on `PlayerOptions`, and `player.command('next')` is typed. Your own plugins can do the same; see [Plugins](07-plugins.md#typed-options-state-and-commands).
- The package works with `moduleResolution` set to `bundler`, `node16`, or `nodenext`.

## Browser support

The player targets current evergreen browsers. The JavaScript is compiled to ES2020. The stylesheet uses `color-mix()`, `overflow: clip`, container queries, `aspect-ratio`, and the individual `translate`/`scale` properties. In practice that means **Chrome/Edge 111+, Firefox 113+, and Safari 16.2+**. Internet Explorer and legacy Edge are not supported.

Platform notes:

- **HLS**: hls.js is used wherever Media Source Extensions exist (desktop browsers including Safari, Android, iPadOS). On iPhone, which has no MSE, the browser plays HLS natively. See [Sources](03-sources.md#hls).
- **Fullscreen**: uses the Fullscreen API (with the `webkit` prefix where needed). On iPhone the player falls back to the native video fullscreen, which shows the system controls instead of the player UI.
- **Autoplay**: browsers block autoplay with sound until the user has interacted with the page. With `autoplay: true` the player retries muted by default (see `autoplayMuteFallback` in [Options](02-options.md)).
