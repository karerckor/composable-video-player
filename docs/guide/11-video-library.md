# Build a video library with Cloudflare Stream

A player becomes useful when it helps someone do something with a recording: find an explanation, read along, send a specific moment, or continue later. **Fieldnotes** is a runnable example of that application, built around the published `composable-video-player` package.

[Try the public video library](../examples/stream-library/) · [Get the standalone Hono + Worker example](https://github.com/karerckor/composable-video-player/tree/main/examples/cloudflare-stream)

![The working Fieldnotes library](../assets/images/video-library.png)

## A two-minute tour

1. **Find a moment.** Search for **Hugging Face** in the library. The matching chapter opens the recording at 12:57. The search belongs to the app; chapter markers and seeking connect it to the player.
2. **Read along.** Open **Transcript**, choose **English**, and click a line. Captions come from the original recording. The app uses the player's caption selection and current time to synchronize the transcript.
3. **Share the context.** Open **Share** in the player controls. Enable **Start at** and copy a link. This is a custom plugin, and its panel stays inside the player in fullscreen.
4. **Try an ad break.** Under the player, enable the optional ad demo. The local VAST sample plays through Google IMA, with Skip available after five seconds. Complete, skip, or exit the demo to return to your video. Try **Invalid VAST response** to see error fallback.
5. **Inspect the integration.** Open **The player. The plugins. The code.** The tabs show a working setup, the actual custom plugin files, and API buttons that control the same player.

The recordings are archived Cloudflare TV conversations, with dates and original-source links visible. They illustrate playback and application features; they are not current Cloudflare API tutorials.

## What belongs where

| Part | Responsibility |
| --- | --- |
| Player package | Media playback, HLS, captions, settings, keyboard controls, playback memory, layout and theme APIs |
| Example app | Catalogue, chapter search, transcript, viewing history, related videos and branding |
| Share plugin | Toolbar control, panel inside the player, typed `openShare` command and timecoded links |
| IMA example plugin | Ad layer, command coordination and content continuation; Google IMA processes VAST and plays ads |
| Hono Worker | Curated catalogue and Stream metadata/caption API for the deployable version; API credentials stay on the server |
| Cloudflare Stream | Video delivery; the Worker does not proxy HLS media |

## Public preview and deployable application

GitHub Pages serves the public preview as static files. Its data adapter uses only the six public demo recordings and resolves fresh caption URLs directly from Stream in the browser. It has no account credentials and does not run the Hono backend.

The [standalone example](https://github.com/karerckor/composable-video-player/tree/main/examples/cloudflare-stream) includes the real Hono + Cloudflare Worker backend. Configure your curated videos and branding, add your Stream account ID and API token as Worker settings/secrets, then deploy it to your account. It supports public VOD; signed/private video access requires an access policy beyond this example.

```bash
npx gitpick https://github.com/karerckor/composable-video-player/tree/main/examples/cloudflare-stream my-video-library
cd my-video-library
npm install
npm run dev
```

The default demo works without an account. Follow the example README to configure your own Stream videos and run `npm run deploy`.

## Extend the experience

The extension points are small: plugins can register components, add player layers, register typed commands and intercept commands with before-hooks. Application UI can subscribe to state and issue commands.

```ts
// A moment in a recording:
player.seek(777);

// A command registered by the example's Share plugin:
player.command('openShare', true);

// Keep surrounding application UI in sync:
const off = player.select(
  state => state.currentTime,
  seconds => highlightTranscript(seconds),
);
```

A tutorial library, recorded conference hub or product-help video collection can reuse this pattern. Replace the catalogue and branding, retain the features useful to your audience, and add your own components around the player.

The IMA integration is an example of extensibility, not built-in VAST support or a complete advertising product. The demo does not include campaign management, midroll schedules or production consent handling. Public media and external ad resources may be unavailable or blocked by network filters; ordinary content playback remains available when an ad fails.
