import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultPlugins } from '../../src/plugins';
import { createPlayer } from '../../src/create-player';
import { createPlayerCore } from '../../src/player';
import * as vp from '../../src/index';
import { createTestPlayer } from '../helpers/player-harness';
import { flush } from '../helpers/flush';

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('defaultPlugins', () => {
  it('returns all v1 plugins in dependency order', () => {
    expect(defaultPlugins().map((p) => p.name)).toEqual([
      'quality', 'speed', 'audiotracks', 'subtitles', 'thumbnails', 'playlist', 'hotkeys', 'memory', 'autoplay', 'mediasession',
    ]);
  });

  it('is the default for createPlayer', () => {
    document.body.replaceChildren();
    const host = document.body.appendChild(document.createElement('div'));
    const player = createPlayer({ container: host });
    expect(host.querySelector('.vp-subtitles')).not.toBeNull();
    expect(host.querySelector('.vp-thumb')).not.toBeNull();
    expect(host.querySelector('.vp-playlist')).not.toBeNull();
    player.destroy();
  });

  it('createPlayerCore has no plugins unless given', () => {
    document.body.replaceChildren();
    const host = document.body.appendChild(document.createElement('div'));
    const player = createPlayerCore({ container: host });
    expect(host.querySelector('.vp-playlist')).toBeNull();
    player.destroy();
    expect(typeof vp.createPlayerCore).toBe('function');
  });

  it('works together end to end', async () => {
    const { player, host, fp } = createTestPlayer({ plugins: defaultPlugins(), source: '[360p]a.mp4,[720p]b.mp4', speeds: [1, 2] });
    await flush();
    expect(fp.loads[0]!.url).toBe('b.mp4');
    host.querySelector<HTMLButtonElement>('.vp-settings')!.click();
    const labels = [...host.querySelectorAll('.vp-menu-item .vp-menu-label')].map((e) => e.textContent);
    expect(labels).toEqual(['Качество', 'Скорость']);
    player.root.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyM', bubbles: true, cancelable: true }));
    expect(player.state.muted).toBe(true);
    expect(localStorage.getItem('vp:muted')).toBe('1');
  });

  it('exports plugin factories from the public entry', () => {
    expect(typeof vp.defaultPlugins).toBe('function');
    expect(typeof vp.playlistPlugin).toBe('function');
    expect(typeof vp.subtitlesPlugin).toBe('function');
  });
});
