# API

`createPlayer()` and `createPlayerCore()` return a `Player`:

```ts
import { createPlayer } from 'composable-video-player';

const player = createPlayer({ container: 'player', source: 'https://example.com/video.mp4' });

player.on('time', (t) => console.log(t));
player.command('setVolume', 0.5);
player.select((s) => s.status, (status, prev) => console.log(prev, '→', status));
```

## Properties

| Property | Type | Description |
| --- | --- | --- |
| `id` | `string` | The container's id. If the container had none, the player assigns `vp1`, `vp2`, …. |
| `state` | `Readonly<PlayerState>` | Current state snapshot (see [State](#state)). Treat it as read-only. |
| `container` | `HTMLElement` | The element you passed in. |
| `root` | `HTMLElement` | The player's root element (`.vp-root`), the place for CSS variables and classes. |
| `video` | `HTMLVideoElement` | The underlying `<video>`. Prefer commands over mutating it directly, so state and events stay in sync. |

## Methods

| Method | Description |
| --- | --- |
| `play(): Promise<void>` | Start playback. Resolves or rejects like `HTMLMediaElement.play()` (for example with `NotAllowedError` when autoplay is blocked). |
| `pause(): void` | Pause. |
| `seek(t: number \| string): void` | Seek to `t` seconds, or relative with `'+10'` / `'-10'`. |
| `load(source: SourceInput): void` | Load a new [source](03-sources.md) (string, `SourceSpec`, or playlist). Does not start playback. |
| `command(name, ...args)` | Run any [command](#commands) by name, fully typed. Returns the command's result (`play` returns a promise) or `undefined` for unknown commands. |
| `on(name, cb): () => void` | Subscribe to an [event](#events). Returns an unsubscribe function. |
| `once(name, cb): () => void` | Subscribe for one call. |
| `off(name, cb): void` | Unsubscribe. |
| `select(selector, cb, opts?): () => void` | Watch a derived value of the state. `cb(value, prev)` runs whenever `selector(state)` changes (compared with `Object.is` unless `opts.equals` is given). `opts.immediate: true` also calls it right away. Returns an unsubscribe function. |
| `api(cmd: string, arg?: unknown): unknown` | The PlayerJS-style string API (`api('seek', '+10')`, `api('time')`). See [PlayerJS compatibility](08-playerjs-compat.md#api-commands). |
| `destroy(): void` | Emit `destroy`, dispose the UI and plugins, stop and detach the media, and remove the player's DOM from the container. Calls after `destroy()` are ignored with a warning. |

`play()`, `pause()`, `seek()`, and `load()` are shortcuts for the matching commands.

### Timing of `init` and the first `new`

`createPlayer()` emits `init` and starts loading `options.source` before it returns. A listener added after `createPlayer()` therefore misses `init` and the first `new` event. If you need them, handle them in a [plugin](07-plugins.md), or create the player without `source` and call `player.load()` after subscribing:

```ts
const player = createPlayer({ container: 'player' });
player.on('new', ({ spec }) => console.log('loading', spec.qualities.length, 'qualities'));
player.load('https://example.com/video.mp4');
```

## Commands

`player.command(name, ...args)` runs a command from the API, so it does not emit the `user*` events (those are reserved for UI, hotkeys, and Media Session). Plugins can intercept any command with `ctx.commands.before()` (see [Plugins](07-plugins.md#commands)).

### Core commands

| Command | Arguments | Description |
| --- | --- | --- |
| `load` | `input: SourceInput` | Load a source or playlist. |
| `reload` | — | Reload the last good source and resume from the current position. |
| `play` | — | Play. Returns `Promise<void>`. |
| `pause` | — | Pause. |
| `toggle` | — | Play or pause. At the end it restarts from 0. |
| `stop` | — | Pause, rewind to 0, and emit `stop`. |
| `seek` | `t: number \| string` | Absolute seconds, or relative `'+N'` / `'-N'`. Clamped to `[0, duration]`. Ignored for live streams. |
| `setVolume` | `v: number \| string` | 0–1, or relative `'+0.1'` / `'-0.1'`. Clamped. A volume above 0 also unmutes. |
| `mute` / `unmute` / `toggleMute` | — | Mute control. |
| `setRate` | `r: number` | Playback rate, clamped to 0.0625–16. Values ≤ 0 are ignored. |
| `setLoop` | `b: boolean` | Loop the video. |
| `setTitle` | `s: string` | Change the title. |
| `setPoster` | `url: string` | Change the poster. |
| `fullscreen` / `exitFullscreen` / `toggleFullscreen` | — | Fullscreen control. Browsers only allow entering fullscreen from a user gesture. |
| `setQuality` | `i: number` | Index into `state.qualities`. |
| `setAudioTrack` | `i: number` | Index into `state.audioTracks`. |
| `setControlsLocked` | `b: boolean` | `true` keeps the controls visible (the `idle` hide rule stops applying). |
| `showControls` | — | Show the controls as if the user had moved the pointer. They hide again after `idleTimeout`. |
| `toggleMenu` | — | Open or close the settings menu. |
| `layout` | `node: LayoutNode` | Replace the UI with a new layout tree at runtime. |
| `destroy` | — | Same as `player.destroy()`. |

### Commands added by default plugins

| Command | Plugin | Arguments | Description |
| --- | --- | --- | --- |
| `setSpeedIndex` | speed | `index: number` | Set the rate to `state.speeds[index]`. |
| `setTextTrack` | subtitles | `index: number` | Select a subtitle track. `-1` turns subtitles off. |
| `toggleSubtitles` | subtitles | — | Off, or back on to the last used track. |
| `addSubtitle` | subtitles | `label: string, url: string, select?: boolean` | Add a track to the current source. `select` makes it active. |
| `setThumbnails` | thumbnails | `url: string` | Load a thumbnails VTT. `''` clears. |
| `next` / `prev` | playlist | — | Play the next or previous item (wraps when `playlistLoop` is on). |
| `playItem` | playlist | `idOrIndex: string \| number, autoplay?: boolean` | Play an item by `id` (checked first) or flat index. `autoplay` defaults to `true`. |
| `push` | playlist | `items: PlaylistItem[]` | Append items. |
| `setPlaylist` | playlist | `input: string \| PlaylistItem[]` | Replace the playlist (JSON string, URL, or array). |
| `togglePlaylist` | playlist | — | Open or close the playlist panel. |
| `setAutonext` | playlist | `on: boolean` | Toggle autonext. |
| `setPlaylistLoop` | playlist | `on: boolean` | Toggle playlist wrap-around. |
| `setCuid` | memory | `id: string` | Change the position-memory id (applies to the next load). |

Running a command whose plugin is not installed logs a warning and returns `undefined`.

## Events

`player.on(name, cb)`. The payload type is inferred from `PlayerEvents`.

| Event | Payload | When |
| --- | --- | --- |
| `init` | — | The player is constructed (plugins and layout ready), before the initial load. |
| `new` | `{ spec: SourceSpec; selection: { quality, audio, start } }` | A new source starts loading. |
| `metadata` | `{ duration: number }` | The media's metadata loaded and the start position was applied. |
| `start` | — | First `playing` since the last load. |
| `play` | — | Playback started (media `play` event). |
| `userplay` | — | Play triggered by the user (UI, hotkeys, Media Session). |
| `pause` | — | Paused (not emitted for pauses caused by loading, errors, or the end). |
| `userpause` | — | Pause triggered by the user. |
| `stop` | — | The `stop` command ran. |
| `end` | — | Reached the end of the media, or the `end` option's stop point. |
| `finish` | — | Emitted right after `end` (PlayerJS alias). |
| `time` | `number` | Current time on every `timeupdate` (about 4 times per second). |
| `quartile` | `25 \| 50 \| 75 \| 100` | Each quarter of the duration, once per source. |
| `duration` | `number` | The duration changed to a finite value. |
| `seek` | `number` | A seek completed (`seeked`), with the new time. |
| `userseek` | `number` | The user seeked (timeline, hotkeys, Media Session), with the target time. |
| `line` | `number` | The user released the timeline at this time (emitted just before the seek). |
| `volume` | `number` | Volume changed. |
| `mute` / `unmute` | — | Muted state changed. |
| `speed` | `number` | Playback rate changed. |
| `quality` | `string` | Quality changed (label). |
| `audiotrack` | `string` | Audio track changed (label). |
| `subtitle` | `string` | Subtitle track changed (label, or `'off'`). |
| `fullscreen` / `exitfullscreen` | — | Entered or left fullscreen. |
| `resize` | `{ width: number; height: number }` | The player root changed size (not emitted for the initial size). |
| `ui` | `0 \| 1` | Controls hidden (`0`) or shown (`1`). |
| `buffering` | — | Playback stalled waiting for data. |
| `buffered` | — | Recovered from `buffering`. |
| `loaderror` | `{ url: string; error: PlayerError }` | A URL in the fallback chain failed, a subtitle/thumbnail/playlist fetch failed, or `load()` received invalid input. Not necessarily fatal. |
| `error` | `PlayerError` | Fatal playback error (`state.status === 'error'`). |
| `playlist` | `PlaylistItem[]` (typed `unknown`) | A playlist was set or extended. |
| `next` / `previous` | — | `next` / `prev` moved to another item. |
| `destroy` | — | The player is being destroyed. |

UI-internal events, used by components and not forwarded to PlayerJS listeners:

| Event | Payload | When |
| --- | --- | --- |
| `ui:timeline-hover` | `{ time, x, rootX, width }` | Pointer moves over the timeline. `x` is relative to the timeline, `rootX` to the player root. |
| `ui:timeline-leave` | — | Pointer left the timeline. |
| `ui:menu` | `{ open: boolean }` | Settings menu opened or closed. |
| `ui:drag` | `{ active: boolean }` | A slider or timeline drag started or ended. |

`PLAYERJS_EVENTS` (exported) lists the public event names.

## State

`player.state` (and `ctx.store.get()` in plugins) is a `PlayerState`. Every change creates a new object, so `select()` with plain selectors is cheap.

| Field | Type | Description |
| --- | --- | --- |
| `status` | `'idle' \| 'loading' \| 'ready' \| 'playing' \| 'paused' \| 'ended' \| 'error'` | Lifecycle: `idle` → `loading` → `ready` → `playing`/`paused` → `ended`. Any load can end in `error`. |
| `started` | `boolean` | Playback has started since the last load. |
| `currentTime` | `number` | Seconds. |
| `duration` | `number` | Seconds. `0` when unknown or live. |
| `buffered` | `number` | End of the buffered range containing `currentTime`, in seconds. |
| `live` | `boolean` | The source is a live stream (infinite duration). |
| `waiting` | `boolean` | Buffering. |
| `volume` | `number` | 0–1. |
| `muted` | `boolean` | |
| `rate` | `number` | Playback rate. |
| `fullscreen` | `boolean` | |
| `userActive` | `boolean` | The user recently interacted (controls shown). |
| `controlsLocked` | `boolean` | Controls are pinned visible (`setControlsLocked`). |
| `width` / `height` | `number` | Size of the player root in px. |
| `url` | `string` | The URL currently being played (the one in the fallback chain that is in use). |
| `qualities` | `{ label: string; height?: number; bitrate?: number }[]` | Available qualities (from the source, or HLS variants plus `auto`). |
| `quality` | `number` | Index into `qualities`. |
| `audioTracks` | `{ label: string; lang?: string }[]` | Available audio tracks. |
| `audioTrack` | `number` | Index into `audioTracks`. |
| `textTracks` | `{ label: string; lang?: string }[]` | Available subtitle tracks. |
| `textTrack` | `number` | Index into `textTracks`, `-1` = off. |
| `preferredSubtitle` | `string \| null` | Remembered subtitle label or `'off'` (written by memory, read by subtitles). |
| `title` | `string` | |
| `poster` | `string` | |
| `loop` | `boolean` | |
| `error` | `{ kind: ErrorKind; message: string } \| null` | Last fatal error. |
| `markers` | `TimelineMarker[]` | Ticks drawn on the timeline: `{ time: number; label?: string }`. Owned by plugins and **not** reset on load. See [markers](07-plugins.md#timeline-markers). |

Fields added by default plugins:

| Field | Plugin | Type | Description |
| --- | --- | --- | --- |
| `speeds` | speed | `number[]` | Speeds offered in the menu. |
| `playlist` | playlist | `{ items, flat, index, open } \| undefined` | The playlist tree, its flattened list (`{ item, index, depth }[]`), the current flat index, and whether the panel is open. |
| `autonext` | playlist | `boolean` | |
| `playlistLoop` | playlist | `boolean` | |
| `cuid` | memory | `string \| undefined` | Current position-memory id. |

## Utilities

The package also exports helpers used by the built-in UI. They are useful in custom components:

| Export | Description |
| --- | --- |
| `formatTime(seconds, reference?)` | `m:ss`, or `h:mm:ss` when `reference` (usually the duration) is at least an hour. |
| `h(tag, attrs?, ...children)` | Small DOM element builder (`class`, attributes, children). |
| `iconEl(svg)` / `parseSvg(svg)` | Build a sanitized SVG icon element from a markup string. |
| `createIconButton(ui, className, onClick)` | Button with `setIcon(name)` and `setLabel(i18nKey)`. |
| `createSlider(ui, { className, label, onInput, step? })` | Accessible horizontal 0–1 slider (the volume control uses it). |
| `defaultIcons`, `dictionaries`, `defaultLayout`, `BUILTIN_COMPONENTS` | Built-in icons, UI strings, layout tree, and component factories. |
| `html5Provider()`, `hasNativeHls()` | The built-in `<video>` provider and the native HLS check. |
| `pickQuality`, `DEFAULT_SPEEDS`, `shouldRestorePosition` | Plugin helpers. |
| `mapPlayerjsOptions(opts, log)` | Converts PlayerJS options to `PlayerOptions`. |
