import { formatTime, type Player } from 'composable-video-player';
import { button, el } from './dom.js';
import { renderCode } from './highlight.js';
import type { Branding, LibraryResponse, Palette, PlaybackResponse } from './shared.js';
import shareSource from './plugins/share.ts?raw';
import playerSource from './player.ts?raw';
import imaSource from './plugins/ima.ts?raw';
import adBreakSource from './plugins/ad-break.ts?raw';
import imaSdkSource from './plugins/ima-sdk.ts?raw';
import { publicPreview } from './data.js';

interface IntegrationOptions {
  container: HTMLElement;
  player: Player;
  video: LibraryResponse['videos'][number];
  playback: PlaybackResponse;
  branding: Branding;
  palette: () => Palette;
  signal: AbortSignal;
}

function setupCode({ video, branding, palette }: IntegrationOptions): string {
  const colors = palette();
  const dataCode = publicPreview ? `// Public Pages preview: metadata and captions resolve directly from Stream.
// Deploy the Hono + Worker version for your own Stream account.
import { loadPlayback } from './preview-data.js';
const playback = await loadPlayback('${video.slug}');` : `// Hono returns Stream metadata; video goes directly to Cloudflare Stream.
const response = await fetch('/api/videos/${video.slug}');
if (!response.ok) throw new Error('Video could not be loaded');
const playback = await response.json() as PlaybackResponse;`;
  return `import { createPlayer, defaultPlugins, type Plugin } from 'composable-video-player';
import { sharePlugin, withShareButton } from './plugins/share.js';
import type { Chapter, PlaybackResponse } from './shared.js';

${dataCode}
const chapters: Chapter[] = ${JSON.stringify(video.chapters ?? [], null, 2)};

const chapterPlugin: Plugin = {
  name: 'chapters',
  setup(ctx) {
    ctx.store.set({ markers: chapters.map(c => ({ time: c.time, label: c.title })) });
  },
};

const player = createPlayer({
  container: 'player', // <div id="player"></div>
  title: ${JSON.stringify(video.title)},
  source: {
    qualities: [{ label: '', tracks: [{ label: '', urls: [playback.source] }] }],
    subtitles: playback.captions.map(c => ({ label: c.label, url: c.url })),
  },
  poster: playback.poster,
  cuid: ${JSON.stringify(`stream-library:${video.slug}`)},
  layout: withShareButton(),
  plugins: [...defaultPlugins(), chapterPlugin, sharePlugin()],
  theme: {
    color1: ${JSON.stringify(colors.accent)},
    color2: ${JSON.stringify(colors.text)},
    color3: ${JSON.stringify(colors.surface)},
    toolbarBg: ${JSON.stringify(`linear-gradient(to top, ${colors.surface}, transparent)`)},
    radius: ${JSON.stringify(branding.player.radius)},
    subColor: ${JSON.stringify(branding.player.subtitleColor)},
    subBg: ${JSON.stringify(branding.player.subtitleBackground)},
    subSize: ${JSON.stringify(branding.player.subtitleSize)},
  },
});`;
}

function contentCode(options: IntegrationOptions): string {
  const firstChapter = options.video.chapters?.[1] ?? options.video.chapters?.[0];
  return `// Custom chapter plugin publishes markers through the public store.
setup(ctx) {
  ctx.store.set({
    markers: chapters.map(c => ({ time: c.time, label: c.title })),
  });
}

// Chapter links and transcript lines use the same public seek API.
player.seek(${firstChapter?.time ?? 30});

// Captions are explicit subtitle URLs supplied by the Hono backend.
// In createPlayer({ source: ... }):
subtitles: playback.captions.map(c => ({ label: c.label, url: c.url }))

player.command('setTextTrack', 0);  // first caption track
player.command('setTextTrack', -1); // captions off

// Reactive state drives the transcript highlight and caption selector.
const unsubscribe = player.select(
  state => state.textTrack,
  index => renderTranscript(index),
  { immediate: true },
);

// Unsubscribe when the page is disposed.
unsubscribe();`;
}

export function mountIntegration(options: IntegrationOptions): { refreshTheme(): void } {
  const { container, player, video, signal } = options;
  container.className = 'player-integration'; container.id = 'player-integration';
  const heading = el('div', 'integration-heading');
  const title = el('div'); title.append(el('span', 'eyebrow', 'COMPOSABLE-VIDEO-PLAYER · WORKING EXAMPLE'), el('h2', '', 'The player. The plugins. The code.'));
  const docs = el('a', 'outline-button', 'Player documentation ↗'); docs.href = 'https://karerckor.github.io/composable-video-player/guide/getting-started.html'; docs.target = '_blank'; docs.rel = 'noopener noreferrer';
  heading.append(title, docs);
  const intro = el('p', 'integration-intro', 'This video uses the published npm package. Try Share or a VAST ad, inspect the custom plugins, or run the API examples on this same video.');
  const features = el('div', 'integration-features');
  for (const [label, name, description] of [
    ['BUILT IN', 'HLS, quality, captions & memory', 'Default plugins handle playback settings and remembering your place.'],
    ['CUSTOM PLUGINS', 'Share, chapters & VAST ads', 'Components, layers and command hooks connect features and external SDKs.'],
    ['APP INTEGRATION', 'Transcript & viewing history', 'The page uses seek(), events and reactive state to build around the player.'],
  ]) {
    const feature = el('div'); feature.append(el('span', 'eyebrow', label), el('h3', '', name), el('p', '', description)); features.append(feature);
  }
  const tabs = el('div', 'integration-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Player integration examples');
  const panel = el('div', 'integration-panel'); panel.id = `integration-panel-${video.slug}`; panel.setAttribute('role', 'tabpanel');
  const description = el('p', 'integration-description');
  const live = el('div', 'integration-live'); live.hidden = true;
  const metrics = el('dl', 'live-metrics');
  const values = new Map<string, HTMLElement>();
  for (const name of ['Status', 'Position', 'Quality', 'Captions', 'Speed']) {
    const item = el('div'); const value = el('dd'); values.set(name, value); item.append(el('dt', '', name), value); metrics.append(item);
  }
  const actions = el('div', 'live-actions');
  const liveStatus = el('p', 'integration-status'); liveStatus.setAttribute('role', 'status');
  actions.append(
    button('Play / pause', 'outline-button', () => { if (player.state.status === 'playing') player.pause(); else void player.play().catch(() => { liveStatus.textContent = 'Playback could not start. Use Play in the player to try again.'; }); }),
    button('Seek +10s', 'outline-button', () => player.command('seek', '+10')),
    button('Toggle captions', 'outline-button', () => player.command('toggleSubtitles')),
    button('Speed 1× / 1.5×', 'outline-button', () => player.command('setRate', player.state.rate === 1 ? 1.5 : 1)),
    button('Share with timecode', 'primary-button', () => { player.root.scrollIntoView({ behavior: 'smooth', block: 'center' }); player.command('openShare', true); }),
  );
  live.append(metrics, actions, liveStatus);
  const codeHeader = el('div', 'integration-code-header');
  const filename = el('span', 'mono');
  const status = el('span', 'integration-status'); status.setAttribute('role', 'status');
  const pre = el('pre', 'integration-code'); pre.tabIndex = 0;
  const code = el('code'); pre.append(code);
  const copy = button('Copy code', 'copy-code', () => {
    const text = code.textContent ?? '';
    const fallback = () => {
      if (signal.aborted) return;
      pre.focus(); const range = document.createRange(); range.selectNodeContents(code); const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range); status.textContent = 'Selected — press ⌘C / Ctrl+C';
    };
    if (!navigator.clipboard?.writeText) return fallback();
    navigator.clipboard.writeText(text).then(() => { if (!signal.aborted) status.textContent = 'Copied'; }, fallback);
  });
  codeHeader.append(filename, status, copy);
  const actual = el('details', 'actual-source');
  const summary = el('summary', '', 'Read the full integration used on this page · src/player.ts');
  const full = el('pre', 'integration-code'); full.tabIndex = 0;
  const fullCode = el('code'); renderCode(fullCode, playerSource); full.append(fullCode); actual.append(summary, full);
  panel.append(description, live, codeHeader, pre, actual);
  const examples = [
    { id: 'setup', label: 'Setup', file: 'Your player setup', description: 'A working setup for this video, current theme and captions. Keep defaultPlugins() when adding custom plugins. The full application wiring is available below.', code: () => setupCode(options) },
    { id: 'share', label: 'Share plugin', file: 'src/plugins/share.ts · actual source', description: 'This is the actual custom plugin running above. It registers the Share button, mounts its panel inside the player, exposes openShare(), and restores timecoded links after the memory plugin.', code: () => shareSource },
    { id: 'ads', label: 'VAST / IMA', file: 'IMA usage + actual plugin source', description: 'Build an ad-supported video library: IMA plays a linear VAST preroll, while the custom plugin pauses content, blocks seeking during the ad, and resumes after completion, skip or failure. Try the demo below the player. This is an example plugin; VAST is handled by Google IMA.', code: () => `import { createPlayer, defaultPlugins } from 'composable-video-player';
import { imaPrerollPlugin } from './plugins/ima.js';

const player = createPlayer({
  container: 'player',
  source: 'https://your-stream-host/video-id/manifest/video.m3u8',
  plugins: [...defaultPlugins(), imaPrerollPlugin({
    onEvent: event => console.log(event.name, event.detail),
  })],
});

// Enable button: loads the external SDK. No ad request yet.
await player.command('prepareAds');

// Next click: initialize ad playback directly inside the user gesture.
playWithAdButton.addEventListener('click', () => {
  player.command('playPreroll', yourVastTagUrl);
});

// Completion, skip and ad errors all return to the content video.
// Copy the three plugin files below and the .library-ad-* CSS rules.
// This example supports linear prerolls; it is not a full ad platform.

// ── src/plugins/ima.ts ──
${imaSource}

// ── src/plugins/ad-break.ts ──
${adBreakSource}

// ── src/plugins/ima-sdk.ts ──
${imaSdkSource}` },
    { id: 'content', label: 'Chapters & captions', file: 'Public API excerpts', description: 'Chapter markers are a custom plugin. Captions are a built-in plugin. Clickable chapter/transcript UI is implemented by the app using the public API.', code: () => contentCode(options) },
    { id: 'api', label: 'Live API', file: 'Commands for the player above', description: 'These buttons control the video above. Values come from player.select(); Share with timecode calls a command registered by the custom plugin.', code: () => `player.command('seek', '+10');\nplayer.command('toggleSubtitles');\nplayer.command('setRate', 1.5);\nplayer.command('openShare', true); // custom plugin command\n\nconst unsubscribe = player.select(\n  state => state.currentTime,\n  seconds => updatePosition(seconds),\n  { immediate: true },\n);\n\n// When leaving the page:\nunsubscribe();\nplayer.destroy();` },
  ];
  let selected = 0;
  const tabButtons = examples.map((example, index) => {
    const tab = button(example.label, 'integration-tab', () => select(index)); tab.id = `integration-${example.id}-${video.slug}`; tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', panel.id); return tab;
  });
  function select(index: number) {
    selected = index;
    const example = examples[index];
    tabButtons.forEach((tab, i) => { tab.setAttribute('aria-selected', String(i === index)); tab.tabIndex = i === index ? 0 : -1; });
    panel.setAttribute('aria-labelledby', tabButtons[index].id);
    description.textContent = example.description; renderCode(code, example.code()); filename.textContent = example.file; status.textContent = '';
    live.hidden = example.id !== 'api'; actual.hidden = example.id !== 'setup'; pre.scrollTop = 0;
  }
  tabs.addEventListener('keydown', event => {
    const next = event.key === 'ArrowRight' ? (selected + 1) % examples.length : event.key === 'ArrowLeft' ? (selected + examples.length - 1) % examples.length : event.key === 'Home' ? 0 : event.key === 'End' ? examples.length - 1 : null;
    if (next !== null) { event.preventDefault(); select(next); tabButtons[next].focus(); }
  }, { signal });
  tabs.append(...tabButtons); container.replaceChildren(heading, intro, features, tabs, panel); select(0);
  container.ownerDocument.querySelector<HTMLAnchorElement>('.ad-demo-links a')?.addEventListener('click', event => {
    event.preventDefault();
    select(examples.findIndex(example => example.id === 'ads'));
    history.replaceState(null, '', `${location.pathname}${location.search}#player-integration`);
    container.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, { signal });
  const off = player.select(state => [state.status, Math.floor(state.currentTime), state.quality, state.qualities.map(q => q.label).join(','), state.textTrack, state.rate].join('|'), () => {
    const state = player.state;
    values.get('Status')!.textContent = state.status;
    values.get('Position')!.textContent = formatTime(state.currentTime);
    const quality = state.qualities[state.quality]?.label ?? 'Auto';
    values.get('Quality')!.textContent = quality === 'auto' ? 'Auto' : quality;
    values.get('Captions')!.textContent = state.textTracks[state.textTrack]?.label ?? 'Off';
    values.get('Speed')!.textContent = `${state.rate}×`;
  }, { immediate: true });
  signal.addEventListener('abort', off, { once: true });
  return { refreshTheme() { if (examples[selected].id === 'setup') renderCode(code, setupCode(options)); } };
}
