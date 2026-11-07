# Cloudflare Stream video library

A small home for product tutorials, course lessons and recorded talks. Hono runs the API in a Cloudflare Worker; **composable-video-player** plays HLS directly from Cloudflare Stream.

- Searchable catalogue and category filters
- Search chapter titles and jump directly to a matching moment
- Chapters on the timeline and clickable chapter links
- Captions from Stream or your own VTT/SRT files
- Clickable transcript with current-line highlighting
- Timestamp sharing and remembered playback in the same browser
- Continue-watching shelf, watched/progress indicators and related videos
- Site branding, light/dark palettes and player/caption styling in one config
- An on-page integration walkthrough, real Share plugin source and Live API controls
- Opt-in VAST advertising demo with a real Google IMA plugin, skip/error fallback and a visible event trace

This folder is standalone. It depends on the published player package and never imports from the parent repository.

A public-only [GitHub Pages preview](https://karerckor.github.io/composable-video-player/examples/stream-library/) demonstrates the same interface without a Worker. It uses public Stream recordings and resolves captions directly in the browser. This folder's normal `dev` and `deploy` scripts use the Hono backend described below. `npm run build:preview` builds the static preview into `preview-dist/`; the repository's Pages pipeline includes it automatically.

## Try it

Requires **Node.js 22+** and npm. Your own videos also require a Cloudflare account with Stream enabled.

```bash
npx gitpick https://github.com/karerckor/composable-video-player/tree/main/examples/cloudflare-stream my-video-library
cd my-video-library
npm install
npm run dev
```

Open **http://localhost:8787**. Default `demo: true` is a curated collection of **six real Cloudflare TV recordings** with sound, original English captions, editorial chapters and source links. It works without account credentials.

| Recording | Topic | Original source |
| --- | --- | --- |
| Live streaming with Cloudflare Stream | Video & media | [Cloudflare TV, 2021](https://cloudflare.tv/event/live-streaming-with-cloudflare-stream/2aX5E8Zb) |
| Making local development faster | Developer tools | [Cloudflare TV, 2023](https://cloudflare.tv/shows/developer-week/developer-week-remove-friction-and-obstacles-for-developers/Ya0Gqxvn) |
| R2: storage, AI and moving your data | Storage & data | [Cloudflare TV, 2023](https://cloudflare.tv/shows/developer-week/developer-week-what-s-new-with-r2/BZO4qzNg) |
| How Cloudflare Images works | Video & media | [Cloudflare TV, 2021](https://cloudflare.tv/event/speed-week-cloudflare-images/2aXNp1gb) |
| Developer Week: AI, databases and deep dives | Storage & data | [Cloudflare TV, 2024](https://cloudflare.tv/this-week-in-net/developer-week-2024-edition-ai-ga-and-deep-dives/AZEkA8v6) |
| What people build: Launchpad Demo Day | Developer tools | [Cloudflare TV, 2025](https://cloudflare.tv/shows/workers-launchpad-demo-day/workers-launchpad-demo-day-cohort-4/ea8GGOGv) |

These are archived conversations, not current API references. Recording dates are shown on cards and watch pages. Videos remain hosted by Cloudflare; video/transcript files are not redistributed here. Public assets may change or become unavailable.

Try searching **Hugging Face**, **OBS**, **Rust**, or **migration**. Chapter matches link directly to that moment. Watch some of a video, then return to see **Pick up where you left off**. Completed videos get a watched indicator; watch pages suggest related recordings.

Inside an existing clone, use `cd examples/cloudflare-stream` instead of gitpick. The gitpick URL becomes usable once this folder is on the repository's `main` branch.

## Explore the player integration

Open any video and scroll to **The player. The plugins. The code.**, or use **Explore the player & code** in the catalogue.

- **Setup**: copy a working setup for that video and current theme; expand the actual `src/player.ts` wiring below it.
- **Share plugin**: read the actual source bundled from `src/plugins/share.ts`, used by the toolbar and page Share buttons.
- **VAST / IMA**: try an ad below the player and inspect the usage snippet plus actual plugin, lifecycle and SDK-loader source.
- **Chapters & captions**: see how custom markers, subtitle URLs, `seek()` and `player.select()` build the chapter/transcript experience.
- **Live API**: seek, toggle captions, change speed and open Share with a timecode on the same player. Reactive state values update as you try it.

All code blocks use TypeScript syntax highlighting with palettes for light/dark mode. Copy buttons copy plain source text. Only highlight.js core and the TypeScript grammar are bundled; this is an example-app dependency, not a player dependency.

### Custom Share plugin

Share is a genuine plugin, not a separate page-only copy handler. It demonstrates four public extension points: `registerComponent`, `addLayer`, `commands.register`, and `addSourceTransform`. Its panel is part of the player, so it also works in fullscreen.

From a module inside `src/`:

```ts
import { createPlayer, defaultPlugins } from 'composable-video-player';
import { sharePlugin, withShareButton } from './plugins/share.js';

const player = createPlayer({
  container: 'player',
  source: 'https://your-stream-host/video-id/manifest/video.m3u8',
  layout: withShareButton(), // inserts { type: 'share' } before Settings
  plugins: [...defaultPlugins(), sharePlugin()],
});

player.command('openShare');       // whole-video link
player.command('openShare', true); // link with the current time
```

The **Start at** checkbox switches between the two links. Plain sharing removes an old `t` value and the page anchor; timed sharing includes whole seconds, including `t=0`. The plugin restores explicit URL timestamps on the first load, after memory has run. Escape/Close restores focus, controls remain visible while the panel is open, and clipboard failure falls back to selecting the link for manual copying.

For a custom layout, insert `{ type: 'share' }` yourself. For reuse outside this folder, copy the plugin, its `parseTimestamp` helper from `src/content.ts`, and the `.library-share-*` CSS rules from `src/styles.css`. The plugin imports the published player API.

### VAST advertising: a useful integration example

An ad-supported recording library needs more than an ad video: it needs to pause content, coordinate controls, honor the ad's skip rules, and continue when an ad finishes or fails. The **Make your video library ad-supported** card demonstrates these behaviors on the same player. Ordinary playback stays available without enabling ads.

1. Click **Enable ad demo** to load Google IMA and the local VAST fixture. No ad request is made yet.
2. Click **Play with ad**. The default local VAST fixture plays Google's public sample footage through the real IMA SDK; IMA enables **Skip Ad** after five seconds. The fixture lasts about a minute if watched in full.
3. Try **Invalid VAST response** to see an SDK error followed by content fallback. Two additional scenarios use Google's official linear and skippable ad-server tags; network filters and ad blockers may block them.
4. Read the event trace and open **VAST / IMA** in the code walkthrough. The sample XML is available at `/vast-demo.xml`.

IMA owns VAST parsing, creative playback, ad tracking where supplied, and skip eligibility. The custom `imaPrerollPlugin` uses `addLayer`, typed commands and `commands.before` to coordinate the player. Ad media uses a separate SDK element, so the content source, chapter position and viewing history are preserved. Content seeking/Share are blocked during the break; Pause/Play commands control the ad. Completion, skip, error, request timeout and **Exit demo** return to the content. Disposal cancels pending work without restarting a removed player.

```ts
import { imaPrerollPlugin } from './plugins/ima.js';

// Add to createPlayer({ plugins: [...] }):
plugins: [...defaultPlugins(), imaPrerollPlugin({
  onEvent: event => console.log(event.name, event.detail),
})]

// In an Enable button handler:
await player.command('prepareAds');

// On a subsequent click/tap, directly inside the user gesture:
player.command('playPreroll', yourVastTagUrl);

// For a VAST response already obtained by your app:
player.command('playPreroll', { adsResponse: vastXml });
```

Copy `src/plugins/ima.ts`, `ad-break.ts`, `ima-sdk.ts` and the `.library-ad-*` CSS rules for reuse. The local fixture uses `adsResponse` because the SDK's iframe cannot fetch localhost XML in browsers with private-network protections. Its video remains hosted by Google; no media file is redistributed. The fixture has no campaign tracking URLs. Google IMA itself is a third-party SDK and is loaded only after the visitor enables the demo.

This is an **example-level linear preroll integration**, not built-in VAST support in the player core. A production ad product also needs its own ad inventory/tag configuration, consent handling and platform/device validation. Midroll schedules, VMAP, nonlinear creatives and a campaign dashboard are outside this example.

References: [Google IMA setup](https://developers.google.com/interactive-media-ads/docs/sdks/html5/client-side/get-started), [sample tags](https://developers.google.com/interactive-media-ads/docs/sdks/html5/client-side/tags), [AdsRequest: URL or XML](https://developers.google.com/interactive-media-ads/docs/sdks/html5/client-side/reference/class/google.ima.AdsRequest).

## Add your videos

Upload videos through the Cloudflare dashboard under **Stream** and wait until they are ready. Copy each **Video ID**: the 32-character UID, not an iframe URL, account ID or live input ID. In `library.config.ts`, set `demo: false` and add selected videos:

```ts
videos: [{
  slug: 'getting-started',
  streamId: 'YOUR_STREAM_VIDEO_ID',
  title: 'Getting started',
  description: 'Set up the project and publish your first page.',
  category: 'Guides',
  chapters: [
    { time: 0, title: 'Introduction' },
    { time: 30, title: 'Set up the project' },
    { time: 95, title: 'Publish a page' },
  ],
}],
```

Slugs use lowercase letters, digits and hyphens. Keep them unique and stable: they identify links and remembered progress. Config order determines catalogue order. An empty list produces an empty catalogue; the app never publishes all videos from your account automatically.

### Configure API access

Create a [Cloudflare API token](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/) with **Account → Stream → Read**, scoped to the account containing your videos. The example only reads videos/captions; it does not modify them.

```bash
cp .dev.vars.example .dev.vars
```

Fill in `.dev.vars` and restart `npm run dev`:

```dotenv
CLOUDFLARE_ACCOUNT_ID="your_32_character_account_id"
CLOUDFLARE_STREAM_API_TOKEN="your_api_token"
```

`.dev.vars` is ignored by Git. The API token stays in the Worker. Wrangler uses separate authentication to deploy.

Use public VOD videos. This starter has no viewer authentication or signed playback; videos with **Require Signed URLs** show an explanation. See [Stream access control](https://developers.cloudflare.com/stream/viewing-videos/securing-your-stream/) when extending it for private content.

## Chapters, captions and transcript

Chapter times are seconds. Chapters are sorted, appear on the timeline and link to `/?video=getting-started&t=95`. Explicit `t=0` overrides remembered progress. Search includes chapter titles, and matching cards open the matching chapter.

Attach captions in the Cloudflare Stream dashboard. The Worker lists ready tracks and serves their VTT files through a same-origin endpoint. The player displays captions; transcript lines seek on click. Caption upload/generation remain dashboard operations. See [Cloudflare captions](https://developers.cloudflare.com/stream/edit-videos/adding-captions/).

Optionally add local/external caption files to a video's config:

```ts
captions: [
  { language: 'en', label: 'English', url: '/captions/getting-started.vtt' },
  { language: 'ru', label: 'Русский', url: '/captions/getting-started.ru.srt' },
],
```

Put local files in `public/captions/`. Configured tracks override Stream tracks of the same language. External hosts need CORS. The player's caption menu and transcript language selector stay in sync. **Captions off** clears the transcript. Caption failures do not stop video playback.

Transcript text is plain text; complex WebVTT positioning/styling is not reproduced. The HTML subtitle overlay is not visible in iPhone's native video fullscreen.

## Make it yours

`branding` in `library.config.ts` controls the site and player:

```ts
branding: {
  name: 'Acme Academy',
  description: 'Short guides for getting things done with Acme.',
  logo: '/logo.svg', // optional; place the file in public/
  defaultScheme: 'dark',
  light: {
    background: '#f5f3ee', surface: '#ffffff', text: '#222720',
    muted: '#666d62', accent: '#547a39',
  },
  dark: {
    background: '#141813', surface: '#20261e', text: '#eff2e9',
    muted: '#a1ac99', accent: '#c3e88d',
  },
  player: {
    subtitleColor: '#ffffff', subtitleBackground: 'rgba(0,0,0,0.75)',
    subtitleSize: '1.3em', radius: '10px',
  },
},
```

Choose contrasting text/background colors in both palettes. Viewers can switch light/dark; that preference is remembered locally. Owner customization uses config files, without a visual editor or database. The UI loads DM Sans/DM Serif Display from Google Fonts with system fallbacks; replace the CSS `@import` to self-host fonts.

## Deploy to your Cloudflare account

Choose a unique Worker `name` in `wrangler.jsonc`. If you use multiple accounts, also set its `account_id` to the account hosting the Worker.

```bash
npx wrangler login
npm run deploy
```

For your own library, add both secrets to the deployed Worker:

```bash
npx wrangler secret put CLOUDFLARE_ACCOUNT_ID
npx wrangler secret put CLOUDFLARE_STREAM_API_TOKEN
```

Paste values at the interactive prompts. Local `.dev.vars` values are not deployed automatically. Playback of your own videos works after both secrets are set. Open the `workers.dev` URL printed by Wrangler; a custom domain can be attached in the dashboard.

If Stream **Allowed Origins** is enabled, allow your deployed hostname and local development hostname as appropriate. See [origin restrictions](https://developers.cloudflare.com/stream/viewing-videos/securing-your-stream/#allowed-origins). Stream storage/delivery and Workers usage are billed to your account.

No database or bucket is needed. Workers Static Assets serves the frontend; Hono handles `/api/*`. The player requests manifests and video segments directly from Stream. The Worker never proxies or caches video/manifests.

## Development

```bash
npm test                 # Hono routes and chapter/transcript behavior
npm run test:stream      # optional live check: all six recordings, audio + captions
npm run check            # strict TypeScript
npm run build            # frontend → dist/
npm run deploy:dry-run   # bundle Worker/assets without uploading
npm run dev              # build frontend and run local Worker
```

Wrangler watches Worker/config changes. After frontend edits, run `npm run build` in a second terminal and refresh. Restart `npm run dev` after `.dev.vars` edits.

```text
Browser ── /api/library ──────────────▶ Hono Worker (curated config)
Browser ── /api/videos/:slug ─────────▶ Hono Worker ──▶ Stream REST API
Browser ── /api/videos/:slug/captions/:language ──────▶ Stream VTT
Player  ── HLS + video segments ────────────────────▶ Cloudflare Stream
```

`library.config.ts` is the owner configuration; `src/worker.ts` contains allowlisted API routes; `src/stream.ts` handles authenticated API calls; `src/client.ts` implements catalogue/navigation/branding; `src/player.ts` connects the published player to chapters/captions/transcript; `src/content.ts` parses timestamps/transcripts; `public/` holds local assets.

References: [video details API](https://developers.cloudflare.com/api/resources/stream/methods/get/), [captions API](https://developers.cloudflare.com/stream/edit-videos/adding-captions/), [Hono on Workers](https://hono.dev/docs/getting-started/cloudflare-workers), [gitpick](https://github.com/nrjdalal/gitpick). REST can be replaced with a [Stream binding](https://developers.cloudflare.com/stream/manage-video-library/bindings/) when extending the app.

## Boundaries

A public starter for a small curated collection: no sign-in, paid courses, upload UI, server-side history or private-video access control. Progress stays in the current browser. Media needs internet access. Demo playback exercises the player/Stream connection; mocked API tests do not verify credentials or permissions in your account.

In demo mode, `src/public-captions.ts` reads the live HLS subtitle rendition and resolves the current signed VTT asset URL. It fetches manifests fresh, validates their origin and never stores or serves manifests. The same-origin caption endpoint delivers the original text, while the player continues to fetch video directly. Own-account mode uses the authenticated Stream captions API instead. `src/demo-library.ts` contains attribution/editorial metadata; `src/history.ts` implements bounded, validated local viewing history.

MIT, like composable-video-player.
