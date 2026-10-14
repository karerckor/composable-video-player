import { beforeEach, describe, expect, it, vi } from 'vitest';
import { subtitlesPlugin, type SubtitlesPluginOptions } from '../../src/plugins/subtitles/index.js';
import { createTestPlayer } from '../helpers/player-harness.js';
import { flush } from '../helpers/flush.js';
import type { PlayerOptions } from '../../src/types.js';

const FILES: Record<string, string> = {
  'en.vtt': 'WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nHello <b>world</b>',
  'ru.srt': '1\n00:00:01,000 --> 00:00:03,000\nПривет',
};
const fetchMock = vi.fn(async (url: string) => (FILES[url.split('?')[0]!] ? new Response(FILES[url.split('?')[0]!]) : new Response('', { status: 404 })));

function setup(options: Partial<PlayerOptions> = {}, pluginOptions: SubtitlesPluginOptions = {}) {
  const t = createTestPlayer({ ...options, plugins: [subtitlesPlugin({ fetch: fetchMock as unknown as typeof fetch, ...pluginOptions })] });
  const text = () => t.host.querySelector('.vp-subtitles-text')!.textContent;
  return { ...t, text };
}

beforeEach(() => {
  fetchMock.mockClear();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('subtitlesPlugin', () => {
  it('loads tracks from the option and shows the first one by default', async () => {
    const { player, media, text, host } = setup({ subtitle: '[English]en.vtt,[Русский]ru.srt', source: 'a.mp4' });
    await flush();
    expect(player.state.textTracks.map((t) => t.label)).toEqual(['English', 'Русский']);
    expect(player.state.textTrack).toBe(0);
    media.timeTo(1.5);
    expect(text()).toBe('Hello world');
    expect(host.querySelector('.vp-subtitles-text b')!.textContent).toBe('world');
    media.timeTo(4);
    expect(text()).toBe('');
  });

  it('uses inline subtitles from the source and loads lazily', async () => {
    const { player } = setup({ source: 'a.mp4(subtitle:[En]en.vtt[Ru]ru.srt)', subtitleStart: false });
    await flush();
    expect(player.state.textTracks).toHaveLength(2);
    expect(player.state.textTrack).toBe(-1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('respects defaultSubtitle and the memory preference', async () => {
    const a = setup({ subtitle: '[En]en.vtt,[Ru]ru.srt', defaultSubtitle: 'Ru', source: 'a.mp4' });
    await flush();
    expect(a.player.state.textTrack).toBe(1);
    const b = createTestPlayer({
      subtitle: '[En]en.vtt,[Ru]ru.srt',
      defaultSubtitle: 'Ru',
      plugins: [
        { name: 'pref', setup: (ctx) => void ctx.events.on('init', () => ctx.store.set({ preferredSubtitle: 'off' })) },
        subtitlesPlugin({ fetch: fetchMock as unknown as typeof fetch }),
      ],
      source: 'a.mp4',
    });
    await flush();
    expect(b.player.state.textTrack).toBe(-1);
  });

  it('switches through the menu and emits subtitle only on explicit changes', async () => {
    const { player, host } = setup({ subtitle: '[En]en.vtt,[Ru]ru.srt', source: 'a.mp4' });
    const events: string[] = [];
    player.on('subtitle', (label) => events.push(label));
    await flush();
    host.querySelector<HTMLButtonElement>('.vp-settings')!.click();
    const items = [...host.querySelectorAll<HTMLButtonElement>('.vp-menu-item')];
    expect(items.map((b) => b.querySelector('.vp-menu-label')!.textContent)).toEqual(['Off', 'En', 'Ru']);
    items[0]!.click();
    expect(player.state.textTrack).toBe(-1);
    expect(events).toEqual(['off']);
  });

  it('supports toggleSubtitles, addSubtitle and api', async () => {
    const { player } = setup({ subtitle: '[En]en.vtt', source: 'a.mp4' });
    await flush();
    player.command('toggleSubtitles');
    expect(player.state.textTrack).toBe(-1);
    player.command('toggleSubtitles');
    expect(player.state.textTrack).toBe(0);
    player.api('subtitle', '[Ru]ru.srt');
    expect(player.state.textTracks.map((t) => t.label)).toEqual(['En', 'Ru']);
    expect(player.state.textTrack).toBe(1);
    player.api('+subtitle', '[De]de.vtt');
    expect(player.state.textTrack).toBe(1);
    expect(player.api('subtitles')).toEqual(['En', 'Ru', 'De']);
  });

  it('applies subshift and url shift', async () => {
    const { media, text } = setup({ subtitle: '[En]en.vtt?shift=10', source: 'a.mp4' });
    await flush();
    media.timeTo(1.5);
    expect(text()).toBe('');
    media.timeTo(2.5);
    expect(text()).toBe('Hello world');
  });

  it('reports load failures and keeps working', async () => {
    const { player, media, text } = setup({ subtitle: '[X]missing.vtt', source: 'a.mp4' });
    const errors: string[] = [];
    player.on('loaderror', ({ url }) => errors.push(url));
    await flush();
    media.timeTo(1);
    expect(text()).toBe('');
    expect(errors).toEqual(['missing.vtt']);
  });

  it('raises the layer while controls are visible', async () => {
    const { player, host } = setup({ subtitle: '[En]en.vtt', source: 'a.mp4' });
    await flush();
    const layer = host.querySelector('.vp-subtitles')!;
    expect(layer.classList.contains('vp-subtitles-raised')).toBe(true);
    await player.play();
    player.command('setControlsLocked', false);
    expect(player.state.userActive).toBe(false);
    expect(layer.classList.contains('vp-subtitles-raised')).toBe(false);
  });

  it('ignores a track fetch that resolves after a new source was loaded', async () => {
    let resolveEn!: (r: Response) => void;
    const slow = vi.fn((url: string) => (url === 'en.vtt' ? new Promise<Response>((r) => void (resolveEn = r)) : fetchMock(url)));
    const { player } = setup({ subtitle: '[En]en.vtt', source: 'a.mp4' }, { fetch: slow as unknown as typeof fetch });
    await flush();
    expect(player.state.textTracks.map((t) => t.label)).toEqual(['En']);
    player.api('play', 'b.mp4(subtitle:[Ru]ru.srt)');
    await flush();
    expect(player.state.textTracks.map((t) => t.label)).toEqual(['Ru']);
    const before = player.state.textTracks;
    resolveEn(new Response(FILES['en.vtt']));
    await flush();
    expect(player.state.textTracks).toBe(before);
  });

  it('does nothing on toggleSubtitles without tracks', async () => {
    const { player } = setup({ source: 'a.mp4' });
    await flush();
    const events: string[] = [];
    player.on('subtitle', (label) => events.push(label));
    player.command('toggleSubtitles');
    expect(events).toEqual([]);
    expect(player.state.textTrack).toBe(-1);
  });
});
