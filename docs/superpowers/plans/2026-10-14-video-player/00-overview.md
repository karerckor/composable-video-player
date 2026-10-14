# Composable Video Player — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a composable, extensible PlayerJS-like web video player in pure TypeScript (zero runtime deps) with a typed API, plugin system, declarative JSON layout and a PlayerJS compat layer.

**Architecture:** A small core (Store, EventBus, CommandRegistry, PluginHost, MediaController) owns media state; providers (html5, lazy hls.js) play URLs; a UI layer builds components from a JSON layout via registries; features are plugins that register menus, components, commands, hide rules and source transforms. `src/player.ts` is the composition root. Full design: `docs/superpowers/specs/2026-10-14-composable-video-player-design.md` (the "spec").

**Tech Stack:** TypeScript 7 (strict, `verbatimModuleSyntax`, `lib` ES2020 — no `Array.prototype.at`), Vite 8 (dev server + library build), Vitest 5 + jsdom 30, Playwright MCP for manual browser verification, ffmpeg for demo assets.

---

## How this plan is organized

The plan is split into files; each file holds one or two chunks (`## Chunk N` headings, each ≤ 1000 lines, reviewed separately). Execute in order; every task ends with green tests and a commit.

| File | Chunks | Delivers |
|---|---|---|
| `01-foundation.md` | 1, 1b | project setup, `types.ts`, `shared/`; Logger, Store, EventBus, CommandRegistry, PluginHost, source parsing |
| `02-media.md` | 2, 2b | test fakes, initial state, fullscreen, media events, media commands; MediaController, html5 provider |
| `03-ui-infra.md` | 3, 3b | DOM/SVG helper, i18n, icons, registries, hide rules, actions; MenuHost, UserActivity, LayoutEngine, UI harness |
| `04-components.md` | 4, 4b | button/slider helpers, containers, indicators; buttons, volume, timeline, registration, default layout, theme CSS |
| `05-player.md` | 5 | `api/` (events list, api-map), `player.ts` composition root, `index.ts`, first runnable demo |
| `06-plugins-a.md` | 6 | quality, speed, audiotracks, hotkeys, autoplay, memory |
| `07-plugins-b.md` | 7, 7b, 7c | shared cue parser, subtitles (VTT/SRT), thumbnails; playlist (+ prev/next/playlist-button components); mediasession, `defaultPlugins()` |
| `08-hls-compat.md` | 8, 8b | hls provider, option mapping; events/postMessage bridges, `Playerjs`, UMD build |
| `09-demo.md` | 9 | demo assets script, demo pages, `dev` root, browser verification, final checks |

## Deviations from the spec (decided while planning)

1. **`src/shared/`** — dependency-free helpers (`errors.ts`, `url.ts`, `time.ts`, `clamp.ts`). Every module may import `shared/`. Reason: core, providers and UI all need `mediaErrorToPlayerError`/extension detection, and the boundary table forbids them importing each other.
2. **`PLAYERJS_EVENTS`** lives in `src/api/events-list.ts` (runtime constant), not in `types.ts` (types only).
3. **Phase order** differs from spec §12: UI infra is built and tested in isolation before the composition root (chunk 5), so `player.ts` is written once.
4. Command handlers that throw are caught by `CommandRegistry.run` (`log.error`, returns `undefined`) — extends spec §5.4 isolation to commands.
5. **`prev`, `next`, `playlist-button` components are registered by the playlist plugin**, not built in. They only make sense with a playlist, and `components/` stays free of plugin commands. The default layout lists them as `optional`.
6. **Toolbar and title hide only on `idle`** (not `not-started`), matching the PlayerJS builder where the control bar is visible before the first play.
7. Layout `action` clicks are intercepted by a capture listener on the player root (fires before the element's own listeners in every engine).
8. A provider's `setQualities`/`setAudioTracks` is **ignored when the source spec has more than one file-based quality/track** (file-based lists win; e.g. `[Low]a.m3u8,[High]b.m3u8`).
9. The html5 provider returns `canPlay = 0` for `.mpd` (DASH is out of scope; letting the browser try would only produce a decode error).
10. Fullscreen is requested on `.vp-root` (`player.root`), not on the user's container, so the player owns its fullscreen styling.
11. New internal event **`ui:drag { active }`**: sliders/timeline emit it so `UserActivity` keeps controls visible during a drag (spec §6.3).
12. The `end` option fires once per source and re-arms after `new` or a seek before the end point.
13. `PluginContext.t(key)` — plugins translate menu option labels ("Выкл", "Обычная", "Авто"); `MenuHost` only translates menu titles.
14. Plugin-added `PlayerState`/`PlayerOptions` fields are optional (declaration merging would otherwise break `createInitialState`).
15. `renameAudio` renames labels in the audio menu only; the `audiotrack` event keeps the source label.
16. `big-play` runs `play` (spec §6.5); `media-click-layer` runs `toggle`.
17. `ApiContext` also carries `events` (play-after-load) and `log` (warnings).
18. `addSubtitle(label, url, select?)` takes an optional third argument (used by `api('subtitle', '[T]url')`); `api('subtitle')` also accepts `'off'` and a track label.
19. The initial `width/height` is written to the store without a `resize` event (so `resize` never precedes `init`).
20. Demo media: CC0 clips from MDN (`interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm|mp4`); the Google sample bucket returns 403.
21. The hls provider labels its Auto level `'auto'` (an i18n key); the quality plugin shows `t('auto')`. `api('quality')` returns the raw label.
22. `memory` persists mute only for explicit `mute`/`toggleMute` commands (`api`/`user`), never for internal ones (muted autoplay fallback); unmute is always persisted. It snapshots stored preferences in `setup` and applies them on `init`.
23. `autoplay` applies to the first (page-load) source only; later loads play only when asked (`api('play', url)`, playlist autonext / `playItem(id, true)`).
24. `forbiddenQuality` also prevents starting on a forbidden quality (falls back to the highest allowed).
25. The settings menu stops propagation of keys it handles (←/→/↑/↓/Esc), and hotkeys ignore events from inside `[role="menu"]`.
26. `shared/cues.ts` holds the WebVTT/SRT cue parser used by both subtitles and thumbnails (plugins may not import each other).
27. The playlist hands per-item thumbnails to the thumbnails plugin through the `setThumbnails` command (if registered), and per-item subtitles through `SourceSpecInput.subtitles`.
28. The `subtitle` event fires only on explicit changes (`setTextTrack`, `toggleSubtitles`, `addSubtitle(…, true)`), so `memory` persists real choices, not automatic defaults.
29. Play-after-load (`api('play', x)`) listens *before* loading and plays on the first `metadata` after the load's own `new`; it is cancelled by a second `new`, an `error`, or a `loaderror` before any `new` (works for playlists intercepted by a before-hook).
30. Playlist items are found by id first, then by index; items without `title`/`poster` reset them to `''`; a direct load supersedes a playlist that is still loading.
31. hls.js is loaded via a `<script>` tag (default jsDelivr `hls.min.js`, `hlsUrl` option) and reuses `window.Hls`; a user `hlsConfig.startPosition` wins unless the player requests a start time.
32. The compat bridges and `ready` callback are an internal `playerjs-compat` plugin, so they observe `init`.
33. UMD output is `dist/player.umd.cjs` (package is `"type": "module"`).
34. `compat/playerjs.ts` imports `core/logger` (to log option-mapping warnings before the player exists); `hlsconfig` may be a JSON string.
35. `memory` treats a throwing `localStorage` getter (opaque origins, sandboxed iframes) as "no storage".
36. **hls.js is preferred over native HLS whenever `MediaSource` exists** (spec §4.2 said native first): desktop Chromium now reports native HLS support but exposes no renditions, which would remove the quality menu. Without MSE (iPhone) the html5 provider still plays HLS natively.
37. Demo HLS uses fMP4 segments (`.m4s`); Vite's dev server would transform `.ts` segments as TypeScript.

## File map

```
package.json, tsconfig.json, tsconfig.build.json, vite.config.ts, vite.umd.config.ts, .gitignore
src/
  env.d.ts                     declare module '*.css?inline'
  types.ts                     all contracts (types only)
  shared/errors.ts             mediaErrorToPlayerError, isPlayerError, toPlayerError
  shared/url.ts                extOf, resolveUrl
  shared/time.ts               formatTime, parseTimestamp
  shared/clamp.ts              clamp
  shared/cues.ts               parseCues (WebVTT/SRT blocks, shared by subtitles and thumbnails)
  core/logger.ts               createLogger
  core/store.ts                createStore
  core/events.ts               createEventBus
  core/commands.ts             createCommandRegistry
  core/plugin-host.ts          createPluginHost
  core/initial-state.ts        createInitialState(options)
  core/fullscreen.ts           enter/exit/watch fullscreen
  core/media-deps.ts           MediaDeps (shared collaborator bag)
  core/media-events.ts         <video> events → store/events
  core/media-commands.ts       play/pause/seek/volume/... commands
  core/media-controller.ts     load pipeline, provider choice, fallback, quality/audio switching
  source/parse.ts              parseSource, parseSubtitleList, isPlaylistInput, normalizeSpec, sourceKey
  providers/html5.ts           html5Provider, hasNativeHls
  providers/hls.ts             hlsProvider
  api/events-list.ts           PLAYERJS_EVENTS
  api/api-map.ts               createApi
  ui/dom.ts                    h(), parseSvg(), iconEl()
  ui/i18n.ts                   dictionaries + createTranslator
  ui/icons.ts                  defaultIcons, createIconSet
  ui/registry.ts               createRegistry<T>
  ui/hide-rules.ts             registerBuiltinHideRules, compileHide
  ui/actions.ts                parseAction, createActionRunner
  ui/menu-host.ts              createMenuHost
  ui/activity.ts               createUserActivity, controlsVisible
  ui/base-props.ts             applyBaseProps
  ui/layout.ts                 createLayoutEngine
  ui/button.ts                 createIconButton
  ui/slider.ts                 createSlider
  ui/default-layout.ts         defaultLayout
  components/containers.ts     root, overlay, toolbar, group, spacer, text
  components/indicators.ts     time, duration, title, buffering, live, error-overlay, media-click-layer
  components/buttons.ts        play, big-play, mute, fullscreen, settings
  components/volume.ts         volume
  components/timeline.ts       timeline
  components/index.ts          BUILTIN_COMPONENTS, registerBuiltinComponents
  plugins/quality.ts, speed.ts, audiotracks.ts, hotkeys.ts, autoplay.ts, memory.ts, mediasession.ts
  plugins/subtitles/parse.ts, plugins/subtitles/index.ts
  plugins/thumbnails/parse.ts, plugins/thumbnails/index.ts
  plugins/playlist/model.ts, plugins/playlist/panel.ts, plugins/playlist/index.ts
  plugins/index.ts             defaultPlugins
  compat/options.ts            mapPlayerjsOptions
  compat/events.ts             bridgeEvents
  compat/postmessage.ts        bridgePostMessage
  compat/playerjs.ts           class Playerjs
  theme/player.css
  player.ts                    createPlayer (composition root)
  index.ts                     public exports
  umd.ts                       UMD entry (window.Playerjs, PlayerjsAsync)
tests/
  helpers/flush.ts, helpers/fake-media.ts, helpers/fake-provider.ts, helpers/ui-harness.ts
  (mirrors src/)
demo/
  index.html, main.ts, compat.html, scripts/make-assets.sh, assets/ (generated, git-ignored)
```

## Conventions for every task

- Run single test files with `npx vitest run <path>`; whole suite with `npm test`; types with `npm run typecheck`.
- All imports of types use `import type` (enforced by `verbatimModuleSyntax`).
- Relative imports without extensions (`'../core/store'`), `moduleResolution: bundler`.
- `lib` is ES2020: don't use `Array.prototype.at`, `Object.hasOwn`, `structuredClone`, `String.prototype.replaceAll`.
- Never assign `innerHTML`; use `h()`/`textContent`, and `iconEl()` for SVG.
- Respect the dependency table (spec §2 + `shared/`): `core` → `source`, `shared`; `ui`/`providers`/`api`/`source` → `shared` only (plus `import type` from `types.ts`); `components` → `ui`, `shared`; `plugins` → `ui`, `source`, `shared`; `compat` → `player`, `api`, `plugins`, `ui`.
- Commit after each task with the message given; end every commit message with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- User-contribution point (learning mode): Task 6.6 marks `shouldRestorePosition` as a function the human may write; a reference implementation is given for when they decline.
