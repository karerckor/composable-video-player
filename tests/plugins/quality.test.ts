import { describe, expect, it } from 'vitest';
import { pickQuality, qualityPlugin } from '../../src/plugins/quality';
import { createTestPlayer } from '../helpers/player-harness';
import { flush } from '../helpers/flush';

describe('pickQuality', () => {
  const labels = ['360p', '720p', '1080p'];
  it('supports labels, num:X and max', () => {
    expect(pickQuality(labels, '720p')).toBe(1);
    expect(pickQuality(labels, 'num:0')).toBe(0);
    expect(pickQuality(labels, 'num:9')).toBeNull();
    expect(pickQuality(labels, 'max')).toBe(2);
    expect(pickQuality(labels, 'nope')).toBeNull();
    expect(pickQuality(labels, undefined)).toBeNull();
  });
});

describe('qualityPlugin', () => {
  it('applies defaultQuality as a source transform', async () => {
    const { fp } = createTestPlayer({ plugins: [qualityPlugin({ defaultQuality: '360p' })], source: '[360p]a.mp4,[720p]b.mp4' });
    await flush();
    expect(fp.loads[0]!.url).toBe('a.mp4');
  });

  it('reads defaultQuality from player options', async () => {
    const { fp } = createTestPlayer({ plugins: [qualityPlugin()], defaultQuality: 'num:0', source: '[360p]a.mp4,[720p]b.mp4' });
    await flush();
    expect(fp.loads[0]!.url).toBe('a.mp4');
  });

  it('shows a quality menu that switches quality and hides forbidden labels', async () => {
    const { player, host, fp } = createTestPlayer({
      plugins: [qualityPlugin({ forbiddenQuality: '1080p' })],
      source: '[360p]a.mp4,[720p]b.mp4,[1080p]c.mp4',
    });
    await flush();
    const settings = host.querySelector<HTMLButtonElement>('.vp-settings')!;
    expect(settings.classList.contains('vp-hidden')).toBe(false);
    settings.click();
    const labels = [...host.querySelectorAll('.vp-menu-item .vp-menu-label')].map((e) => e.textContent);
    expect(labels).toEqual(['360p', '720p']);
    host.querySelector<HTMLButtonElement>('.vp-menu-item')!.click();
    await flush();
    expect(player.state.quality).toBe(0);
    expect(fp.loads[fp.loads.length - 1]!.url).toBe('a.mp4');
  });

  it('translates the provider "auto" label', async () => {
    const { player, host, fp } = createTestPlayer({ plugins: [qualityPlugin()], source: 'a.m3u8' });
    await flush();
    fp.ctx.setQualities([{ label: 'auto' }, { label: '360p' }, { label: '720p' }], 0);
    host.querySelector<HTMLButtonElement>('.vp-settings')!.click();
    expect(host.querySelector('.vp-menu-item .vp-menu-label')!.textContent).toBe('Авто');
    expect(player.state.qualities).toHaveLength(3);
  });

  it('never starts on a forbidden quality', async () => {
    const { fp } = createTestPlayer({ plugins: [qualityPlugin({ forbiddenQuality: '1080p' })], source: '[360p]a.mp4,[720p]b.mp4,[1080p]c.mp4' });
    await flush();
    expect(fp.loads[0]!.url).toBe('b.mp4');
  });

  it('hides the menu with a single quality', async () => {
    const { host } = createTestPlayer({ plugins: [qualityPlugin()], source: 'a.mp4' });
    await flush();
    expect(host.querySelector('.vp-settings')!.classList.contains('vp-hidden')).toBe(true);
  });
});
