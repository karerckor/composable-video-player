import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mediaSessionPlugin } from '../../src/plugins/mediasession.js';
import { createTestPlayer } from '../helpers/player-harness.js';
import { flush } from '../helpers/flush.js';
import type { Player, PluginContext, Plugin } from '../../src/types.js';

const created: Player[] = [];
function make(opts: Parameters<typeof createTestPlayer>[0]) {
  const result = createTestPlayer(opts);
  created.push(result.player);
  return result;
}

let handlers: Record<string, ((details?: { seekTime?: number }) => void) | null>;
let session: { metadata: unknown; playbackState: string; setActionHandler: (name: string, fn: ((d?: { seekTime?: number }) => void) | null) => void };

beforeEach(() => {
  handlers = {};
  session = {
    metadata: null,
    playbackState: 'none',
    setActionHandler: (name, fn) => {
      handlers[name] = fn;
    },
  };
  Object.defineProperty(navigator, 'mediaSession', { configurable: true, value: session });
  vi.stubGlobal(
    'MediaMetadata',
    class {
      constructor(public init: unknown) {}
    },
  );
});
afterEach(() => {
  created.splice(0).forEach((p) => p.destroy());
  delete (navigator as unknown as { mediaSession?: unknown }).mediaSession;
  vi.unstubAllGlobals();
});

describe('mediaSessionPlugin', () => {
  it('publishes metadata and playback state', async () => {
    const { player } = make({ plugins: [mediaSessionPlugin()], title: 'Hello', poster: 'p.jpg', source: 'a.mp4' });
    await flush();
    expect((session.metadata as { init: unknown }).init).toEqual({ title: 'Hello', artwork: [{ src: 'p.jpg' }] });
    await player.play();
    expect(session.playbackState).toBe('playing');
    player.pause();
    expect(session.playbackState).toBe('paused');
  });

  it('routes action handlers to commands and clears them on destroy', async () => {
    const { player, media } = make({ plugins: [mediaSessionPlugin()], source: 'a.mp4' });
    await flush();
    media.setDuration(100);
    handlers.play!();
    await flush();
    expect(player.state.status).toBe('playing');
    handlers.seekto!({ seekTime: 30 });
    expect(player.video.currentTime).toBe(30);
    handlers.seekforward!();
    expect(player.video.currentTime).toBe(40);
    handlers.pause!();
    expect(player.state.status).toBe('paused');
    expect(handlers.nexttrack).toBeNull();
    player.destroy();
    expect(handlers.play).toBeNull();
  });

  it('does nothing without the API or when disabled', () => {
    delete (navigator as unknown as { mediaSession?: unknown }).mediaSession;
    expect(() => make({ plugins: [mediaSessionPlugin()] })).not.toThrow();
  });

  it('is disabled by mediasession: false', async () => {
    make({ plugins: [mediaSessionPlugin()], mediasession: false, source: 'a.mp4' });
    await flush();
    expect(handlers.play).toBeUndefined();
    expect(session.metadata).toBeNull();
  });

  it('keeps the previous playback state while buffering', async () => {
    let store!: PluginContext['store'];
    const grab: Plugin = { name: 'grab', setup: (ctx) => void (store = ctx.store) };
    const { player, media } = make({ plugins: [mediaSessionPlugin(), grab], source: 'a.mp4' });
    await flush();
    media.setDuration(100);
    await player.play();
    expect(session.playbackState).toBe('playing');
    store.set({ status: 'loading' });
    expect(player.state.status).toBe('loading');
    expect(session.playbackState).toBe('playing');
  });

  it('hands ownership to the player that plays last', async () => {
    const a = make({ plugins: [mediaSessionPlugin()], source: 'a.mp4' });
    await flush();
    const b = make({ plugins: [mediaSessionPlugin()], source: 'b.mp4' });
    await flush();
    a.media.setDuration(100);
    b.media.setDuration(100);
    handlers.play!();
    await flush();
    expect(a.player.state.status).toBe('playing');
    await b.player.play();
    expect(session.playbackState).toBe('playing');
    handlers.pause!();
    expect(b.player.state.status).toBe('paused');
    expect(a.player.state.status).toBe('playing');
    a.player.destroy();
    expect(handlers.play).not.toBeNull();
    b.player.destroy();
    expect(handlers.play).toBeNull();
    expect(session.metadata).toBeNull();
  });
});
