# PlayerJS compatibility

For pages written against [PlayerJS](https://playerjs.com/), the UMD bundle exposes a compatible `Playerjs` constructor. It covers the PlayerJS option names below, the `api(command, argument)` interface, the global `PlayerjsEvents` callback, DOM events, `PlayerjsAsync`, `ready`, and the iframe `postMessage` protocol.

```html
<div id="player"></div>
<script>
  // Optional PlayerJS-style hooks; define them before the bundle loads.
  function PlayerjsEvents(event, id, data) {
    if (event === 'end') console.log(id, 'finished');
  }
  function PlayerjsAsync() {
    window.player = new Playerjs({
      id: 'player',
      file: '[360p]https://cdn/360.mp4,[720p]https://cdn/720.mp4',
      title: 'My video',
      subtitle: '[English]https://cdn/en.vtt',
      default_quality: '360p',
      color1: '#22c55e',
      ready: 'onPlayerReady',
    });
  }
  function onPlayerReady(id) {
    player.api('seek', 10);
  }
</script>
<script src="https://cdn.jsdelivr.net/npm/composable-video-player@0.1/dist/player.umd.js" defer></script>
```

You can also call `new Playerjs({...})` directly in a script that runs after the bundle. In ES modules: `import { Playerjs } from 'composable-video-player'`.

`new Playerjs(options)` returns an object with:

- `api(cmd, arg?)`: the PlayerJS API ([below](#api-commands));
- `player`: the underlying typed [`Player`](04-api.md) (`player.player.on('time', …)`, `player.player.command(...)`).

It always installs `defaultPlugins()` and uses the default layout, or a click-only layout with `nocontrols`.

## Options mapping

| PlayerJS option | Player option | Conversion |
| --- | --- | --- |
| `id` | `container` | **Required.** Element id. |
| `file` | `source` | Source string (full [syntax](03-sources.md#source-strings)), playlist JSON or URL, or a playlist array / `{ playlist }` object. |
| `poster` | `poster` | string |
| `title` | `title` | string |
| `lang` | `lang` | `'ru'` (default) or `'en'`; other values are ignored. Not a PlayerJS option. |
| `i18n` | `i18n` | object of UI string overrides. Not a PlayerJS option. |
| `autoplay` | `autoplay` | flag |
| `loop` | `loop` | flag |
| `volume` | `volume` | number (0–1) |
| `start` | `start` | number (s) |
| `end` | `end` | number (s; negative = from the end) |
| `ratio` | `ratio` | string (`16:9`, `auto`, …) |
| `default_quality` | `defaultQuality` | string (label, `num:N`, `max`) |
| `forbidden_quality` | `forbiddenQuality` | string |
| `qualities` | `qualities` | string |
| `default_audio` | `defaultAudio` | string |
| `rename_audio` | `renameAudio` | object |
| `default_speed` | `defaultSpeed` | number |
| `default_subtitle` | `defaultSubtitle` | string |
| `subtitle` | `subtitle` | string |
| `subtitle_start` | `subtitleStart` | flag (`0` = start with subtitles off) |
| `subshift` | `subshift` | number (tenths of a second) |
| `thumbnails` | `thumbnails` | string |
| `autonext` | `autonext` | flag |
| `playlistloop` | `playlistLoop` | flag |
| `plstart` | `plstart` | string |
| `hideplaylist` | `hidePlaylist` | flag |
| `cuid` | `cuid` | string |
| `hls` | `forceType: 'hls'` | flag |
| `hlsconfig` | `hlsConfig` | object, or a JSON string (invalid JSON is ignored with a warning) |
| `log` | `log` | flag |
| `color1`, `color2`, `color3` | `theme.color1/2/3` | string |
| `nocontrols` | `layout` | flag. Replaces the UI with a click-to-play layer only. |
| `ready` | — | Name of a global function, called with the player id after init (after the constructor has returned). |
| `postmessage` | — | flag. Enables the [postMessage bridge](#postmessage-iframes). |
| `postmessageOrigin` | — | The only parent origin allowed to send commands and receive events. |

Flags accept `true`, `1`, `'1'`, or `'true'`. Anything else is false. Non-numeric numbers are dropped. **Any other option is ignored with a console warning.** That includes options with no PlayerJS equivalent here (`muted`, `speeds`, `hotkeys`, …) and PlayerJS design options.

`mapPlayerjsOptions(options, logger)` is exported if you want to convert options yourself.

## API commands

`player.api(command)` reads a value. `player.api(command, argument)` sets it or runs an action. Unknown commands, and commands whose plugin is missing, log a warning and return `undefined`. The typed `Player` has the same `api()` method.

| Command | Read: `api(cmd)` returns | Write / action: `api(cmd, arg)` |
| --- | --- | --- |
| `play` | — (plays) | `url` or playlist: load, then play once loaded. `'id:<itemId>'`: play that playlist item. |
| `pause`, `toggle`, `stop` | — (runs) | |
| `seek` | — | seconds, or `'+10'` / `'-10'` |
| `time` | current time (s) | |
| `duration` | duration (s) | |
| `buffered` | buffered end (s) | |
| `playing` | `true` while playing | |
| `started` | `true` after first play | |
| `live` | `true` for live streams | |
| `muted` | `true` when muted | |
| `isfullscreen` | `true` in fullscreen | |
| `volume` | volume 0–1 | 0–1, or `'+0.1'` / `'-0.1'` |
| `mute`, `unmute` | — (runs) | |
| `fullscreen`, `exitfullscreen` | — (runs; entering needs a user gesture) | |
| `quality` | current label | index (number) |
| `qualities` | array of labels | |
| `audiotrack` | current label | label or index |
| `audiotracks` | array of labels | |
| `speed` | current **rate** (e.g. `1.5`) | **index** into the speeds list |
| `subtitle` | current label or `'off'` | label, index, `'off'`, or `'[Label]url'` to add and select a track |
| `subtitles` | array of labels | |
| `+subtitle` | — | `'[Label]url'`: add a track without selecting it |
| `togglesubs` | — (runs) | |
| `file` | current URL | source: load without playing |
| `preload` | — | source: set `preload="auto"` and load |
| `playlist` | playlist items | JSON string, URL, or array: replace the playlist |
| `next`, `prev` | — (runs) | |
| `find` | — | item id or index: load that item without playing |
| `push` | — | items array: append to the playlist |
| `autonext` | `0` / `1` | flag |
| `playlistloop` | `0` / `1` | flag |
| `loop` | `0` / `1` | flag |
| `title` | title | string |
| `poster` | poster URL | string |
| `thumbnails` | — | VTT URL |
| `toolbar` | — (shows the controls) | `'on'` / `1` / `true` pins the controls visible, anything else unpins |
| `menu` | — (toggles the settings menu) | |
| `cuid` | current cuid | string |
| `id` | player id | |
| `destroy` | — (destroys the player) | |

Flag arguments accept `true`, `1`, `'1'`, `'true'`, or `'on'`.

## Events

Every public event is delivered three ways:

1. **`PlayerjsEvents(event, id, data)`**, if a global function with that name exists when the event fires.
2. **DOM events** on the container: `CustomEvent(event, { detail: data })`. They don't bubble, so listen on the container itself.
3. **`postMessage`** to the parent window, when the bridge is enabled ([below](#postmessage-iframes)).

```js
document.getElementById('player').addEventListener('time', function (e) {
  console.log('time', e.detail);
});
```

`init` is delivered in a microtask, so the handler can already use the variable that `new Playerjs(...)` was assigned to. Events fired in the same tick are queued behind it to keep the order.

Event names and payloads are the same as the [typed events](04-api.md#events): `init`, `start`, `new`, `metadata`, `play`, `userplay`, `pause`, `userpause`, `stop`, `end`, `finish`, `time`, `quartile`, `duration`, `seek`, `userseek`, `mute`, `unmute`, `volume`, `quality`, `audiotrack`, `subtitle`, `speed`, `fullscreen`, `exitfullscreen`, `resize`, `ui`, `buffering`, `buffered`, `loaderror`, `error`, `playlist`, `next`, `previous`, `line`, `destroy`. The `ui:*` events are internal and are not forwarded.

## postMessage (iframes)

With `postmessage: 1`, a player running inside an iframe can be controlled by its parent page.

Player page (inside the iframe):

```js
new Playerjs({ id: 'player', file: 'https://cdn/video.mp4', postmessage: 1, postmessageOrigin: 'https://parent.example' });
```

Parent page:

```js
const frame = document.querySelector('iframe').contentWindow;
const PLAYER_ORIGIN = 'https://player.example';

frame.postMessage({ api: 'play' }, PLAYER_ORIGIN);
frame.postMessage({ api: 'seek', set: 30 }, PLAYER_ORIGIN);
frame.postMessage({ api: 'time' }, PLAYER_ORIGIN); // getter: answered below

window.addEventListener('message', (e) => {
  if (e.origin !== PLAYER_ORIGIN) return;
  const msg = e.data; // events: { event, id, data }; answers: { event: 'time', answer: 12.5, id }
  if ('answer' in msg) console.log(msg.event, '=', msg.answer);
  else console.log('event', msg.event, msg.data);
});
```

Protocol:

| Direction | Message |
| --- | --- |
| parent → player | `{ api: string, set?: unknown, id?: string }`. `set` present means `api(cmd, set)`, absent means `api(cmd)`. With `id`, only the player with that id responds. |
| player → parent (answer) | `{ event: <cmd>, answer: <value>, id }`, sent when the command returned a value. |
| player → parent (event) | `{ event: <name>, id, data }` for every public event. Not sent when the page is not in an iframe. |

Security:

- Only messages whose `source` is `window.parent` are accepted.
- **Set `postmessageOrigin`.** With it, messages from other origins are ignored and events are posted only to that origin. Without it, any page that embeds the player can control it, events are posted with target `'*'`, and the player logs a warning.

## Migrating from PlayerJS

1. Replace the PlayerJS script with `player.umd.js` (see [CDN and builds](09-cdn-and-builds.md)). Keep your `new Playerjs({...})`, `PlayerjsEvents`, `PlayerjsAsync`, and `api()` calls.
2. Check the console. Options this player doesn't know are reported as `Playerjs: unknown option "…" ignored`.
3. Move design settings to [theme variables](06-theming.md) and a [layout](05-layout.md). Only `color1`–`color3` map directly.

### Differences from PlayerJS

- **Language.** `new Playerjs()` keeps PlayerJS's Russian UI by default. Pass `lang: 'en'` for English, or `i18n` to override individual labels:

  ```js
  var player = new Playerjs({ id: 'player', file: 'video.mp4', lang: 'en' });
  ```

- **`speed` is asymmetric.** Reading returns the rate, and setting takes an index into the speeds list.
- **Builder/design options** of PlayerJS (styles, logos, ads, and other features not listed above) are not implemented.
- **HLS** uses hls.js 1.x from jsDelivr wherever MSE is available, and the browser's native HLS otherwise ([details](03-sources.md#hls)). DASH is not supported out of the box.
- **Memory** stores positions and preferences under `vp:*` keys in `localStorage`, so values saved by PlayerJS are not picked up.
