import { beforeEach, describe, expect, it, vi } from 'vitest';
import { playlistPlugin } from '../../src/plugins/playlist';
import { memoryPlugin } from '../../src/plugins/memory';
import { fnv1a } from '../../src/shared/hash';
import { createTestPlayer } from '../helpers/player-harness';
import { flush } from '../helpers/flush';
import type { PlayerOptions, Plugin, SourceSpec } from '../../src/types';

const ITEMS = [
  { title: 'One', file: 'one.mp4', id: 'a', poster: 'one.jpg', subtitle: '[En]one.vtt', thumbnails: 'one-thumbs.vtt' },
  { title: 'Folder', folder: [{ title: 'Two', file: 'two.mp4', id: 'b' }] },
  { title: 'Three', file: 'three.mp4', id: 'c', start: 'continue' },
];
const JSON_ITEMS = JSON.stringify(ITEMS);
const fetchMock = vi.fn(async (url: string) => (url.endsWith('pl.json') ? new Response(JSON_ITEMS) : new Response('', { status: 404 })));

let specs: SourceSpec[];
let thumbs: string[];
const spy: Plugin = {
  name: 'spy',
  setup(ctx) {
    ctx.events.on('new', ({ spec }) => specs.push(spec));
    ctx.commands.register('setThumbnails', ([url]) => void thumbs.push(url));
  },
};

async function setup(options: Partial<PlayerOptions> = {}) {
  const t = createTestPlayer({ source: JSON_ITEMS, ...options, plugins: [spy, playlistPlugin({ fetch: fetchMock as unknown as typeof fetch })] });
  await flush();
  return t;
}

beforeEach(() => {
  specs = [];
  thumbs = [];
  fetchMock.mockClear();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('playlistPlugin loading', () => {
  it('intercepts playlist input and loads the first item with its metadata', async () => {
    const { player, fp } = await setup();
    expect(fp.loads.map((l) => l.url)).toEqual(['one.mp4']);
    expect(player.state.title).toBe('One');
    expect(player.state.poster).toBe('one.jpg');
    expect(specs[0]!.subtitles).toEqual([{ label: 'En', url: 'one.vtt' }]);
    expect(thumbs).toEqual(['one-thumbs.vtt']);
    expect(player.state.playlist!.flat).toHaveLength(3);
    expect(player.api('playlist')).toEqual(ITEMS);
  });

  it('loads a playlist url and honours plstart', async () => {
    const { fp } = await setup({ source: 'https://a.com/pl.json', plstart: 'b' });
    expect(fetchMock).toHaveBeenCalledWith('https://a.com/pl.json');
    expect(fp.loads.map((l) => l.url)).toEqual(['two.mp4']);
  });

  it('reports a broken playlist url without crashing', async () => {
    const errors: string[] = [];
    const { player } = createTestPlayer({ plugins: [playlistPlugin({ fetch: fetchMock as unknown as typeof fetch })] });
    player.on('loaderror', ({ url }) => errors.push(url));
    player.load('https://a.com/missing.json');
    await flush();
    expect(errors).toEqual(['https://a.com/missing.json']);
    expect(player.state.playlist).toBeUndefined();
  });
});

describe('playlistPlugin navigation', () => {
  it('next/prev/playItem with play-after-load and events', async () => {
    const { player, fp, media } = await setup();
    const events: string[] = [];
    player.on('next', () => events.push('next'));
    player.on('previous', () => events.push('previous'));
    player.command('next');
    await flush();
    expect(fp.loads[fp.loads.length - 1]!.url).toBe('two.mp4');
    expect(media.play).toHaveBeenCalledTimes(1);
    player.command('prev');
    await flush();
    expect(fp.loads[fp.loads.length - 1]!.url).toBe('one.mp4');
    player.api('find', 'c');
    await flush();
    expect(fp.loads[fp.loads.length - 1]!.url).toBe('three.mp4');
    expect(media.play).toHaveBeenCalledTimes(2);
    expect(events).toEqual(['next', 'previous']);
  });

  it('autonext on end, stops at the last item, wraps with playlistLoop', async () => {
    const { player, fp, media } = await setup();
    player.command('playItem', 2, false);
    await flush();
    media.end();
    await flush();
    expect(fp.loads[fp.loads.length - 1]!.url).toBe('three.mp4');
    player.command('setPlaylistLoop', true);
    media.end();
    await flush();
    expect(fp.loads[fp.loads.length - 1]!.url).toBe('one.mp4');
    player.command('setAutonext', false);
    media.end();
    await flush();
    expect(fp.loads[fp.loads.length - 1]!.url).toBe('one.mp4');
  });

  it("start: 'continue' keeps the current position", async () => {
    const { player, fp, media } = await setup();
    media.timeTo(42);
    player.command('playItem', 'c', false);
    await flush();
    expect(fp.loads[fp.loads.length - 1]).toEqual({ url: 'three.mp4', start: 42 });
  });

  it("api('play', playlist) loads the playlist and plays its first item", async () => {
    const { player, fp, media } = createTestPlayer({ plugins: [spy, playlistPlugin({ fetch: fetchMock as unknown as typeof fetch })] });
    player.api('play', JSON_ITEMS);
    await flush();
    expect(fp.loads.map((l) => l.url)).toEqual(['one.mp4']);
    expect(media.play).toHaveBeenCalledTimes(1);
  });

  it('a direct load wins over a playlist that is still loading', async () => {
    const { player, fp } = createTestPlayer({ plugins: [playlistPlugin({ fetch: fetchMock as unknown as typeof fetch })] });
    player.load('https://a.com/pl.json');
    player.load('direct.mp4');
    await flush();
    expect(fp.loads.map((l) => l.url)).toEqual(['direct.mp4']);
  });

  it('push appends and setPlaylist replaces', async () => {
    const { player, fp } = await setup();
    player.command('push', [{ title: 'Four', file: 'four.mp4' }]);
    expect(player.state.playlist!.flat).toHaveLength(4);
    expect(player.state.playlist!.index).toBe(0);
    player.command('setPlaylist', [{ title: 'Solo', file: 'solo.mp4' }]);
    await flush();
    expect(player.state.playlist!.flat).toHaveLength(1);
    expect(fp.loads[fp.loads.length - 1]!.url).toBe('solo.mp4');
  });
});

describe('playlistPlugin UI', () => {
  it('renders prev/next/playlist-button with hide rules', async () => {
    const { player, host } = await setup();
    const prev = host.querySelector('.vp-prev')!;
    const next = host.querySelector('.vp-next')!;
    expect(prev.classList.contains('vp-hidden')).toBe(true);
    expect(next.classList.contains('vp-hidden')).toBe(false);
    expect(host.querySelector('.vp-playlist-button')!.classList.contains('vp-hidden')).toBe(false);
    player.command('playItem', 2, false);
    await flush();
    expect(prev.classList.contains('vp-hidden')).toBe(false);
    expect(next.classList.contains('vp-hidden')).toBe(true);
  });

  it('opens the panel with folders and plays a clicked item', async () => {
    const { player, host, fp, media } = await setup();
    const panel = host.querySelector('.vp-playlist')!;
    expect(panel.classList.contains('vp-hidden')).toBe(true);
    host.querySelector<HTMLButtonElement>('.vp-playlist-button')!.click();
    expect(panel.classList.contains('vp-hidden')).toBe(false);
    expect(panel.querySelector('details summary')!.textContent).toBe('Folder');
    const buttons = [...panel.querySelectorAll<HTMLButtonElement>('.vp-playlist-item')];
    expect(buttons.map((b) => b.textContent)).toEqual(['One', 'Two', 'Three']);
    expect(buttons[0]!.classList.contains('vp-active')).toBe(true);
    buttons[1]!.click();
    await flush();
    expect(fp.loads[fp.loads.length - 1]!.url).toBe('two.mp4');
    expect(media.play).toHaveBeenCalled();
    expect(player.state.playlist!.open).toBe(false);
  });

  it('starts open when hidePlaylist is false', async () => {
    const { player } = await setup({ hidePlaylist: false });
    expect(player.state.playlist!.open).toBe(true);
  });
});

describe('playlistPlugin review fixes', () => {
  const posKey = (file: string) => `vp:t:h${fnv1a(`${location.pathname}#p#${file}`)}`;

  beforeEach(() => localStorage.clear());

  it('autonext runs after other end handlers (memory forgets the finished item, not the next one)', async () => {
    const pre = createTestPlayer({
      source: JSON.stringify([{ file: 'a.mp4' }, { file: 'b.mp4' }]),
      plugins: [playlistPlugin({ fetch: fetchMock as unknown as typeof fetch }), memoryPlugin()],
    });
    const { fp, media } = pre;
    await flush();
    // a saved position for item 1
    localStorage.setItem(posKey('b.mp4'), JSON.stringify({ t: 30, d: 100 }));
    localStorage.setItem('vp:t:index', JSON.stringify([posKey('b.mp4')]));
    media.timeTo(20);
    expect(localStorage.getItem(posKey('a.mp4'))).not.toBeNull();
    media.end();
    await flush();
    expect(fp.loads[fp.loads.length - 1]!.url).toBe('b.mp4');
    expect(localStorage.getItem(posKey('a.mp4'))).toBeNull();
    expect(localStorage.getItem(posKey('b.mp4'))).not.toBeNull();
    expect(JSON.parse(localStorage.getItem('vp:t:index')!)).toEqual([posKey('b.mp4')]);
  });

  it('autonext is dropped when something else loads before the deferred step', async () => {
    const { player, fp, media } = await setup();
    media.end();
    player.load('direct.mp4');
    await flush();
    expect(fp.loads.map((l) => l.url)).toEqual(['one.mp4', 'direct.mp4']);
  });

  it('a direct load drops the stale playlist', async () => {
    const { player, fp, media, host } = await setup();
    player.load('direct.mp4');
    await flush();
    expect(player.state.playlist).toBeUndefined();
    expect(host.querySelector('.vp-prev')!.classList.contains('vp-hidden')).toBe(true);
    expect(host.querySelector('.vp-next')!.classList.contains('vp-hidden')).toBe(true);
    expect(host.querySelector('.vp-playlist-button')!.classList.contains('vp-hidden')).toBe(true);
    media.end();
    await flush();
    expect(fp.loads.map((l) => l.url)).toEqual(['one.mp4', 'direct.mp4']);
  });

  it('push without a playlist loads item 0 only when idle', async () => {
    const idle = createTestPlayer({ plugins: [playlistPlugin({ fetch: fetchMock as unknown as typeof fetch })] });
    idle.player.command('push', [{ title: 'A', file: 'a.mp4' }]);
    await flush();
    expect(idle.fp.loads.map((l) => l.url)).toEqual(['a.mp4']);
    expect(idle.player.state.playlist!.index).toBe(0);

    const busy = createTestPlayer({ source: 'direct.mp4', plugins: [playlistPlugin({ fetch: fetchMock as unknown as typeof fetch })] });
    await flush();
    busy.player.command('push', [{ title: 'A', file: 'a.mp4' }]);
    await flush();
    expect(busy.fp.loads.map((l) => l.url)).toEqual(['direct.mp4']);
    expect(busy.player.state.playlist!.flat).toHaveLength(1);
    expect(busy.player.state.playlist!.index).toBe(-1);
  });

  it('push supersedes an in-flight setPlaylist', async () => {
    const { player, fp } = createTestPlayer({ plugins: [playlistPlugin({ fetch: fetchMock as unknown as typeof fetch })] });
    player.command('setPlaylist', 'https://a.com/pl.json');
    player.command('push', [{ title: 'Late', file: 'late.mp4' }]);
    await flush();
    expect(fp.loads.map((l) => l.url)).toEqual(['late.mp4']);
    expect(player.state.playlist!.flat).toHaveLength(1);
  });

  it('wires aria-controls to the panel id', async () => {
    const { player, host } = await setup();
    const panel = host.querySelector('.vp-playlist')!;
    expect(panel.id).toBe(`${player.id}_playlist`);
    expect(host.querySelector('.vp-playlist-button')!.getAttribute('aria-controls')).toBe(panel.id);
  });

  it('focuses the active item on open and returns focus to the button on Escape', async () => {
    const { player, host } = await setup();
    const button = host.querySelector<HTMLButtonElement>('.vp-playlist-button')!;
    button.focus();
    button.click();
    await flush();
    const active = host.querySelector<HTMLElement>('.vp-playlist-item.vp-active')!;
    expect(document.activeElement).toBe(active);
    active.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(player.state.playlist!.open).toBe(false);
    expect(document.activeElement).toBe(button);
  });

  it('does not steal focus when opened from outside the player', async () => {
    const { player, host } = await setup();
    (document.activeElement as HTMLElement | null)?.blur();
    player.command('togglePlaylist');
    await flush();
    expect(host.contains(document.activeElement) && document.activeElement !== host).toBe(false);
  });

  it('hides prev/next with a single item even when looping', async () => {
    const { host } = await setup({ source: JSON.stringify([{ file: 'solo.mp4' }]), playlistLoop: true });
    expect(host.querySelector('.vp-prev')!.classList.contains('vp-hidden')).toBe(true);
    expect(host.querySelector('.vp-next')!.classList.contains('vp-hidden')).toBe(true);
  });

  it('dispose cancels pending loads and play-after-load', async () => {
    const a = await setup();
    a.player.command('next');
    const loadsBefore = a.fp.loads.length;
    a.player.destroy();
    a.media.fire('loadedmetadata');
    await flush();
    expect(a.media.play).not.toHaveBeenCalled();
    expect(a.fp.loads).toHaveLength(loadsBefore);

    const b = createTestPlayer({ plugins: [playlistPlugin({ fetch: fetchMock as unknown as typeof fetch })] });
    b.player.command('setPlaylist', 'https://a.com/pl.json');
    b.player.destroy();
    await flush();
    expect(b.fp.loads).toHaveLength(0);
  });
});
