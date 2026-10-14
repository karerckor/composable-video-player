# Plugins

A plugin is an object `{ name, setup(ctx) }`. `setup` runs once while the player is being created, after the core and before the layout is built. It can register commands, components, menus, hide rules, layers, media providers, and source transforms, and it can return a cleanup function that runs on `destroy()`. Most built-in features are plugins.

## Using plugins

`createPlayer` installs `defaultPlugins()`. The `plugins` option **replaces** that list, so spread the defaults to add your own:

```ts
import { createPlayer, defaultPlugins } from 'composable-video-player';

createPlayer({
  container: 'player',
  source: 'https://example.com/video.mp4',
  plugins: [...defaultPlugins(), myPlugin],
});
```

To customize a built-in plugin, build the list yourself and use the factory's options:

```ts
import {
  createPlayer, qualityPlugin, speedPlugin, subtitlesPlugin, thumbnailsPlugin, hotkeysPlugin, memoryPlugin,
} from 'composable-video-player';

createPlayer({
  container: 'player',
  source: '…',
  plugins: [
    qualityPlugin({ forbiddenQuality: ['240p'] }),
    speedPlugin({ speeds: [1, 1.5, 2] }),
    subtitlesPlugin(),
    thumbnailsPlugin(),
    hotkeysPlugin({ seekStep: 10, global: true }),
    memoryPlugin({ storage: sessionStorage }),
  ],
});
```

`createPlayerCore` installs **no** plugins by default. Use it with exactly the plugins you import, so the rest can be tree-shaken.

Rules:

- Plugins are set up in array order. Duplicate `name`s are ignored with a warning.
- An exception in `setup` is logged and that plugin is skipped. The player keeps working.
- Cleanup functions run in reverse order on `destroy()`.

`defaultPlugins()` returns, in order: `quality`, `speed`, `audiotracks`, `subtitles`, `thumbnails`, `playlist`, `hotkeys`, `memory`, `autoplay`, `mediasession`. The order matters. `memory` comes after the plugins whose choices it restores (so the saved values win) and before `autoplay` (so a saved mute applies before autoplay starts). `mediasession` comes after `playlist` (so it can bind next/previous track). Plugins you append after the defaults run last. For example, their source transforms override the memory plugin's saved position.

## Built-in plugins

| Factory | Factory options | Adds |
| --- | --- | --- |
| `qualityPlugin(o?)` | `defaultQuality?: string`, `forbiddenQuality?: string \| string[]` | Settings section `quality`. Initial quality selection. |
| `speedPlugin(o?)` | `speeds?: number[]`, `defaultSpeed?: number` | Section `speed`, command `setSpeedIndex`, state `speeds`. |
| `audioTracksPlugin(o?)` | `defaultAudio?: string`, `renameAudio?: Record<string \| number, string>` | Section `audio`. Initial track selection. |
| `subtitlesPlugin(o?)` | `subtitle?`, `defaultSubtitle?`, `subtitleStart?`, `subshift?`, `fetch?: typeof fetch` | Section `subtitle`, layer `subtitles-layer`, commands `setTextTrack`, `toggleSubtitles`, `addSubtitle`. |
| `thumbnailsPlugin(o?)` | `thumbnails?: string`, `fetch?: typeof fetch` | Layer `thumbnail-preview`, command `setThumbnails`. |
| `playlistPlugin(o?)` | `autonext?`, `playlistLoop?`, `plstart?`, `hidePlaylist?`, `fetch?: typeof fetch` | Components `prev`, `next`, `playlist-button`, `playlist-panel` (layer). Hide rules `first-item`, `last-item`, `no-playlist`, `playlist-closed`. Commands `next`, `prev`, `playItem`, `push`, `setPlaylist`, `togglePlaylist`, `setAutonext`, `setPlaylistLoop`. State `playlist`, `autonext`, `playlistLoop`. |
| `hotkeysPlugin(o?)` | `HotkeysOptions \| false` | Keyboard and wheel shortcuts. |
| `memoryPlugin(o?)` | `position?`, `volume?`, `quality?`, `speed?`, `subtitle?`, `audio?`, `maxPositions?`, `storage?: Storage \| null` | Persistence. Command `setCuid`, state `cuid`. |
| `autoplayPlugin(o?)` | `muteFallback?: boolean` | Autoplay for the `autoplay` option. |
| `mediaSessionPlugin()` | — | Lock screen, media keys, and OS media controls. |

Factory options take precedence over the matching [player options](02-options.md#plugin-options). The `fetch` options let you inject a custom fetch (auth headers, tests).

The settings menu shows sections in `order`: `quality` (10), `speed` (20), `subtitle` (30), `audio` (40). A section is shown only when it has more than one choice (subtitles: at least one track).

### Hotkeys

Shortcuts work while focus is inside the player. The root is focusable, and clicking the player focuses it. With `global: true` they also work anywhere on the page while the pointer is over the player.

| Key | Action |
| --- | --- |
| Space | Play/pause |
| Enter | Play/pause (only with `enter: true`) |
| F | Toggle fullscreen |
| M | Toggle mute |
| ← / → | Seek −/+ `seekStep` (5 s) |
| ↑ / ↓ | Volume +/− `volumeStep` (0.1) |
| 0–9 (top row or numpad) | Jump to 0%–90% (`numbers: true`) |
| Mouse wheel | Volume, in fullscreen only (`wheel: true`) |

Keys with Ctrl/Meta/Alt, keys typed into inputs, and keys inside the settings menu are ignored. Space and Enter on a focused button activate that button instead.

### Memory

The plugin stores data in `localStorage` (or the `storage` you pass; `null` disables persistence):

| Key | Content |
| --- | --- |
| `vp:volume`, `vp:muted`, `vp:speed`, `vp:quality`, `vp:audio`, `vp:subtitle` | Last volume/mute, speed, and labels. Shared by all players on the origin. |
| `vp:t:<id>` | Saved position `{ t, d }` per video. `<id>` is the `cuid`, or a hash of the page path, player id, and source. |
| `vp:t:index` | Saved-position keys, oldest first (trimmed to `maxPositions`). |

The position is saved every 5 s of playback and on pause, and forgotten when the video ends. It is restored only if it is more than 5 s in and more than 10 s before the end (`shouldRestorePosition`). Storage errors (private mode, sandboxed iframes) are ignored.

### Autoplay

With `autoplay: true` the plugin plays the **first** source after its metadata loads. If the browser rejects playback with sound (`NotAllowedError`) and `muteFallback` is on (the default), it mutes and retries. The user's first play/pause toggle (click, Space) then unmutes instead of pausing.

### Media Session

The plugin publishes the title and poster (as artwork) and the playback state, and handles `play`, `pause`, `seekto`, `seekbackward`, and `seekforward` (default offset 10 s). It handles `previoustrack`/`nexttrack` when the playlist commands exist. With several players on a page, the one that played last owns the session. Disable it with `mediasession: false`.

## Writing a plugin

```ts
import type { Plugin } from 'composable-video-player';

export function logPlugin(prefix = '[video]'): Plugin {
  return {
    name: 'log',
    setup(ctx) {
      const offs = [
        ctx.events.on('init', () => ctx.log.debug(prefix, 'ready')),
        ctx.events.on('quartile', (q) => console.log(prefix, `${q}% watched of`, ctx.store.get().title)),
        ctx.store.select((s) => s.status, (status) => console.log(prefix, status)),
      ];
      return () => offs.forEach((off) => off());
    },
  };
}
```

### PluginContext

| Member | Description |
| --- | --- |
| `player` | The `Player` facade. |
| `store` | State store: `get()`, `set(patch)`, `select(selector, cb, opts?)`. `set` merges a partial `PlayerState` and notifies subscribers. |
| `events` | Event bus: `on`, `once`, `off`, `emit(name, payload)`, `onAny(cb)`. `on`/`once`/`onAny` return unsubscribe functions. |
| `commands` | Command registry: `register(name, handler)`, `before(name, hook)`, `run(name, args[], ctx?)`, `has(name)`. |
| `options` | The `PlayerOptions` the player was created with (including your augmented fields). |
| `video` | The `<video>` element. |
| `root` | The player root element. |
| `log` | `debug` (only with `log: true`), `warn`, `error`, all prefixed with `[vp]`. |
| `t(key)` | Translate an i18n key (falls back to the key). |
| `registerProvider(provider)` | Add a [media provider](#media-providers). |
| `addSourceTransform(fn)` | Adjust the selection on every load. Returns a remover. See [source transforms](#source-transforms). |
| `registerComponent(type, factory)` | Add a layout [component](#components). Registering an existing type replaces it (with a warning). |
| `registerMenu(definition)` | Add a [settings menu section](#settings-menus). Returns a remover. |
| `registerHideRule(name, factory)` | Add a [hide rule](05-layout.md#custom-rules). |
| `addLayer(node, 'below-ui' \| 'above-ui')` | Mount a layout node outside the main layout, below or above the controls. Layers survive `layout` changes. Returns a remover. |

Everything a plugin registers on `events`, `store`, or `commands` should be released in the returned cleanup function. Components clean up automatically (see [components](#components)).

### Typed options, state, and commands

Augment the package's interfaces so your option, state field, and command are type-checked everywhere, including in `createPlayer({...})`, `player.state`, and `player.command(...)`:

```ts
import type { Plugin } from 'composable-video-player';

declare module 'composable-video-player' {
  interface PlayerOptions {
    /** Seconds to skip with the "skip intro" button. */
    introEnd?: number;
  }
  interface PlayerState {
    introSkipped?: boolean;
  }
  interface PlayerCommands {
    skipIntro(): void;
  }
}

export function skipIntroPlugin(): Plugin {
  return {
    name: 'skip-intro',
    setup(ctx) {
      const end = ctx.options.introEnd ?? 0;
      const offs = [
        ctx.commands.register('skipIntro', (_args, c) => {
          ctx.commands.run('seek', [end], c);
          ctx.store.set({ introSkipped: true });
        }),
        ctx.events.on('new', () => ctx.store.set({ introSkipped: false })),
      ];
      return () => offs.forEach((off) => off());
    },
  };
}

// Elsewhere: fully typed
// createPlayer({ container: 'player', introEnd: 85, plugins: [...defaultPlugins(), skipIntroPlugin()] });
// player.command('skipIntro');
```

New state fields should be optional (`?`), because they don't exist until your plugin sets them. You can augment `PlayerEvents` the same way to emit your own typed events with `ctx.events.emit(...)`.

### Commands

```ts
// Handler: receives the argument array and the call context.
ctx.commands.register('skipIntro', (args, c) => { /* c.source is 'api' | 'user' | 'internal' */ });

// Before-hooks run before the handler of any command, including built-ins:
// return false to cancel, or a new argument array to replace the arguments.
let adPlaying = false;
ctx.commands.before('seek', (_args, c) => {
  if (c.source === 'user' && adPlaying) return false; // no seeking during ads
});
ctx.commands.before('setVolume', ([v]) => (typeof v === 'number' ? [Math.min(v, 0.8)] : undefined)); // cap absolute volumes

// Run a command: arguments as an array, optional context (default: internal).
ctx.commands.run('seek', [30], { source: 'user' });
```

`source` tells you who called: `'api'` (`player.command`, `player.api`), `'user'` (UI, hotkeys, Media Session; triggers `userplay`, `userpause`, and `userseek`), or `'internal'` (other plugins and the core).

### Components

A component factory receives a `UIContext` and the node's props, and returns `{ el, slot?, dispose? }`. `slot` is where children go (default `el`).

```ts
import { createIconButton, type Plugin } from 'composable-video-player';

export const skipButtons: Plugin = {
  name: 'skip-buttons',
  setup(ctx) {
    ctx.registerComponent('skip', (ui, props: { seconds?: number }) => {
      const seconds = props.seconds ?? 10;
      const button = createIconButton(ui, 'my-skip', () => ui.user('seek', `${seconds >= 0 ? '+' : ''}${seconds}`));
      button.setIcon(seconds >= 0 ? 'next' : 'prev');
      button.setLabel(`${seconds} s`); // i18n key or literal text
      return { el: button.el };
    });
  },
};
// layout: { type: 'skip', seconds: -10 }, { type: 'skip', seconds: 30 }
```

`UIContext` members:

| Member | Description |
| --- | --- |
| `player`, `store`, `events`, `commands`, `options`, `root`, `log`, `t(key)` | Same as in `PluginContext`. |
| `icon(name)` | SVG markup of a (possibly overridden) icon. Wrap it with `iconEl()`. |
| `menus` | The settings menu host: `open({ only?, align? })`, `close()`, `toggle()`, `isOpen`, `hasVisible(state)`, `register(def)`. |
| `user(name, ...args)` | Run a command as the user (`source: 'user'`). Promise rejections are logged. |
| `run(action)` | Run an [action string](05-layout.md#actions). |
| `select(selector, cb, opts?)` | Like `store.select`, but released automatically when the component is disposed. |
| `on(name, cb)` | Like `events.on`, released automatically. |
| `listen(target, type, fn, opts?)` | `addEventListener`, removed automatically. |
| `build(node)` | Build a child layout node whose lifetime is tied to this component. Returns `{ el, … }` or `null`. |

Build DOM with `document.createElement` or the exported `h()` helper, and set text with `textContent`. `createIconButton(ui, className, onClick)` gives you a styled, accessible `.vp-button` with `setIcon(name)` and `setLabel(key)`. For icons outside the built-in set, append `iconEl(svgMarkup)` (sanitized) or build the SVG with `createElementNS`.

### Settings menus

```ts
const offMenu = ctx.registerMenu({
  id: 'zoom',            // used by `settings:zoom` actions
  label: 'Zoom',         // i18n key or literal
  order: 50,             // position among sections (built-ins: 10–40)
  visible: () => true,   // show the section?
  options: () => [{ label: 'Fit', value: 'contain' }, { label: 'Fill', value: 'cover' }],
  current: () => ctx.video.style.objectFit || 'contain',
  select: (value) => { ctx.video.style.objectFit = String(value); },
});
```

The menu re-renders when the labels or current values change. If only one section is visible, the menu opens straight into it. The `settings` component and the `no-menus` hide rule take plugin sections into account.

### Source transforms

A transform runs on every `load` (in registration order) and can change which quality and audio track are selected and where playback starts:

```ts
ctx.addSourceTransform((spec, sel) => {
  // sel: { quality: number, audio: number, start: number }
  const hd = spec.qualities.findIndex((q) => q.label === '1080p');
  return hd >= 0 ? { ...sel, quality: hd } : sel;
});
```

The built-in quality, audio track, and memory plugins use transforms. A transform registered later sees and can override the earlier results.

### Media providers

A provider plays URLs into the `<video>`. For each URL the player asks every provider `canPlay(url, spec)` and uses the one with the **highest** score (`0` = can't, `1` = can, `2` = preferred). On a tie, the earlier provider wins. The built-in providers come first: `html5` (scores 1, or 0 for `.mpd` and for HLS without native support) and `hls` (scores 2 for HLS where MSE exists).

```ts
import type { MediaProvider, Plugin } from 'composable-video-player';

function dashProvider(): MediaProvider {
  let video: HTMLVideoElement | null = null;
  return {
    name: 'dash',
    canPlay: (url) => (url.split(/[?#]/)[0]!.endsWith('.mpd') ? 2 : 0),
    attach(v, ctx) { video = v; /* ctx.setQualities(list, current), ctx.setAudioTracks(...), ctx.error(err) */ },
    async load(url, startTime) { /* attach your engine to `video`, resolve after metadata and seeking to startTime */ },
    detach() { /* tear down; the next provider may take over the same <video> */ video = null; },
    setQuality(index) { /* index into the list passed to setQualities */ },
  };
}

export const dash: Plugin = { name: 'dash', setup: (ctx) => ctx.registerProvider(dashProvider()) };
```

`load()` must resolve once metadata is available and `startTime` is applied, or reject with a `PlayerError` (`{ kind, message }`) so the fallback chain can continue.

## Timeline markers

`state.markers` is a list of `{ time: number; label?: string }`. The `timeline` component draws a tick for every marker strictly between 0 and the duration. Markers belong to plugins. Set them with `ctx.store.set`. They are **not** cleared when a new source loads, so reset them on `new` if they are per-video:

```ts
import type { Plugin, TimelineMarker } from 'composable-video-player';

export function adBreaksPlugin(lookup: (key: string) => TimelineMarker[]): Plugin {
  return {
    name: 'ad-breaks',
    setup(ctx) {
      const off = ctx.events.on('new', ({ spec }) => ctx.store.set({ markers: lookup(spec.key ?? '') }));
      return () => {
        off();
        ctx.store.set({ markers: [] });
      };
    },
  };
}
```

The built-in timeline draws only ticks. To show labels, listen to `ui:timeline-hover`, as the timecodes example below does. Tick styling: `.vp-timeline-marker` (a gap in the color of `--vp-color-3`).

## Example: timecodes (chapters)

Source: [demo/plugins/timecodes.ts](https://github.com/karerckor/composable-video-player/blob/main/demo/plugins/timecodes.ts). It turns a YouTube-style description into chapters:

```ts
import { createPlayer, defaultLayout, defaultPlugins } from 'composable-video-player';
import { timecodesPlugin } from './timecodes';

const layout = structuredClone(defaultLayout);
const controls = layout.children![2]!.children![1]!.children!;
controls.splice(controls.findIndex((n) => n.type === 'duration') + 1, 0, { type: 'chapter-title' });

createPlayer({
  container: 'player',
  source: 'https://example.com/video.mp4',
  timecodes: '0:00 Intro\n0:05 Red bar\n1:02:03 Finale',
  layout,
  plugins: [...defaultPlugins(), timecodesPlugin()],
});
```

How it is built, using only the public API:

1. **Typed option and command.** `declare module` adds `timecodes?: string` to `PlayerOptions` and `setTimecodes(text: string): void` to `PlayerCommands`.
2. **State.** `parseTimecodes()` turns lines like `1:23 Title`, `[01:02:03] Title`, or `- 0:05 — Title` into sorted `TimelineMarker`s, and `ctx.store.set({ markers })` publishes them. The timeline draws the ticks with no further work.
3. **Settings section.** `ctx.registerMenu({ id: 'chapters', label: 'Chapters', order: 5, … })` lists the chapters with `formatTime()`. `current` is the chapter at `currentTime`, and `select` runs `seek` with `{ source: 'user' }`.
4. **Layout component.** `ctx.registerComponent('chapter-title', …)` uses `ui.select()` to show the current chapter name next to the duration. It updates only when the name changes.
5. **Hover label layer.** A `chapter-hover` component, mounted with `ctx.addLayer(…, 'above-ui')`, listens to `ui:timeline-hover` and shows the chapter name above the thumbnail preview, reusing the `.vp-thumb` styles.
6. **Cleanup.** The returned function removes the layer, command, and menu, and resets `markers` to `[]`.

The demo plugins import from `../../src/index.js` and augment `../../src/types.js`. If you copy them into your project, change both to `'composable-video-player'`.

## Example: share with timestamp

Source: [demo/plugins/share.ts](https://github.com/karerckor/composable-video-player/blob/main/demo/plugins/share.ts). It adds a **Share** button with a panel that shows the page link, a "Start at 1:23" checkbox, and Copy. Opening a link with `?t=83`, `?t=1m23s`, or `?t=1:23` starts the video there.

```ts
createPlayer({
  container: 'player',
  source: 'https://example.com/video.mp4',
  layout, // with { type: 'share' } inserted before { type: 'settings' }
  plugins: [...defaultPlugins(), sharePlugin({ param: 't' })],
});
```

How it is built:

1. **A button with a custom icon.** `createIconButton(ui, 'demo-share', …)` gives the standard button behavior. The icon is not in `IconName`, so it is built with `createElementNS` and set with `button.el.replaceChildren(icon)`.
2. **A panel layer.** `share-panel` is mounted with `ctx.addLayer(…, 'above-ui')`. Opening it sets `controlsLocked: true` so the controls don't auto-hide while the user copies the link, and closing it resets that. All strings go through `ui.t()`, so they can be localized with `i18n`.
3. **Start time from the URL.** A source transform reads `?t=` once and returns `{ ...sel, start }` for the first load only. Because the plugin is appended **after** `defaultPlugins()`, its transform runs after the memory plugin's, so the shared timestamp beats a saved position.
4. **Link building.** `buildShareUrl()` uses `URL`/`searchParams` and whole seconds.

The live demo runs both plugins together: <https://karerckor.github.io/composable-video-player/demo/>.
