# Sources

You can give the player a source in four forms:

- a **source string** in PlayerJS syntax;
- a **`SourceSpec` object**;
- a **playlist** (JSON, a URL, or an array; needs the playlist plugin);
- any of these passed to `load()` at runtime.

```ts
createPlayer({ container: 'player', source: 'https://example.com/video.mp4' });

player.load('[720p]https://example.com/720.mp4,[1080p]https://example.com/1080.mp4');
player.command('load', { qualities: [{ label: '', tracks: [{ label: '', urls: ['https://example.com/a.mp4'] }] }] });
```

## Source strings

The simplest source is a single URL. The full syntax combines these pieces:

| Syntax | Meaning | Example |
| --- | --- | --- |
| `url` | One file | `https://cdn/video.mp4` |
| `a,b` | Several **qualities** (comma-separated) | `https://cdn/480.mp4,https://cdn/1080.mp4` |
| `[Label]url` | Quality label | `[480p]https://cdn/480.mp4,[1080p]https://cdn/1080.mp4` |
| `{Label}url;{Label}url` | **Audio tracks** inside one quality (semicolon-separated) | `{English}https://cdn/en.mp4;{French}https://cdn/fr.mp4` |
| `a or b` | **Fallback** chain: try `a`, then `b` if it fails | `https://cdn/v.webm or https://cdn/v.mp4` |
| `a and b` | **Random** pick of one alternative (load balancing) | `https://cdn1/v.mp4 and https://cdn2/v.mp4` |
| `url[seek:N]` | Start at N seconds | `https://cdn/v.mp4[seek:90]` |
| `(subtitle:[Label]url,[Label]url)` | Inline subtitles, anywhere in the string | `https://cdn/v.mp4(subtitle:[English]https://cdn/en.vtt)` |
| `[<<<…]` | PlayerJS group separators, ignored | |

These combine. Each quality can have audio tracks, and each track can have a fallback chain:

```ts
const source =
  '[720p]{English}https://cdn/720-en.webm or https://cdn/720-en.mp4;{French}https://cdn/720-fr.mp4,' +
  '[1080p]{English}https://cdn/1080-en.mp4;{French}https://cdn/1080-fr.mp4' +
  '(subtitle:[English]https://cdn/en.vtt,[Français]https://cdn/fr.srt)';
```

Rules and behavior:

- `or` and `and` must have spaces around them. Commas always separate qualities and semicolons always separate audio tracks, so URLs that contain `,` or `;` need a [`SourceSpec` object](#sourcespec-objects) instead.
- **The last quality is selected by default.** List qualities from lowest to highest, or set `defaultQuality` (a label, `num:N`, or `max`).
- Unlabeled qualities take labels from the `qualities` option (`qualities: '480p,1080p'`). Otherwise they appear in the menu as `1`, `2`, ….
- Switching quality keeps the current position and the play/pause state, and keeps the audio track with the same label if the new quality has one.
- The first audio track is selected unless `defaultAudio` names another one.
- `[seek:N]` overrides the `start` option. The memory plugin's saved position overrides both.
- The `and` pick happens once per load. Position memory keys on the original string, so it stays stable across picks.

### Fallback and errors

When a URL fails, the player emits `loaderror` (`{ url, error }`) and tries the next URL in the chain. When the whole chain fails, it waits and retries according to the `reload` option (by default no retries for VOD, 3 retries 2 s apart for live). After that it sets `state.status = 'error'`, emits `error`, and the default layout shows the error overlay with a **Retry** button (`reload`, which resumes from the current position).

Error kinds (`PlayerError.kind`): `network`, `decode`, `not-found`, `unsupported`, `unknown`.

## SourceSpec objects

Under the hood every source string is parsed into a `SourceSpec`. You can pass one directly. `parseSource()` is exported if you want to build on the string syntax.

```ts
import type { SourceSpecInput } from 'composable-video-player';

const spec: SourceSpecInput = {
  qualities: [
    { label: '720p', tracks: [{ label: 'English', urls: ['https://cdn/720,en.webm', 'https://cdn/720,en.mp4'] }] },
    { label: '1080p', tracks: [{ label: 'English', urls: ['https://cdn/1080,en.mp4'] }] },
  ],
  subtitles: [{ label: 'English', url: 'https://cdn/en.vtt' }],
  start: 30,
  key: 'movie-42', // stable identity for position memory
};
player.load(spec);
```

| Field | Type | Description |
| --- | --- | --- |
| `qualities` | `{ label: string; tracks: { label: string; urls: string[] }[] }[]` | **Required**, non-empty. `urls` is the fallback chain of one audio track. |
| `subtitles` | `{ label: string; url: string }[]` | Optional subtitle files. |
| `start` | `number` | Optional start time in seconds. |
| `forceType` | `'hls'` | Optional. Treat the URLs as HLS. The `forceType` player option applies when this is not set. |
| `key` | `string` | Optional stable identity. The memory plugin uses it for the saved position (string sources use the raw string). |

Other helpers: `parseSource(str, { qualities? })`, `parseSubtitleList('[En]a.vtt,[Fr]b.vtt')`, `isPlaylistInput(input)`, and `sourceKey(spec)`.

## Playlists

With the playlist plugin (included in `createPlayer`), `source`, `load()`, and the PlayerJS `file` option also accept playlists:

- a JSON string: `'[{"title":"One","file":"one.mp4"}]'` or `'{"playlist":[…]}'`;
- a URL ending in `.json` or `.txt` (query strings are fine), fetched with `fetch`;
- an array of items, a `{ playlist: [...] }` object, or a single item object with `file` or `folder`.

```json
[
  { "title": "Trailer", "file": "https://cdn/trailer.mp4", "id": "trailer", "poster": "https://cdn/trailer.jpg" },
  {
    "title": "Season 1",
    "folder": [
      { "title": "Episode 1", "file": "[720p]https://cdn/s1e1-720.mp4,[1080p]https://cdn/s1e1-1080.mp4", "id": "s1e1",
        "subtitle": "[English]https://cdn/s1e1-en.vtt", "thumbnails": "https://cdn/s1e1-thumbs.vtt" },
      { "title": "Episode 2", "file": "https://cdn/s1e2/master.m3u8", "id": "s1e2", "start": 15 }
    ]
  }
]
```

### Item fields

| Field | Type | Description |
| --- | --- | --- |
| `file` | `string` | Source string (full syntax). Items with neither `file` nor `folder` are skipped. |
| `title` | `string` | Shown in the panel and as the player title. |
| `poster` | `string` | Poster for the item, also shown as a small image in the panel. |
| `subtitle` | `string` | `[Label]url,[Label]url`, added to any inline subtitles. |
| `thumbnails` | `string` | Thumbnails VTT for this item. Items without it fall back to the `thumbnails` option. |
| `id` | `string` | Used by `plstart`, `playItem`, `api('play', 'id:…')`, and `api('find', …)`. |
| `start` | `number \| 'continue'` | Start time, or `'continue'` to keep the current position (for example when switching between dubs of the same video). |
| `folder` | `PlaylistItem[]` | Nested items, rendered as collapsible groups. Folders can nest. |

Extra fields are allowed and kept on the item.

### Behavior

- The first item (or `plstart`) is loaded but not started (unless `autoplay`). Choosing an item from the panel, `next`/`prev`, and autonext start playback.
- Navigation works on the flattened list, so folders are traversed in order.
- Loading a regular (non-playlist) source removes the playlist.
- `push(items)` appends items. If no playlist exists yet, it creates one and only loads the first item when nothing is playing.
- Without the playlist plugin, playlist input fails with an `unsupported` error ("Playlist input requires the playlist plugin").

Commands: `next`, `prev`, `playItem(idOrIndex, autoplay = true)`, `push(items)`, `setPlaylist(input)`, `togglePlaylist`, `setAutonext(on)`, `setPlaylistLoop(on)`. State: `state.playlist` (`{ items, flat, index, open }`), `state.autonext`, `state.playlistLoop`. Events: `playlist` (items), `next`, `previous`.

## HLS

URLs ending in `.m3u8` (or any URL when `forceType: 'hls'` is set) are HLS. The player picks the engine per browser:

| Environment | Engine |
| --- | --- |
| `MediaSource` available (Chrome, Edge, Firefox, desktop Safari, Android, iPadOS) | hls.js, loaded on first use |
| No `MediaSource` but native HLS (iPhone) | The browser's native HLS via `<video src>` |
| Neither | `unsupported` error (the next fallback URL is tried) |

hls.js is preferred even where the browser reports native HLS. Native playback exposes no renditions, so there would be no quality menu.

About the hls.js loader:

- By default the loader injects `https://cdn.jsdelivr.net/npm/hls.js@1.7.3/dist/hls.min.js` with a pinned SRI hash and `crossorigin="anonymous"`. It runs once per page, and the result is shared by all players.
- If `window.Hls` already exists (you loaded hls.js yourself, or bundled it and assigned it), the existing copy is used and nothing is downloaded.
- `hlsUrl`, `hlsIntegrity`, and `hlsConfig` customize the loader. See [CDN and builds](09-cdn-and-builds.md#hls-engine).
- If hls.js fails to load, the URL fails with an `unsupported` error, so an `or` fallback such as `master.m3u8 or video.mp4` still plays.

With hls.js:

- **Qualities**: when the manifest has more than one variant, they are listed as `720p` (or `1500kbps` when the height is unknown), with **Auto** (adaptive) first and selected. If the source string already lists several qualities, the manifest's variants are not used.
- **Audio tracks**: when the manifest has more than one alternate audio rendition, they are listed by name or language (unless the source string defines several `{…}` tracks).
- Fatal hls.js errors after metadata has loaded get one recovery attempt per kind (network, media) before failing.

**Live streams** (duration `Infinity`) set `state.live = true`. The default layout then hides the timeline and duration and shows a LIVE badge, and `seek` is ignored.

DASH (`.mpd`) is not supported by the built-in providers. A plugin can add a provider (see [Plugins](07-plugins.md#media-providers)).

## Subtitles

Subtitles can come from:

- the `subtitle` option (first source only): `subtitle: '[English]https://cdn/en.vtt,[Русский]https://cdn/ru.srt'`;
- inline in the source string: `video.mp4(subtitle:[English]en.vtt,[French]fr.vtt)`;
- `SourceSpec.subtitles` or a playlist item's `subtitle`;
- at runtime: `player.command('addSubtitle', 'German', 'https://cdn/de.vtt', true)` (the last argument selects the track).

In the `subtitle` option and a playlist item's `subtitle`, a URL without a `[Label]` is labelled with its file name (`en.vtt` becomes `en`). Inline `(subtitle:…)` entries must have labels.

**Formats**: WebVTT and SRT, detected automatically (any block with a `-->` timing line is a cue). Supported timestamps: `hh:mm:ss.mmm`, `mm:ss.mmm`, and `hh:mm:ss,mmm`.

```text
WEBVTT

00:00:01.000 --> 00:00:04.000
Hello! This is <b>bold</b> and <i>italic</i>.
```

```text
1
00:00:01,000 --> 00:00:04,000
Hello from an SRT file.
```

- Cue text keeps `<b>`, `<i>`, `<u>`, and line breaks. All other tags, `{\…}` override blocks, and VTT cue settings (position, alignment) are dropped. HTML entities are decoded.
- Shift timing with `subshift` (tenths of a second) or per file with `?shift=-5` in the URL.
- Files are fetched with `fetch()` when first selected, so cross-origin files need CORS headers. A failed fetch emits `loaderror` and the track shows nothing.
- The player draws subtitles in its own layer (`.vp-subtitles`), not with native text tracks. They follow the theme (`subColor`, `subBg`, `subSize`) and move up while the controls are visible. In iPhone's native fullscreen they are not shown.

Commands: `setTextTrack(index)` (`-1` = off), `toggleSubtitles()`, `addSubtitle(label, url, select?)`. State: `textTracks`, `textTrack`. Event: `subtitle` (label or `'off'`).

## Thumbnails

Timeline hover previews come from a WebVTT file whose cues point at images, usually rectangles of a sprite sheet (`#xywh=x,y,width,height`):

```text
WEBVTT

00:00:00.000 --> 00:00:05.000
thumbs.jpg#xywh=0,0,160,90

00:00:05.000 --> 00:00:10.000
thumbs.jpg#xywh=160,0,160,90

00:00:10.000 --> 00:00:15.000
https://cdn.example.com/other-sprite.jpg#xywh=0,0,160,90
```

- Image paths are resolved relative to the VTT file's URL.
- Cues without `#xywh` show the whole image at 160×90.
- Set the file with the `thumbnails` option, per playlist item, or at runtime with `player.command('setThumbnails', url)` (an empty string clears them).
- The VTT is fetched with `fetch()` (CORS applies to cross-origin files). The images are CSS backgrounds.

Without a thumbnails file, hovering the timeline still shows the time under the pointer.
