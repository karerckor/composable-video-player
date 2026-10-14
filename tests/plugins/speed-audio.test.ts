import { describe, expect, it } from 'vitest';
import { speedPlugin } from '../../src/plugins/speed';
import { audioTracksPlugin } from '../../src/plugins/audiotracks';
import { createTestPlayer } from '../helpers/player-harness';
import { flush } from '../helpers/flush';
import type { Plugin } from '../../src/types';

const menuLabels = (host: HTMLElement) => [...host.querySelectorAll('.vp-menu-item .vp-menu-label')].map((e) => e.textContent);

describe('speedPlugin', () => {
  it('exposes speeds, a menu and setSpeedIndex', async () => {
    const { player, host } = createTestPlayer({ plugins: [speedPlugin({ speeds: [0.5, 1, 2] })] });
    expect(player.state.speeds).toEqual([0.5, 1, 2]);
    host.querySelector<HTMLButtonElement>('.vp-settings')!.click();
    expect(menuLabels(host)).toEqual(['0.5x', 'Обычная', '2x']);
    host.querySelectorAll<HTMLButtonElement>('.vp-menu-item')[2]!.click();
    expect(player.state.rate).toBe(2);
    player.api('speed', 0);
    expect(player.state.rate).toBe(0.5);
  });

  it('passes the command context through to setRate', () => {
    const sources: string[] = [];
    const spy: Plugin = {
      name: 'spy',
      setup: (ctx) => void ctx.commands.before('setRate', ((_a: unknown[], c: { source: string }) => void sources.push(c.source)) as never),
    };
    const { player } = createTestPlayer({ plugins: [spy, speedPlugin()] });
    player.api('speed', 1);
    expect(sources).toEqual(['api']);
  });

  it('applies defaultSpeed on init', () => {
    const { player } = createTestPlayer({ plugins: [speedPlugin()], defaultSpeed: 1.5 });
    expect(player.video.defaultPlaybackRate).toBe(1.5);
  });
});

describe('audioTracksPlugin', () => {
  const source = '[720p]{English}en.mp4;{Russian}ru.mp4';

  it('applies defaultAudio and renames labels in the menu', async () => {
    const { player, host, fp } = createTestPlayer({
      plugins: [audioTracksPlugin({ defaultAudio: 'Russian', renameAudio: { English: 'Английский', 1: 'Русский' } })],
      source,
    });
    await flush();
    expect(fp.loads[0]!.url).toBe('ru.mp4');
    host.querySelector<HTMLButtonElement>('.vp-settings')!.click();
    expect(menuLabels(host)).toEqual(['Английский', 'Русский']);
    host.querySelector<HTMLButtonElement>('.vp-menu-item')!.click();
    await flush();
    expect(player.state.audioTrack).toBe(0);
    expect(fp.loads[fp.loads.length - 1]!.url).toBe('en.mp4');
  });

  it('is hidden with a single track', async () => {
    const { host } = createTestPlayer({ plugins: [audioTracksPlugin()], source: 'a.mp4' });
    await flush();
    expect(host.querySelector('.vp-settings')!.classList.contains('vp-hidden')).toBe(true);
  });
});
