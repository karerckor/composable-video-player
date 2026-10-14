import { beforeEach, describe, expect, it, vi } from 'vitest';
import { autoplayPlugin } from '../../src/plugins/autoplay';
import { createTestPlayer } from '../helpers/player-harness';
import { flush } from '../helpers/flush';
import type { Plugin, PlayerState, Store } from '../../src/types';

const notAllowed = () => new DOMException('autoplay blocked', 'NotAllowedError');

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('autoplayPlugin', () => {
  it('does nothing without the autoplay option', async () => {
    const { media } = createTestPlayer({ plugins: [autoplayPlugin()], source: 'a.mp4' });
    await flush();
    expect(media.play).not.toHaveBeenCalled();
  });

  it('plays the first source after metadata, and not later loads', async () => {
    const { player, media } = createTestPlayer({ plugins: [autoplayPlugin()], autoplay: true, source: '[a]a.mp4,[b]b.mp4' });
    await flush();
    expect(media.play).toHaveBeenCalledTimes(1);
    expect(player.state.status).toBe('playing');
    player.command('setQuality', 0);
    await flush();
    expect(media.play).toHaveBeenCalledTimes(2); // resume after switch (core), not autoplay
    player.pause();
    player.api('file', 'c.mp4');
    await flush();
    expect(media.play).toHaveBeenCalledTimes(2);
  });

  it('falls back to muted autoplay and unmutes on the first user toggle', async () => {
    const { player, media, host } = createTestPlayer({ plugins: [autoplayPlugin()], autoplay: true });
    media.rejectNextPlay(notAllowed());
    player.load('a.mp4');
    await flush();
    expect(player.state.muted).toBe(true);
    expect(player.state.status).toBe('playing');
    host.querySelector<HTMLElement>('.vp-click-layer')!.click();
    expect(player.state.muted).toBe(false);
    expect(player.state.status).toBe('playing');
    host.querySelector<HTMLElement>('.vp-click-layer')!.click();
    expect(player.state.status).toBe('paused');
  });

  it('does not mute when the fallback is disabled', async () => {
    const { player, media } = createTestPlayer({ plugins: [autoplayPlugin({ muteFallback: false })], autoplay: true });
    media.rejectNextPlay(notAllowed());
    player.load('a.mp4');
    await flush();
    expect(player.state.muted).toBe(false);
    expect(console.warn).toHaveBeenCalled();
  });

  describe('toggle after muted autoplay', () => {
    const muted = async (status?: 'loading' | 'paused') => {
      let store!: Store<PlayerState>;
      const grab: Plugin = { name: 'grab', setup: (ctx) => void (store = ctx.store) };
      const t = createTestPlayer({ plugins: [grab, autoplayPlugin()], autoplay: true });
      t.media.rejectNextPlay(notAllowed());
      t.player.load('a.mp4');
      await flush();
      expect(t.player.state.muted).toBe(true);
      if (status === 'loading') store.set({ status: 'loading' });
      if (status === 'paused') t.player.pause();
      return t;
    };

    it('unmutes instead of toggling while loading', async () => {
      const { player, host } = await muted('loading');
      host.querySelector<HTMLElement>('.vp-click-layer')!.click();
      expect(player.state.muted).toBe(false);
      expect(player.state.status).toBe('loading');
    });

    it('lets the toggle run when the player is already paused', async () => {
      const { player, host } = await muted('paused');
      expect(player.state.status).toBe('paused');
      host.querySelector<HTMLElement>('.vp-click-layer')!.click();
      expect(player.state.status).toBe('playing');
      expect(player.state.muted).toBe(true);
      host.querySelector<HTMLElement>('.vp-click-layer')!.click(); // flag was cleared: plain toggle
      expect(player.state.status).toBe('paused');
      expect(player.state.muted).toBe(true);
    });
  });
});
