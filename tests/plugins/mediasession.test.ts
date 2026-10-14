import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mediaSessionPlugin } from '../../src/plugins/mediasession';
import { createTestPlayer } from '../helpers/player-harness';
import { flush } from '../helpers/flush';

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
  delete (navigator as unknown as { mediaSession?: unknown }).mediaSession;
  vi.unstubAllGlobals();
});

describe('mediaSessionPlugin', () => {
  it('publishes metadata and playback state', async () => {
    const { player } = createTestPlayer({ plugins: [mediaSessionPlugin()], title: 'Hello', poster: 'p.jpg', source: 'a.mp4' });
    await flush();
    expect((session.metadata as { init: unknown }).init).toEqual({ title: 'Hello', artwork: [{ src: 'p.jpg' }] });
    await player.play();
    expect(session.playbackState).toBe('playing');
    player.pause();
    expect(session.playbackState).toBe('paused');
  });

  it('routes action handlers to commands and clears them on destroy', async () => {
    const { player, media } = createTestPlayer({ plugins: [mediaSessionPlugin()], source: 'a.mp4' });
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
    expect(() => createTestPlayer({ plugins: [mediaSessionPlugin()] })).not.toThrow();
  });
});
