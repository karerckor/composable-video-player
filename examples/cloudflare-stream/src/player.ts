import { createPlayer, defaultPlugins, formatTime, type Player, type Plugin } from 'composable-video-player';
import { chapterAt, parseTranscript, type TranscriptCue } from './content.js';
import { button, el, watchUrl } from './dom.js';
import type { Branding, LibraryResponse, Palette, PlaybackResponse } from './shared.js';
import { sharePlugin, withShareButton } from './plugins/share.js';
import { imaPrerollPlugin } from './plugins/ima.js';
import type { AdSignal } from './plugins/ad-break.js';

export function applyPlayerPalette(player: Player, palette: Palette) {
  player.root.style.setProperty('--vp-color-1', palette.accent);
  player.root.style.setProperty('--vp-color-2', palette.text);
  player.root.style.setProperty('--vp-color-3', palette.surface);
  player.root.style.setProperty('--vp-toolbar-bg', `linear-gradient(to top, ${palette.surface}, transparent)`);
}

export function mountPlayer(options: {
  container: HTMLElement;
  chapters: HTMLElement;
  transcript: HTMLElement;
  captionSelect: HTMLSelectElement;
  video: LibraryResponse['videos'][number];
  playback: PlaybackResponse;
  branding: Branding;
  palette: Palette;
  timestamp: string | null;
  signal: AbortSignal;
  onAdEvent(event: AdSignal): void;
}): Player {
  const { container, chapters, transcript, captionSelect, video, playback, branding, palette, timestamp, signal } = options;
  const chapterList = [...(video.chapters ?? [])].filter(c => Number.isFinite(c.time) && c.time >= 0).sort((a, b) => a.time - b.time);
  const chapterPlugin: Plugin = {
    name: 'library-chapters',
    setup(ctx) {
      ctx.store.set({ markers: chapterList.map(c => ({ time: c.time, label: c.title })) });
    },
  };
  const player = createPlayer({
    container, title: video.title, poster: playback.poster, cuid: `stream-library:${video.slug}`,
    source: { qualities: [{ label: '', tracks: [{ label: '', urls: [playback.source] }] }], subtitles: playback.captions.map(c => ({ label: c.label, url: c.url })) },
    layout: withShareButton(),
    plugins: [...defaultPlugins(), chapterPlugin, sharePlugin({ url: () => new URL(watchUrl(video.slug), location.origin).href, startTime: timestamp }), imaPrerollPlugin({ onEvent: options.onAdEvent })],
    theme: { color1: palette.accent, color2: palette.text, color3: palette.surface, toolbarBg: `linear-gradient(to top, ${palette.surface}, transparent)`, radius: branding.player.radius, subColor: branding.player.subtitleColor, subBg: branding.player.subtitleBackground, subSize: branding.player.subtitleSize },
  });
  function seek(time: number) {
    if (player.state.adBreakActive) return;
    player.seek(time);
    history.replaceState(null, '', watchUrl(video.slug, time));
  }
  const chapterButtons = chapterList.map((chapter, i) => {
    const row = el('a', 'chapter-row');
    row.href = watchUrl(video.slug, chapter.time);
    row.append(el('span', 'chapter-number', String(i + 1).padStart(2, '0')), el('span', 'chapter-title', chapter.title), el('time', 'mono', formatTime(chapter.time)));
    row.addEventListener('click', event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault(); seek(chapter.time);
    });
    chapters.append(row);
    return row;
  });
  if (!chapterList.length) chapters.append(el('p', 'empty-note', 'No chapters for this video yet.'));

  const off = el('option', '', 'Captions off'); off.value = '-1'; captionSelect.append(off);
  playback.captions.forEach((caption, index) => {
    const option = el('option', '', caption.label); option.value = String(index); captionSelect.append(option);
  });
  captionSelect.disabled = !playback.captions.length;
  let captionGeneration = 0;
  let cues: TranscriptCue[] = [];
  let cueButtons: HTMLButtonElement[] = [];
  let activeChapter = -2;
  let activeCue = -2;
  async function renderTranscript(index: number) {
    captionSelect.value = String(index);
    const generation = ++captionGeneration;
    cues = []; cueButtons = [];
    const track = playback.captions[index];
    transcript.replaceChildren(el('p', 'empty-note', track ? 'Loading transcript…' : playback.captions.length ? 'Choose a caption language to read along.' : playback.captionsUnavailable ? 'Captions are temporarily unavailable. Try reloading the video.' : 'No captions for this video yet.'));
    if (!track) return;
    try {
      const response = await fetch(track.url, { signal });
      if (!response.ok) throw new Error();
      const text = await response.text();
      if (signal.aborted || generation !== captionGeneration) return;
      cues = parseTranscript(text);
      cueButtons = cues.map(cue => {
        const row = button('', 'transcript-row', () => seek(cue.start));
        row.append(el('time', 'mono', formatTime(cue.start)), el('span', '', cue.text));
        return row;
      });
      transcript.replaceChildren(...(cueButtons.length ? cueButtons : [el('p', 'empty-note', 'This caption track has no transcript text.')]));
      activeCue = -2;
      highlight(player.state.currentTime);
    } catch {
      if (signal.aborted || generation !== captionGeneration) return;
      transcript.replaceChildren(el('p', 'empty-note', 'This transcript could not be loaded.'), button('Try again', 'text-button', () => { void renderTranscript(index); }));
    }
  }
  captionSelect.addEventListener('change', () => player.command('setTextTrack', Number(captionSelect.value)), { signal });
  player.select(s => s.textTrack, index => { void renderTranscript(index); }, { immediate: true });
  function highlight(time: number) {
    const chapter = chapterAt(chapterList, time);
    if (chapter !== activeChapter) {
      chapterButtons.forEach((row, i) => { row.classList.toggle('active', i === chapter); if (i === chapter) row.setAttribute('aria-current', 'true'); else row.removeAttribute('aria-current'); });
      activeChapter = chapter;
    }
    const cue = cues.findIndex(c => c.start <= time && time < c.end);
    if (cue !== activeCue) {
      cueButtons.forEach((row, i) => { row.classList.toggle('active', i === cue); if (i === cue) row.setAttribute('aria-current', 'true'); else row.removeAttribute('aria-current'); });
      activeCue = cue;
    }
  }
  player.on('time', highlight);
  highlight(player.state.currentTime);
  return player;
}
