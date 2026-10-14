# Options

`createPlayer(options)` and `createPlayerCore(options)` take the same `PlayerOptions` object. Core options are always available. Plugin options are added to `PlayerOptions` by each plugin through module augmentation, and they only have an effect when that plugin is installed. `createPlayer` installs all default plugins, so every option below works there.

```ts
import { createPlayer, type PlayerOptions } from 'composable-video-player';

const options: PlayerOptions = {
  container: 'player',
  source: '[480p]https://example.com/480.mp4,[1080p]https://example.com/1080.mp4',
  title: 'Episode 1',
  defaultQuality: '480p',
  speeds: [0.5, 1, 1.5, 2],
  hotkeys: { seekStep: 10 },
  theme: { color1: '#e11d48' },
};
createPlayer(options);
```

## Core options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `container` | `HTMLElement \| string` | **required** | The element, or its **id** (no `#`). The player replaces the element's children. Creating another player in the same container destroys the previous one. |
| `source` | `string \| SourceSpecInput` | — | What to load at startup: a [source string](03-sources.md#source-strings), a [`SourceSpec` object](03-sources.md#sourcespec-objects), or (with the playlist plugin) a [playlist](03-sources.md#playlists). If omitted, call `player.load()` later. |
| `plugins` | `Plugin[]` | `createPlayer`: `defaultPlugins()`; `createPlayerCore`: `[]` | Plugins to install. With `createPlayer`, passing this **replaces** the defaults. To keep them, write `plugins: [...defaultPlugins(), myPlugin]`. |
| `layout` | `LayoutNode \| false` | `defaultLayout` | The UI tree (see [Layout](05-layout.md)). `false` renders no UI (headless). Plugin layers such as subtitles and thumbnails are still mounted. |
| `poster` | `string` | `''` | Poster image URL. |
| `title` | `string` | `''` | Title shown by the `title` component and published to Media Session. |
| `autoplay` | `boolean` | `false` | Starts the first source once its metadata loads. Implemented by the **autoplay** plugin. Without it, this option does nothing. |
| `muted` | `boolean` | `false` | Start muted. |
| `loop` | `boolean` | `false` | Loop the video (`video.loop`). |
| `volume` | `number` | `1` | Initial volume, clamped to 0–1. |
| `rate` | `number` | `1` | Initial playback rate. |
| `start` | `number` | `0` | Start position in seconds for sources that don't set one (`[seek:N]` in the source string and `SourceSpec.start` take precedence). |
| `end` | `number` | — | Stop point. A positive value stops at that second. A negative value stops that many seconds before the end. Reaching it pauses and emits `end`/`finish`. |
| `ratio` | `string` | `'16:9'` | Aspect ratio `W:H` or `W/H`, or `'auto'` to use the video's ratio after metadata loads. See [sizing](01-getting-started.md#sizing-and-aspect-ratio). |
| `forceType` | `'hls'` | — | Treat every URL as HLS, even without a `.m3u8` extension. |
| `qualities` | `string` | — | Comma-separated labels for **unlabeled** comma-separated qualities, e.g. `'480p,720p'` for `source: 'a.mp4,b.mp4'`. |
| `theme` | `Partial<ThemeVars>` | — | Theme variables applied to the root element. See [Theming](06-theming.md). |
| `icons` | `Partial<Record<IconName, string>>` | — | Replace built-in SVG icons. See [Theming](06-theming.md#icons). |
| `lang` | `'en' \| 'ru'` | `'en'` | UI language. |
| `i18n` | `Partial<Record<string, string>>` | — | Override individual UI strings by key. See [Theming](06-theming.md#ui-text-and-languages). |
| `idleTimeout` | `number` | `3000` | Milliseconds of inactivity before the controls hide during playback. `Infinity` never hides them. |
| `reload` | `{ retries: number; delay: number }` | `{ retries: 0, delay: 2000 }` for VOD, `{ retries: 3, delay: 2000 }` for live | Automatic retries after the whole fallback chain has failed. `delay` is in ms. |
| `hlsUrl` | `string` | jsDelivr `hls.js@1.7.3/dist/hls.min.js` | Where to load hls.js from. See [self-hosting hls.js](09-cdn-and-builds.md#hls-engine). |
| `hlsIntegrity` | `string` | the pinned hash when `hlsUrl` is not set | SRI hash for the hls.js script. If you set `hlsUrl`, no integrity check runs unless you also set this. |
| `hlsConfig` | `Record<string, unknown>` | — | Passed to `new Hls(config)`. The player overrides `startPosition` when it needs a specific start time. |
| `log` | `boolean` | `false` | Enable debug logging (`console.log` with a `[vp]` prefix). Warnings and errors are always logged. |

## Plugin options

These options exist only when the plugin's types are loaded (they are whenever you import from the package), and they only take effect when the plugin is installed. PlayerJS names are listed for reference; see [PlayerJS compatibility](08-playerjs-compat.md#options-mapping).

### quality

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `defaultQuality` | `string` | highest (last) quality | Initial quality: a label (`'720p'`), `'num:N'` (zero-based index), or `'max'`. PlayerJS: `default_quality`. |
| `forbiddenQuality` | `string` | — | Comma-separated labels to hide from the menu. If the initial pick is forbidden, the highest allowed quality is used. PlayerJS: `forbidden_quality`. |

### speed

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `speeds` | `number[]` | `[0.5, 0.75, 1, 1.25, 1.5, 2]` | Speeds offered in the settings menu. A single entry hides the menu. |
| `defaultSpeed` | `number` | — | Speed applied at init. PlayerJS: `default_speed`. |

### audiotracks

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `defaultAudio` | `string` | first track | Label of the audio track to start with (`{Label}` in the source string). PlayerJS: `default_audio`. |
| `renameAudio` | `Record<string, string>` | — | Rename tracks in the menu, keyed by original label or by index (`{ '0': 'Original' }`). PlayerJS: `rename_audio`. |

### subtitles

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `subtitle` | `string` | — | `[Label]url,[Label]url` (VTT or SRT). Added to the **first** loaded source only. Later sources use inline `(subtitle:…)`, playlist `subtitle`, or `addSubtitle`. PlayerJS: `subtitle`. |
| `defaultSubtitle` | `string` | — | Label to show initially, or `'off'`. PlayerJS: `default_subtitle`. |
| `subtitleStart` | `boolean` | `true` | `false` starts with subtitles off (unless `defaultSubtitle` or a remembered choice says otherwise). PlayerJS: `subtitle_start`. |
| `subshift` | `number` | `0` | Shift every cue by this many **tenths** of a second (`-5` = 0.5 s earlier). A `?shift=N` query parameter on a subtitle URL overrides it for that file. PlayerJS: `subshift`. |

The initial track is chosen in this order: the remembered choice (memory plugin), then `defaultSubtitle`, then off if `subtitleStart: false`, then the first track.

### thumbnails

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `thumbnails` | `string` | — | URL of a WebVTT file with sprite rectangles, shown when hovering the timeline. See [thumbnails](03-sources.md#thumbnails). PlayerJS: `thumbnails`. |

### playlist

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `autonext` | `boolean` | `true` | Play the next item when one ends. PlayerJS: `autonext`. |
| `playlistLoop` | `boolean` | `false` | Wrap around at the ends (affects next/prev, autonext, and the prev/next buttons). PlayerJS: `playlistloop`. |
| `plstart` | `string` | first item | Item `id` (or index) to start with. PlayerJS: `plstart`. |
| `hidePlaylist` | `boolean` | `true` | Keep the playlist panel closed initially. `false` opens it. PlayerJS: `hideplaylist`. |

### hotkeys

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `hotkeys` | `HotkeysOptions \| false` | enabled | `false` disables keyboard and wheel shortcuts. Otherwise an object with the fields below. |
| `hotkeys.seekStep` | `number` | `5` | Seconds per ←/→. |
| `hotkeys.volumeStep` | `number` | `0.1` | Volume per ↑/↓ and per wheel step in fullscreen. |
| `hotkeys.enter` | `boolean` | `false` | Enter toggles playback. |
| `hotkeys.numbers` | `boolean` | `true` | Keys 0–9 jump to 0%–90%. |
| `hotkeys.wheel` | `boolean` | `true` | Mouse wheel changes the volume in fullscreen. |
| `hotkeys.global` | `boolean` | `false` | Also handle keys pressed anywhere on the page while the pointer is over the player. |

The [Plugins](07-plugins.md#hotkeys) page has the key map.

### memory

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `memory` | `object \| false` | all enabled | `false` disables persistence. Otherwise switch individual parts off: `{ position, volume, quality, speed, subtitle, audio, maxPositions }`. |
| `memory.position` | `boolean` | `true` | Resume each video where it stopped. |
| `memory.volume` | `boolean` | `true` | Remember volume and mute. |
| `memory.quality` | `boolean` | `true` | Remember the quality label. |
| `memory.speed` | `boolean` | `true` | Remember the playback speed. |
| `memory.subtitle` | `boolean` | `true` | Remember the subtitle label (or off). |
| `memory.audio` | `boolean` | `true` | Remember the audio track label. |
| `memory.maxPositions` | `number` | `100` | How many saved positions to keep. The oldest are evicted. |
| `cuid` | `string` | — | Stable id for position memory. If omitted, the key is derived from the page path, the player id, and the source. PlayerJS: `cuid`. |

### autoplay

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `autoplayMuteFallback` | `boolean` | `true` | If the browser blocks autoplay with sound, mute and retry. The first user click on play/pause then unmutes instead of pausing. |

### mediasession

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `mediasession` | `boolean` | `true` | `false` disables lock-screen / media-key integration. |

## Plugin factory options

Each plugin factory also accepts its own options object, e.g. `qualityPlugin({ defaultQuality: '720p' })`. Factory options take precedence over the matching `PlayerOptions` fields. [Plugins](07-plugins.md#built-in-plugins) lists them.
