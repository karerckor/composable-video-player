## Chunk 9: Demo, browser verification, final checks

Delivers: a local demo-asset generator (ffmpeg), a full demo page exercising every feature, a PlayerJS-compat page that loads the real UMD bundle, a README, and verification in real browsers (Playwright Chromium for automated checks; the user's Brave via Computer Use for a visual pass).

Spec references: §10 (manual verification, done-criteria), §11.

Codec note: headless Playwright Chromium may lack H.264. Progressive demo files are generated as both WebM (VP9/Opus) and MP4 (H.264/AAC) and referenced as `x.webm or x.mp4`, which also demonstrates the `or` fallback. HLS uses **fMP4 segments (`.m4s`)**, not `.ts`: Vite's dev server would treat `.ts` files as TypeScript and fail with HTTP 500.

### Task 9.1: Demo asset generator

**Files:**
- Create: `demo/scripts/make-assets.sh`

- [ ] **Step 1: Create `demo/scripts/make-assets.sh`**

```bash
#!/usr/bin/env bash
# Generates local demo media into demo/assets (git-ignored). Requires ffmpeg with libx264, libvpx-vp9, libopus.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=assets
mkdir -p "$OUT/hls"
command -v ffmpeg >/dev/null || { echo "ffmpeg not found; the demo falls back to public URLs" >&2; exit 1; }

DUR=30
SRC=(-f lavfi -i "testsrc2=size=1280x720:rate=30:duration=$DUR")
A_EN=(-f lavfi -i "sine=frequency=440:sample_rate=48000:duration=$DUR")
A_RU=(-f lavfi -i "sine=frequency=660:sample_rate=48000:duration=$DUR")
X264=(-c:v libx264 -preset veryfast -pix_fmt yuv420p -c:a aac -b:a 96k -movflags +faststart)
VP9=(-c:v libvpx-vp9 -b:v 0 -crf 40 -deadline realtime -cpu-used 8 -c:a libopus -b:a 64k)

encode() { # name scale audio-input-array-name
  local name=$1 scale=$2; shift 2
  ffmpeg -y -loglevel error "${SRC[@]}" "$@" -vf "scale=$scale" -shortest "${X264[@]}" "$OUT/$name.mp4"
  ffmpeg -y -loglevel error "${SRC[@]}" "$@" -vf "scale=$scale" -shortest "${VP9[@]}" "$OUT/$name.webm"
}

echo "progressive files..."
encode video-360 640:360 "${A_EN[@]}"
encode video-720 1280:720 "${A_EN[@]}"
encode video-720-ru 1280:720 "${A_RU[@]}"

echo "HLS (2 renditions)..."
ffmpeg -y -loglevel error "${SRC[@]}" "${A_EN[@]}" \
  -map 0:v -map 1:a -map 0:v -map 1:a \
  -filter:v:0 scale=640:360 -filter:v:1 scale=1280:720 \
  -c:v libx264 -preset veryfast -pix_fmt yuv420p -b:v:0 800k -b:v:1 2500k -c:a aac -b:a 96k \
  -g 60 -keyint_min 60 -sc_threshold 0 \
  -var_stream_map "v:0,a:0 v:1,a:1" -master_pl_name master.m3u8 \
  -f hls -hls_time 4 -hls_playlist_type vod \
  -hls_segment_type fmp4 -hls_fmp4_init_filename init.mp4 \
  -hls_segment_filename "$OUT/hls/v%v/seg%03d.m4s" "$OUT/hls/v%v/index.m3u8"

echo "thumbnails sprite (every 2 s, 160x90, 5x3)..."
ffmpeg -y -loglevel error "${SRC[@]}" -vf "fps=1/2,scale=160:90,tile=5x3" -frames:v 1 "$OUT/thumbs.jpg"
{
  echo "WEBVTT"
  for i in $(seq 0 14); do
    s=$((i * 2)); e=$((s + 2)); x=$(((i % 5) * 160)); y=$(((i / 5) * 90))
    printf '\n00:00:%02d.000 --> 00:00:%02d.000\nthumbs.jpg#xywh=%d,%d,160,90\n' "$s" "$e" "$x" "$y"
  done
} > "$OUT/thumbs.vtt"

echo "subtitles..."
cat > "$OUT/en.vtt" <<'VTT'
WEBVTT

00:00:01.000 --> 00:00:04.000
Hello! This is a <b>WebVTT</b> subtitle.

00:00:05.000 --> 00:00:09.000
Press <i>F</i> for fullscreen, <i>M</i> to mute.

00:00:10.000 --> 00:00:14.000
Hover the timeline to see thumbnails.
VTT
cat > "$OUT/ru.srt" <<'SRT'
1
00:00:01,000 --> 00:00:04,000
Привет! Это субтитры в формате SRT.

2
00:00:05,000 --> 00:00:09,000
F — полный экран, M — выключить звук.
SRT

echo "playlist..."
cat > "$OUT/playlist.json" <<'JSON'
[
  { "title": "Intro (360p)", "file": "assets/video-360.webm or assets/video-360.mp4", "id": "intro", "thumbnails": "assets/thumbs.vtt" },
  { "title": "Season 1", "folder": [
    { "title": "Episode 1 (720p, subtitles)", "file": "assets/video-720.webm or assets/video-720.mp4", "id": "s1e1", "subtitle": "[English]assets/en.vtt,[Русский]assets/ru.srt" },
    { "title": "Episode 2 (HLS)", "file": "assets/hls/master.m3u8", "id": "s1e2" }
  ]}
]
JSON

ls -la "$OUT" "$OUT/hls"
echo "done"
```

- [ ] **Step 2: Run it**

Run: `chmod +x demo/scripts/make-assets.sh && demo/scripts/make-assets.sh`
Expected: ends with `done`; `demo/assets` contains `video-360.{mp4,webm}`, `video-720.{mp4,webm}`, `video-720-ru.{mp4,webm}`, `hls/master.m3u8`, `hls/v0/index.m3u8` + `init_0.mp4` + `seg*.m4s`, `hls/v1/index.m3u8` + `init_1.mp4` + `seg*.m4s`, `thumbs.jpg`, `thumbs.vtt`, `en.vtt`, `ru.srt`, `playlist.json`.

- [ ] **Step 3: Sanity-check the outputs**

Run: `ffprobe -v error -show_entries stream=codec_name,width,height -of csv=p=0 demo/assets/video-720.mp4 && grep -c EXT-X-STREAM-INF demo/assets/hls/master.m3u8 && grep -c xywh demo/assets/thumbs.vtt`
Expected: lines with `h264,1280,720` and `aac`; `2`; `15`.

- [ ] **Step 4: Add an npm script and commit**

In `package.json` scripts add `"assets": "bash demo/scripts/make-assets.sh"`.

```bash
git add demo/scripts/make-assets.sh package.json
git commit -m "chore(demo): add ffmpeg demo asset generator"
```

### Task 9.2: Full demo page

**Files:**
- Modify: `demo/index.html`, `demo/main.ts`

The page shows one player per feature and a shared event log. It also demonstrates extensibility: a custom plugin registering a "skip 10 s" button and a custom layout.

- [ ] **Step 1: Replace `demo/index.html`**

```html
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Composable Video Player — demo</title>
    <link rel="icon" href="data:," />
    <style>
      body { margin: 0; padding: 24px; background: #f4f4f5; font-family: system-ui, sans-serif; color: #18181b; }
      main { max-width: 960px; margin: 0 auto; display: grid; gap: 40px; }
      h1 { font-size: 24px; margin: 0; }
      h2 { font-size: 16px; margin: 0 0 4px; }
      p { margin: 0 0 10px; color: #52525b; font-size: 14px; }
      code { background: #e4e4e7; padding: 1px 4px; border-radius: 4px; }
      .row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
      button.demo { padding: 6px 10px; border-radius: 6px; border: 1px solid #d4d4d8; background: #fff; cursor: pointer; }
      #log { position: sticky; bottom: 0; font: 12px/1.4 ui-monospace, monospace; background: #18181b; color: #a1a1aa; padding: 8px; height: 120px; overflow: auto; border-radius: 6px; }
      #log b { color: #e4e4e7; font-weight: 600; }
    </style>
  </head>
  <body>
    <main>
      <h1>Composable Video Player</h1>

      <section>
        <h2>1. Qualities, subtitles, thumbnails</h2>
        <p><code>[360p]…,[720p]…</code> + <code>subtitle</code> (VTT + SRT) + sprite <code>thumbnails</code>. Settings menu, hotkeys, memory.</p>
        <div id="p-basic"></div>
      </section>

      <section>
        <h2>2. Audio tracks</h2>
        <p><code>{English}…;{Русский}…</code> — separate files per language (440 Hz vs 660 Hz tone).</p>
        <div id="p-audio"></div>
      </section>

      <section>
        <h2>3. HLS</h2>
        <p>Adaptive stream via lazily loaded hls.js (native in Safari). Qualities come from the manifest, with “Авто”.</p>
        <div id="p-hls"></div>
        <div class="row">
          <button class="demo" data-hls="assets/hls/master.m3u8">Local HLS</button>
          <button class="demo" data-hls="https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8">Mux test stream</button>
        </div>
      </section>

      <section>
        <h2>4. Playlist with folders</h2>
        <p>JSON playlist URL, panel open, autonext, prev/next buttons.</p>
        <div id="p-playlist"></div>
      </section>

      <section>
        <h2>5. Extensibility: custom plugin, custom layout, theme</h2>
        <p>A plugin registers a <code>skip10</code> component; the layout is a modified copy of <code>defaultLayout</code>; an action string <code>api:seek,-10</code> drives a text button.</p>
        <div id="p-custom"></div>
      </section>

      <section>
        <h2>6. Fallback and errors</h2>
        <p>Left: <code>missing.mp4 or video-360</code> (falls back). Right: a missing file (error overlay with retry).</p>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px">
          <div id="p-fallback"></div>
          <div id="p-error"></div>
        </div>
      </section>

      <p><a href="./compat.html">PlayerJS compat page (UMD bundle) →</a></p>
      <div id="log"></div>
    </main>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: Replace `demo/main.ts`**

```ts
import { createIconButton, createPlayer, defaultLayout, defaultPlugins, type LayoutNode, type Player, type Plugin } from '../src/index';

const both = (name: string) => `assets/${name}.webm or assets/${name}.mp4`;
const players: Record<string, Player> = {};
const logEl = document.getElementById('log')!;

function log(player: string, event: string, data: unknown) {
  const line = document.createElement('div');
  const name = document.createElement('b');
  name.textContent = `${player} ${event}`;
  line.append(`${new Date().toLocaleTimeString()} `, name, data === undefined ? '' : ` ${JSON.stringify(data)}`);
  logEl.prepend(line);
  while (logEl.childElementCount > 200) logEl.lastElementChild!.remove();
}

function track(id: string, player: Player) {
  players[id] = player;
  for (const event of ['new', 'metadata', 'play', 'pause', 'seek', 'quality', 'audiotrack', 'subtitle', 'speed', 'error', 'loaderror', 'end', 'playlist', 'next', 'previous'] as const) {
    player.on(event, (data: unknown) => log(id, event, data));
  }
}

// 1. Qualities + subtitles + thumbnails
track(
  'basic',
  createPlayer({
    container: 'p-basic',
    source: `[360p]${both('video-360')},[720p]${both('video-720')}`,
    title: 'Test pattern — 360p / 720p',
    subtitle: '[English]assets/en.vtt,[Русский]assets/ru.srt',
    thumbnails: 'assets/thumbs.vtt',
    cuid: 'demo-basic',
  }),
);

// 2. Audio tracks
track(
  'audio',
  createPlayer({
    container: 'p-audio',
    source: `[720p]{English}${both('video-720')};{Русский}${both('video-720-ru')}`,
    title: 'Audio tracks',
  }),
);

// 3. HLS
const hls = createPlayer({ container: 'p-hls', source: 'assets/hls/master.m3u8', title: 'HLS' });
track('hls', hls);
document.querySelectorAll<HTMLButtonElement>('[data-hls]').forEach((b) => b.addEventListener('click', () => hls.api('play', b.dataset.hls)));

// 4. Playlist
track('playlist', createPlayer({ container: 'p-playlist', source: 'assets/playlist.json', hidePlaylist: false }));

// 5. Custom plugin + layout + theme
const skipPlugin: Plugin = {
  name: 'skip10',
  setup(ctx) {
    ctx.registerComponent('skip10', (ui) => {
      const button = createIconButton(ui, 'vp-skip10', () => ui.user('seek', '+10'));
      button.setIcon('next');
      button.setLabel('+10 s');
      return { el: button.el };
    });
  },
};

const customLayout: LayoutNode = structuredCloneLayout(defaultLayout);
const controls = (customLayout.children![2]!.children![1]!.children ??= []);
controls.splice(1, 0, { type: 'text', text: '−10', action: 'api:seek,-10', hint: '−10 s', className: 'vp-button' }, { type: 'skip10' });
controls.push({ type: 'text', text: 'Custom', anchor: undefined, color: '#facc15', margin: '0 6' });

track(
  'custom',
  createPlayer({
    container: 'p-custom',
    source: both('video-360'),
    title: 'Custom layout + plugin',
    plugins: [...defaultPlugins(), skipPlugin],
    layout: customLayout,
    theme: { color1: '#facc15', color3: 'rgba(30, 27, 75, 0.95)', radius: '12px' },
    ratio: '21:9',
  }),
);

// 6. Fallback and errors
track('fallback', createPlayer({ container: 'p-fallback', source: `assets/missing.mp4 or ${both('video-360')}`, title: 'Fallback' }));
track('error', createPlayer({ container: 'p-error', source: 'assets/missing.mp4', title: 'Error' }));

function structuredCloneLayout(node: LayoutNode): LayoutNode {
  return JSON.parse(JSON.stringify(node)) as LayoutNode;
}

Object.assign(window, { players });
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add demo/index.html demo/main.ts
git commit -m "feat(demo): showcase every feature on the demo page"
```

### Task 9.3: PlayerJS compat page (real UMD bundle)

**Files:**
- Create: `demo/compat.html`
- Modify: `package.json` (`demo:umd` script)

- [ ] **Step 1: Add a script that copies the built UMD bundle into the demo**

In `package.json` scripts add `"demo:umd": "npm run build && cp dist/player.umd.cjs demo/assets/player.umd.js"`.

- [ ] **Step 2: Create `demo/compat.html`**

```html
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>PlayerJS compat — demo</title>
    <link rel="icon" href="data:," />
    <style>
      body { margin: 0; padding: 24px; font-family: system-ui, sans-serif; background: #f4f4f5; }
      main { max-width: 860px; margin: 0 auto; display: grid; gap: 12px; }
      .row { display: flex; gap: 8px; flex-wrap: wrap; }
      button { padding: 6px 10px; border-radius: 6px; border: 1px solid #d4d4d8; background: #fff; cursor: pointer; }
      #events { font: 12px/1.4 ui-monospace, monospace; background: #18181b; color: #a1a1aa; padding: 8px; height: 140px; overflow: auto; border-radius: 6px; }
    </style>
    <script>
      // PlayerJS-style global callbacks, defined before the bundle loads.
      function PlayerjsEvents(event, id, data) {
        if (event === 'time') return;
        var line = document.createElement('div');
        line.textContent = id + ' ' + event + (data === undefined ? '' : ' ' + JSON.stringify(data));
        var box = document.getElementById('events');
        if (box) box.prepend(line);
      }
      function PlayerjsAsync() {
        window.player = new Playerjs({
          id: 'player',
          file: '[360p]assets/video-360.webm or assets/video-360.mp4,[720p]assets/video-720.webm or assets/video-720.mp4',
          title: 'PlayerJS compat (UMD)',
          subtitle: '[English]assets/en.vtt',
          thumbnails: 'assets/thumbs.vtt',
          default_quality: '360p',
          color1: '#22c55e',
          ready: 'onPlayerReady',
        });
      }
      function onPlayerReady(id) {
        console.log('ready', id);
      }
    </script>
    <script src="assets/player.umd.js" defer></script>
  </head>
  <body>
    <main>
      <h1>PlayerJS compat</h1>
      <div id="player"></div>
      <div class="row">
        <button onclick="player.api('play')">api('play')</button>
        <button onclick="player.api('pause')">api('pause')</button>
        <button onclick="player.api('seek', '+10')">api('seek','+10')</button>
        <button onclick="player.api('volume', '-0.1')">api('volume','-0.1')</button>
        <button onclick="player.api('quality', 1)">api('quality',1)</button>
        <button onclick="alert(player.api('time'))">api('time')</button>
        <button onclick="player.api('play', 'assets/hls/master.m3u8')">api('play', hls)</button>
      </div>
      <div id="events"></div>
    </main>
  </body>
</html>
```

- [ ] **Step 3: Build and copy**

Run: `npm run demo:umd && ls -la demo/assets/player.umd.js`
Expected: the file exists (size well above 30 KB).

- [ ] **Step 4: Commit**

```bash
git add demo/compat.html package.json
git commit -m "feat(demo): add PlayerJS compat page using the UMD bundle"
```

### Task 9.4: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create `README.md`**

````markdown
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
```

Design: `docs/superpowers/specs/2026-10-14-composable-video-player-design.md`.
````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README"
```

### Task 9.5: Automated browser verification (Playwright MCP)

Use the Playwright MCP tools (`browser_navigate`, `browser_snapshot`, `browser_click`, `browser_evaluate`, `browser_console_messages`, `browser_take_screenshot`). Record findings; fix bugs with @superpowers:systematic-debugging (write a failing unit test first when the bug is reproducible in jsdom).

- [ ] **Step 1: Start the dev server in the background**

Run (background): `npm run dev -- --port 5173 --strictPort`
Expected: Vite prints `Local: http://localhost:5173/`.

- [ ] **Step 2: Load the demo with clean storage and check the console**

Navigate to `http://localhost:5173/`, evaluate `localStorage.clear()` (the memory plugin shares preferences across demo pages, so expectations below assume a clean slate), reload, wait 3 s, read console messages.
Expected: no console errors (media 404s from section 6 are not logged to the console; they show up as `loaderror` lines in the page's event log).

- [ ] **Step 3: Verify section 1 by evaluation**

Evaluate:

```js
async () => {
  const p = window.players.basic;
  await p.play();
  await new Promise((r) => setTimeout(r, 1500));
  p.api('seek', 2);
  await new Promise((r) => setTimeout(r, 500));
  return {
    status: p.state.status,
    time: p.state.currentTime,
    qualities: p.api('qualities'),
    quality: p.api('quality'),
    subtitles: p.api('subtitles'),
    subtitleText: p.root.querySelector('.vp-subtitles-text')?.textContent,
    url: p.state.url,
  };
}
```

Expected: `status: 'playing'`, `time` ≥ 2, `qualities: ['360p','720p']`, `quality: '720p'` (or the remembered one), `subtitles: ['English','Русский']`, `subtitleText` contains `WebVTT`, `url` ends with `.webm` (or `.mp4` if WebM is unsupported).

- [ ] **Step 4: Verify UI interactions**

Take a snapshot; click the settings button of section 1; click «Качество» → «360p»; evaluate `players.basic.api('quality')` → `'360p'` and that `currentTime` was preserved (±1 s). Hover the timeline (use `browser_hover` on `.vp-timeline` of section 1) and take a screenshot: the thumbnail preview with time is visible above the timeline.

- [ ] **Step 5: Verify audio tracks, playlist, custom, fallback, error**

Evaluate:

```js
async () => {
  const { audio, playlist, custom, fallback, error } = window.players;
  audio.command('setAudioTrack', 1);
  playlist.command('next');
  await new Promise((r) => setTimeout(r, 1500));
  return {
    audio: audio.api('audiotrack'),
    playlistIndex: playlist.state.playlist.index,
    playlistTitle: playlist.state.title,
    playlistStatus: playlist.state.status,
    customHasSkip: !!custom.root.querySelector('.vp-skip10'),
    fallbackUrl: fallback.state.url,
    fallbackStatus: fallback.state.status,
    errorStatus: error.state.status,
    errorText: error.root.querySelector('.vp-error-message')?.textContent,
  };
}
```

Expected: `audio: 'Русский'`; `playlistIndex: 1`, title `Episode 1 (720p, subtitles)`, status `playing`; `customHasSkip: true`; `fallbackUrl` ends with `video-360.webm` or `.mp4`, `fallbackStatus: 'ready'`; `errorStatus: 'error'`, `errorText` is a localized message.

- [ ] **Step 6: Verify HLS**

Click «Local HLS»; wait 3 s; evaluate `({ status: players.hls.state.status, qualities: players.hls.api('qualities'), url: players.hls.state.url })`.
Expected: `status: 'playing'`, qualities `['auto','360p','720p']` (hls.js is preferred whenever MSE exists). If this Chromium build lacks H.264, expect a `decode` error instead — note it and verify HLS in Task 9.6.

- [ ] **Step 7: Verify the compat page**

Run `npm run demo:umd` if not done; navigate to `http://localhost:5173/compat.html`; wait 2 s; check console (no errors, a `ready player` log). Click `api('play')`, then `api('seek','+10')`; read the `#events` box text.
Expected: events list contains `init`, `new`, `play`, `seek` lines; `typeof window.Playerjs === 'function'`.

- [ ] **Step 8: Responsive check**

Resize the browser to 380×800, take a screenshot of section 1. Expected: volume slider hidden (`maxWidth: 400` rule), controls fit in one row, icons at 20 px.

- [ ] **Step 9: Commit any fixes**

If bugs were fixed: `npm test && npm run typecheck`, then commit each fix separately with a `fix:` message.

### Task 9.6: Visual pass in the user's Brave (Computer Use)

Use the `computer-use` skill (`orca computer …`, app `com.brave.Browser`). Only navigate and interact with the demo tab; do not touch other tabs or accounts.

- [ ] **Step 0: Ask for consent**

Ask the user whether it's OK to drive their Brave window (it changes the active tab's URL and clicks inside the page). If they decline, repeat Task 9.5 Steps 3–6 in Playwright with a screenshot per step instead, and skip the rest of this task.

- [ ] **Step 1: Open the demo in Brave**

Set the address bar to `http://localhost:5173/` and press Return; take a screenshot.
Expected: six players render with the dark toolbar, big play buttons and titles.

- [ ] **Step 2: Play section 1 and open settings**

Click the big play button of section 1, wait 2 s, click the gear; screenshot.
Expected: video plays (test pattern moving), subtitles «Hello! This is a WebVTT subtitle.» appear above the toolbar, the settings menu lists Качество / Скорость / Субтитры.

- [ ] **Step 3: HLS and playlist**

Click «Local HLS», wait 3 s, open its settings → Качество; screenshot. Expected: «Авто», 360p, 720p.
Scroll to section 4; screenshot. Expected: the playlist panel with «Season 1» folder.

- [ ] **Step 4: Fullscreen and hotkeys**

Click section 1's video area once (focus), press `f`; screenshot; press `Escape`.
Expected: the player fills the screen with controls; exiting restores the page.

- [ ] **Step 5: Report**

Summarize what was seen in Brave (with screenshot paths) in the final report; fix any visual bug found (CSS in `src/theme/player.css`), re-run `npm test`, commit.

### Task 9.7: Final checks

- [ ] **Step 1: Full verification**

Run: `npm test && npm run typecheck && npm run build`
Expected: all tests pass, typecheck exits 0, build produces `dist/player.js`, `dist/player.umd.cjs`, `dist/types/index.d.ts`.

- [ ] **Step 2: Bundle size report**

Run: `ls -l dist/player.js dist/player.umd.cjs && gzip -c dist/player.js | wc -c`
Expected: record the numbers in the final report (no target; for information).

- [ ] **Step 3: Dependency check**

Run: `node -e "const p=require('./package.json'); console.log(Object.keys(p.dependencies||{}).length)"`
Expected: `0` (zero runtime dependencies).

- [ ] **Step 4: Stop the dev server** started in Task 9.5.

- [ ] **Step 5: Final commit if anything changed**

```bash
git status --short
git commit -am "chore: final verification fixes" # only if there are changes
```
