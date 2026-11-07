import { formatTime, type Player } from 'composable-video-player';
import { button, el, safeStorage, watchUrl } from './dom.js';
import { loadLibrary, loadPlayback, publicPreview } from './data.js';
import { applyPlayerPalette, mountPlayer } from './player.js';
import type { LibraryResponse, Palette, PlaybackResponse } from './shared.js';
import { continuingVideos, readProgress, recordProgress } from './history.js';
import { mountIntegration } from './integration.js';
import { createAdDemo } from './ad-demo.js';
import './styles.css';

const root = document.querySelector<HTMLElement>('#app')!;
let library: LibraryResponse;
let player: Player | undefined;
let flushProgress: (() => void) | undefined;
let integrationView: { refreshTheme(): void } | undefined;
let navigation = new AbortController();
let main: HTMLElement;
let scheme: 'light' | 'dark';
let themeButton: HTMLButtonElement;
const cache = new Map<string, PlaybackResponse>();
const historyKey = 'stream-library:history:v1';
let viewingHistory = readProgress(safeStorage(historyKey));
const palette = (): Palette => library.branding[scheme];
const recordedDate = (value: string) => Number.isNaN(Date.parse(value)) ? value : new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value));

function applyTheme() {
  document.documentElement.style.colorScheme = scheme;
  document.documentElement.dataset.scheme = scheme;
  for (const [key, value] of Object.entries(palette())) document.documentElement.style.setProperty(`--${key}`, value);
  themeButton.textContent = scheme === 'dark' ? '☼ Light' : '☾ Dark';
  themeButton.setAttribute('aria-label', `Switch to ${scheme === 'dark' ? 'light' : 'dark'} theme`);
  if (player) applyPlayerPalette(player, palette());
  integrationView?.refreshTheme();
}
function navigate(url: string) {
  history.pushState(null, '', url);
  void render();
}
function link(text: string, url: string, className: string) {
  const anchor = el('a', className, text); anchor.href = url;
  anchor.addEventListener('click', event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); navigate(url);
  });
  return anchor;
}
function shell() {
  document.title = library.branding.name;
  document.querySelector('meta[name="description"]')?.setAttribute('content', library.branding.description);
  const savedScheme = safeStorage('stream-library:scheme');
  scheme = savedScheme === 'light' || savedScheme === 'dark' ? savedScheme : library.branding.defaultScheme;
  const header = el('header', 'site-header');
  const brand = link('', location.pathname, 'brand');
  if (library.branding.logo) {
    const logo = el('img', 'logo'); logo.src = library.branding.logo; logo.alt = ''; brand.append(logo);
  } else brand.append(el('span', 'brand-mark', '▸'));
  brand.append(el('span', '', library.branding.name));
  const controls = el('nav', 'header-actions'); controls.setAttribute('aria-label', 'Main navigation');
  controls.append(link('The library', location.pathname, 'nav-link'));
  if (library.demo) controls.append(el('span', 'demo-badge', 'DEMO LIBRARY'));
  themeButton = button('', 'theme-button', () => { scheme = scheme === 'dark' ? 'light' : 'dark'; safeStorage('stream-library:scheme', scheme); applyTheme(); });
  controls.append(themeButton); header.append(brand, controls);
  main = el('main', 'main'); main.id = 'main'; main.tabIndex = -1;
  const footer = el('footer', 'site-footer');
  footer.append(el('span', '', 'A small home for things worth watching.'));
  const credit = el('a', '', 'composable-video-player ↗'); credit.href = 'https://github.com/karerckor/composable-video-player';
  footer.append(credit);
  root.replaceChildren(header, main, footer); applyTheme();
}
function showError(message: string, retry: () => void) {
  const box = el('div', 'error-state'); box.setAttribute('role', 'alert');
  box.append(el('span', 'eyebrow', 'A SMALL INTERRUPTION'), el('h2', '', 'Let’s try that again.'), el('p', 'muted', message), button('Try again ↗', 'primary-button', retry));
  main.replaceChildren(box);
}
async function playback(slug: string, signal: AbortSignal): Promise<PlaybackResponse> {
  const existing = cache.get(slug);
  if (existing) return existing;
  const data = await loadPlayback(slug, signal);
  cache.set(slug, data);
  return data;
}

function catalogue(signal: AbortSignal) {
  const hero = el('section', 'library-hero');
  const intro = el('div');
  intro.append(el('div', 'eyebrow', 'WATCH. LEARN. BUILD.'), el('h1', 'display', 'A little insight.'));
  const secondLine = el('span', 'display second-line', 'Your next idea.'); intro.append(secondLine, el('p', 'hero-description', library.branding.description));
  const count = el('div', 'collection-count'); count.append(el('span', 'count-number', String(library.videos.length).padStart(2, '0')), el('span', 'eyebrow', library.videos.length === 1 ? 'VIDEO, AND COUNTING' : 'VIDEOS IN THE COLLECTION'));
  hero.append(intro, count);
  const tour = el('div', 'player-tour');
  const tourText = el('div'); tourText.append(el('span', 'eyebrow', 'BUILT WITH COMPOSABLE-VIDEO-PLAYER'), el('p', '', 'A real app, with the player integration in view. Try the custom Share plugin, inspect its source, and drive the player through the live API.'));
  tour.append(tourText);
  if (library.videos[0]) tour.append(link('Explore the player & code ↗', `${watchUrl(library.videos[0].slug)}#player-integration`, 'outline-button'));
  const section = el('section', 'catalogue');
  const toolbar = el('div', 'catalogue-toolbar');
  const heading = el('h2', '', 'Explore the collection');
  const searchLabel = el('label', 'search-wrap');
  const search = el('input', 'search'); search.type = 'search'; search.placeholder = 'Find something to watch…';
  const accessible = el('span', 'sr-only', 'Search videos'); searchLabel.append(accessible, el('span', 'search-symbol', '⌕'), search);
  toolbar.append(heading, searchLabel);
  const filters = el('div', 'filters'); filters.setAttribute('role', 'group'); filters.setAttribute('aria-label', 'Filter by category');
  const grid = el('div', 'video-grid');
  const resultCount = el('p', 'sr-only'); resultCount.setAttribute('role', 'status');
  let category = 'All videos';
  const categories = ['All videos', ...new Set(library.videos.map(v => v.category))];
  function filter() {
    const query = search.value.toLowerCase().trim();
    const videos = library.videos.filter(v => (category === 'All videos' || category === v.category) && `${v.title} ${v.description} ${v.category} ${(v.chapters ?? []).map(c => c.title).join(' ')}`.toLowerCase().includes(query));
    grid.replaceChildren(...videos.map(video => card(video, signal, undefined, query)));
    if (!videos.length) grid.append(el('div', 'empty-state', library.videos.length ? 'No videos match. Try another search or category.' : 'Your collection is ready for its first video. Add a video in library.config.ts to get started.'));
    resultCount.textContent = `${videos.length} ${videos.length === 1 ? 'video' : 'videos'} found`;
    filters.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.textContent === category)));
  }
  for (const name of categories) filters.append(button(name, 'filter-button', () => { category = name; filter(); }));
  search.addEventListener('input', filter, { signal });
  section.append(toolbar, filters, resultCount, grid);
  const note = el('section', 'library-note');
  note.append(el('span', 'note-mark', '↳'), el('p', '', library.demo ? 'A curated selection of Cloudflare TV recordings. Talks reflect their original recording dates; each video links to its source.' : 'Pick up where you left off. Find the part you need. Make a little time for a good idea.'));
  const recent = continuingVideos(viewingHistory, library.videos.map(v => v.slug)).slice(0, 3);
  const continued = el('section', 'continue-section');
  if (recent.length) {
    const row = el('div', 'section-heading'); row.append(el('h2', '', 'Pick up where you left off'), el('span', 'muted', 'Saved in this browser'));
    const list = el('div', 'continue-grid');
    for (const entry of recent) {
      const video = library.videos.find(v => v.slug === entry.slug)!;
      const item = link('', watchUrl(video.slug, entry.time), 'continue-card');
      const image = el('img'); image.src = video.poster ?? cache.get(video.slug)?.poster ?? ''; image.alt = '';
      const info = el('div'); info.append(el('h3', '', video.title), el('span', 'resume-time', `↳ Resume at ${formatTime(entry.time)}${entry.duration > 0 ? ` / ${formatTime(entry.duration)}` : ''}`));
      item.append(image, info); list.append(item);
    }
    continued.append(row, list);
  }
  main.replaceChildren(hero, tour, ...(recent.length ? [continued] : []), section, note); filter();
}
function card(video: LibraryResponse['videos'][number], signal: AbortSignal, start?: number, query = ''): HTMLElement {
  const match = query ? video.chapters?.find(chapter => chapter.title.toLowerCase().includes(query)) : undefined;
  const card = link('', watchUrl(video.slug, start ?? match?.time), 'video-card');
  const thumbnail = el('div', 'card-thumbnail');
  const image = el('img'); image.alt = ''; image.loading = 'lazy';
  const playIcon = el('span', 'card-play', '↗');
  const duration = el('span', 'card-duration mono', 'WATCH VIDEO');
  if (video.poster) image.src = video.poster;
  if (video.duration) duration.textContent = formatTime(video.duration);
  thumbnail.append(image, playIcon, duration);
  const content = el('div', 'card-content');
  content.append(el('span', 'eyebrow card-category', video.category), el('h3', '', video.title), el('p', 'muted', video.description));
  const meta = el('div', 'card-meta');
  if (video.chapters?.length) meta.append(el('span', '', `${video.chapters.length} chapters`));
  meta.append(el('span', '', match ? `Jump to ${formatTime(match.time)} ↗` : 'Open video ↗'));
  if (match) content.append(el('p', 'chapter-match', `Chapter: ${match.title}`));
  if (video.recordedAt) content.append(el('p', 'recorded-date', `Recorded ${recordedDate(video.recordedAt)}`));
  content.append(meta);
  const progress = viewingHistory[video.slug];
  if (progress && progress.time > 5 && progress.duration > 0) {
    const meter = el('progress', 'watch-progress'); meter.max = progress.duration; meter.value = progress.completed ? progress.duration : progress.time;
    meter.setAttribute('aria-label', progress.completed ? 'Watched' : `${Math.round(progress.time / progress.duration * 100)}% watched`);
    content.append(el('span', 'progress-label', progress.completed ? '✓ Watched' : `${Math.round(progress.time / progress.duration * 100)}% watched`), meter);
  }
  card.append(thumbnail, content);
  if (!video.poster || !video.duration) void playback(video.slug, signal).then(data => {
    if (signal.aborted) return;
    image.src = data.poster;
    if (data.duration > 0) duration.textContent = formatTime(data.duration);
  }).catch(() => { if (!signal.aborted) duration.textContent = 'VIEW DETAILS'; });
  return card;
}

async function watch(slug: string, timestamp: string | null, signal: AbortSignal) {
  const video = library.videos.find(v => v.slug === slug);
  if (!video) { showError('This video is not in the library.', () => navigate(location.pathname)); return; }
  document.title = `${video.title} — ${library.branding.name}`;
  const back = link('← Back to the library', location.pathname, 'back-link');
  const titleRow = el('div', 'watch-heading');
  const title = el('div'); title.append(el('span', 'eyebrow', video.category), el('h1', '', video.title));
  const share = button('↗ Share video', 'outline-button', () => player?.command('openShare', false)); share.disabled = true;
  share.setAttribute('aria-haspopup', 'dialog');
  titleRow.append(title, share);
  const layout = el('div', 'watch-layout');
  const left = el('div', 'watch-primary');
  const container = el('div', 'player-container'); container.append(el('div', 'player-loading', 'Getting your video ready…'));
  const description = el('div', 'video-description'); description.append(el('span', 'eyebrow', 'ABOUT THIS VIDEO'), el('p', '', video.description));
  const adDemo = createAdDemo(signal);
  left.append(container, adDemo.element, description);
  const source = el('div', 'video-source');
  if (video.recordedAt) source.append(el('span', '', `Recorded ${recordedDate(video.recordedAt)}`));
  if (video.sourceUrl) {
    const original = el('a', '', 'Watch the original on Cloudflare TV ↗'); original.href = video.sourceUrl; original.target = '_blank'; original.rel = 'noopener noreferrer'; source.append(original);
  }
  description.append(source);
  const side = el('aside', 'watch-sidebar'); side.setAttribute('aria-label', 'Video navigation');
  const tabs = el('div', 'panel-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Video details');
  const chapters = el('div', 'chapters'); chapters.id = 'chapters-panel'; chapters.setAttribute('role', 'tabpanel');
  const transcriptPanel = el('div', 'transcript-panel'); transcriptPanel.id = 'transcript-panel'; transcriptPanel.setAttribute('role', 'tabpanel'); transcriptPanel.hidden = true;
  const captionLabel = el('label', 'caption-label', 'Caption language');
  const captionSelect = el('select', 'caption-select'); captionLabel.append(captionSelect);
  const transcript = el('div', 'transcript'); transcriptPanel.append(captionLabel, transcript);
  function setTab(which: 'chapters' | 'transcript') {
    chapters.hidden = which !== 'chapters'; transcriptPanel.hidden = which !== 'transcript';
    for (const tab of [chapterTab, transcriptTab]) { const selected = tab === (which === 'chapters' ? chapterTab : transcriptTab); tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1; }
  }
  const chapterTab = button(`Chapters${video.chapters?.length ? ` · ${video.chapters.length}` : ''}`, 'panel-tab', () => setTab('chapters'));
  const transcriptTab = button('Transcript', 'panel-tab', () => setTab('transcript'));
  chapterTab.id = 'chapters-tab'; transcriptTab.id = 'transcript-tab';
  for (const [tab, panel] of [[chapterTab, chapters], [transcriptTab, transcriptPanel]] as const) { tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', panel.id); panel.setAttribute('aria-labelledby', tab.id); }
  tabs.addEventListener('keydown', event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); const which = chapters.hidden ? 'chapters' : 'transcript'; setTab(which); (which === 'chapters' ? chapterTab : transcriptTab).focus(); } }, { signal });
  tabs.append(chapterTab, transcriptTab); setTab('chapters');
  side.append(tabs, chapters, transcriptPanel, el('p', 'sidebar-tip', 'Find your moment. Click a chapter or a transcript line to jump there.'));
  layout.append(left, side);
  const related = [...library.videos.filter(v => v.slug !== video.slug && v.category === video.category), ...library.videos.filter(v => v.slug !== video.slug && v.category !== video.category)].slice(0, 3);
  const upNext = el('section', 'up-next');
  if (related.length) {
    const row = el('div', 'section-heading'); row.append(el('h2', '', 'Keep the ideas coming'), el('span', 'muted', 'Up next in the library'));
    const grid = el('div', 'video-grid'); grid.append(...related.map(v => card(v, signal))); upNext.append(row, grid);
  }
  const integration = el('section', 'player-integration'); integration.id = 'player-integration';
  main.replaceChildren(back, titleRow, layout, integration, upNext);
  try {
    const data = await playback(slug, signal);
    if (signal.aborted) return;
    container.replaceChildren();
    const resume = continuingVideos(viewingHistory, [video.slug])[0];
    player = mountPlayer({ container, chapters, transcript, captionSelect, video, playback: data, branding: library.branding, palette: palette(), timestamp: timestamp ?? (resume ? String(resume.time) : null), signal, onAdEvent: adDemo.onEvent });
    adDemo.attach(player);
    share.disabled = false;
    integrationView = mountIntegration({ container: integration, player, video, playback: data, branding: library.branding, palette, signal });
    const currentPlayer = player;
    let lastSavedAt = 0;
    function save(completed = false) {
      const media = currentPlayer.video;
      // A paused seek can precede the next time event. Read the media synchronously before disposal.
      if (media.readyState === 0) return;
      viewingHistory = recordProgress(viewingHistory, video!.slug, media.currentTime, Number.isFinite(media.duration) ? media.duration : 0, Date.now(), completed);
      safeStorage(historyKey, JSON.stringify(viewingHistory)); lastSavedAt = Date.now();
    }
    flushProgress = () => save();
    currentPlayer.on('time', () => { if (Date.now() - lastSavedAt > 5000) save(); });
    currentPlayer.on('seek', () => save());
    currentPlayer.on('pause', () => save());
    currentPlayer.on('end', () => save(true));
    if (library.demo) description.append(el('p', 'demo-disclosure', 'An archived Cloudflare TV recording, streamed directly from Cloudflare Stream. English captions are the original track. Chapters are editorial navigation aids.'));
  } catch (error) {
    if (signal.aborted) return;
    const state = el('div', 'player-error'); state.setAttribute('role', 'alert');
    state.append(el('h2', '', 'This video needs a moment.'), el('p', '', (error as Error).message), button('Try again', 'primary-button', () => { cache.delete(slug); void render(); }));
    container.replaceChildren(state);
  }
}
async function render() {
  flushProgress?.(); flushProgress = undefined;
  integrationView = undefined;
  navigation.abort(); navigation = new AbortController();
  player?.pause(); player?.destroy(); player = undefined;
  const params = new URLSearchParams(location.search);
  if (params.has('video')) await watch(params.get('video')!, params.get('t'), navigation.signal);
  else { document.title = library.branding.name; catalogue(navigation.signal); }
  main.focus({ preventScroll: true });
  if (location.hash === '#player-integration' || location.hash === '#ad-demo') document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'start' });
  else window.scrollTo(0, 0);
}
async function start() {
  try {
    library = await loadLibrary();
    shell();
    if (publicPreview) {
      const notice = el('aside', 'preview-notice');
      notice.append(el('span', '', 'Public demo · Stream media and captions load directly in your browser.'));
      const source = el('a', '', 'Get the Hono + Worker version ↗'); source.href = 'https://github.com/karerckor/composable-video-player/tree/main/examples/cloudflare-stream'; notice.append(source);
      document.querySelector('.site-header')?.after(notice);
    }
    await render();
    window.addEventListener('popstate', () => { void render(); });
    window.addEventListener('pagehide', () => { flushProgress?.(); player?.pause(); });
  } catch {
    const state = el('main', 'startup'); state.setAttribute('role', 'alert');
    state.append(el('h1', '', 'The library could not open.'), el('p', '', 'Check your connection and try again.'), button('Try again', 'primary-button', () => { void start(); })); root.replaceChildren(state);
  }
}
void start();
