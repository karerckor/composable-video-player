import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMediaController } from '../../src/core/media-controller';
import { createStore } from '../../src/core/store';
import { createEventBus } from '../../src/core/events';
import { createCommandRegistry } from '../../src/core/commands';
import { createLogger } from '../../src/core/logger';
import { createInitialState } from '../../src/core/initial-state';
import { installFakeMedia, type FakeMedia } from '../helpers/fake-media';
import { fakeProvider } from '../helpers/fake-provider';
import { flush } from '../helpers/flush';
import type { MediaDeps } from '../../src/core/media-deps';
import type { EventName, PlayerOptions } from '../../src/types';

let d: MediaDeps;
let media: FakeMedia;
let emitted: Array<[EventName, unknown]>;

function setup(options: Partial<PlayerOptions> = {}, providers = [fakeProvider()]) {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const video = document.createElement('video');
  media = installFakeMedia(video);
  const log = createLogger(false);
  const opts = { container: 'x', ...options };
  d = {
    video,
    root: document.createElement('div'),
    store: createStore(createInitialState(opts)),
    events: createEventBus(log),
    commands: createCommandRegistry(log),
    log,
    options: opts,
    providers: providers.map((p) => p.provider),
    transforms: [],
  };
  emitted = [];
  d.events.onAny((n, data) => emitted.push([n, data]));
  const controller = createMediaController(d);
  return { controller, providers };
}
const names = () => emitted.map(([n]) => n);

afterEach(() => vi.useRealTimers());

describe('MediaController load', () => {
  it('loads the highest quality and emits new then metadata', async () => {
    const { providers: [p] } = setup();
    d.commands.run('load', ['[360p]a360.mp4,[720p]a720.mp4']);
    expect(d.store.get()).toMatchObject({ status: 'loading', quality: 1, url: 'a720.mp4' });
    expect(d.store.get().qualities.map((q) => q.label)).toEqual(['360p', '720p']);
    await flush();
    expect(p!.loads).toEqual([{ url: 'a720.mp4', start: 0 }]);
    expect(d.store.get().status).toBe('ready');
    expect(names().indexOf('new')).toBeLessThan(names().indexOf('metadata'));
  });

  it('applies source transforms in order and clamps the result', async () => {
    const { providers: [p] } = setup();
    d.transforms.push((_spec, sel) => ({ ...sel, quality: 0, start: 12 }));
    d.transforms.push((_spec, sel) => ({ ...sel, audio: 99 }));
    d.commands.run('load', ['[360p]a.mp4,[720p]b.mp4']);
    await flush();
    expect(p!.loads[0]).toEqual({ url: 'a.mp4', start: 12 });
    expect(d.store.get().audioTrack).toBe(0);
  });

  it('uses options.start and spec start', async () => {
    const { providers: [p] } = setup({ start: 5 });
    d.commands.run('load', ['a.mp4']);
    await flush();
    expect(p!.loads[0]!.start).toBe(5);
    d.commands.run('load', ['b.mp4[seek:9]']);
    await flush();
    expect(p!.loads[1]!.start).toBe(9);
  });

  it('falls back along the or-chain', async () => {
    const { providers: [p] } = setup({}, [fakeProvider({ fail: (u) => (u === 'a.m3u8' ? { kind: 'network', message: 'x' } : null) })]);
    d.commands.run('load', ['a.m3u8 or a.mp4']);
    await flush();
    expect(p!.loads.map((l) => l.url)).toEqual(['a.m3u8', 'a.mp4']);
    expect(emitted).toContainEqual(['loaderror', { url: 'a.m3u8', error: { kind: 'network', message: 'x' } }]);
    expect(d.store.get()).toMatchObject({ status: 'ready', url: 'a.mp4' });
  });

  it('enters error state when the chain is exhausted', async () => {
    setup({}, [fakeProvider({ fail: () => ({ kind: 'decode', message: 'bad' }) })]);
    d.commands.run('load', ['a.mp4 or b.mp4']);
    await flush();
    expect(d.store.get()).toMatchObject({ status: 'error', error: { kind: 'decode', message: 'bad' } });
    expect(names()).toContain('error');
  });

  it('retries the last url with the reload option', async () => {
    vi.useFakeTimers();
    let attempts = 0;
    setup({ reload: { retries: 2, delay: 1000 } }, [
      fakeProvider({ fail: () => (++attempts < 3 ? { kind: 'network', message: 'x' } : null) }),
    ]);
    d.commands.run('load', ['a.mp4']);
    await flush();
    expect(attempts).toBe(1);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(attempts).toBe(3);
    expect(d.store.get().status).toBe('ready');
  });

  it('chooses the provider with the highest canPlay score', async () => {
    const low = fakeProvider({ name: 'low', canPlay: () => 1 });
    const high = fakeProvider({ name: 'high', canPlay: (u) => (u.endsWith('.m3u8') ? 2 : 0) });
    setup({}, [low, high]);
    d.commands.run('load', ['a.m3u8']);
    await flush();
    expect(high.loads).toHaveLength(1);
    d.commands.run('load', ['a.mp4']);
    await flush();
    expect(low.loads).toHaveLength(1);
    expect(high.provider.detach).toHaveBeenCalled();
  });

  it('reports unsupported when no provider can play', async () => {
    setup({}, [fakeProvider({ canPlay: () => 0 })]);
    d.commands.run('load', ['a.xyz']);
    await flush();
    expect(d.store.get().error?.kind).toBe('unsupported');
  });

  it('rejects playlist input without the playlist plugin', () => {
    setup();
    d.commands.run('load', ['[{"title":"a","file":"a.mp4"}]']);
    expect(d.store.get()).toMatchObject({ status: 'error', error: { kind: 'unsupported' } });
    expect(names()).toContain('loaderror');
  });

  it('ignores a stale load that resolves after a newer one', async () => {
    let resolveFirst!: () => void;
    const p = fakeProvider({ load: (url) => (url === 'first.mp4' ? new Promise<void>((r) => (resolveFirst = r)) : Promise.resolve()) });
    setup({}, [p]);
    d.commands.run('load', ['first.mp4']);
    d.commands.run('load', ['second.mp4']);
    await flush();
    resolveFirst();
    await flush();
    expect(names().filter((n) => n === 'metadata')).toHaveLength(1);
    expect(d.store.get().url).toBe('second.mp4');
  });

  it('accepts a SourceSpecInput object', async () => {
    const { providers: [p] } = setup();
    d.commands.run('load', [{ qualities: [{ label: '', tracks: [{ label: '', urls: ['x.mp4'] }] }], start: 3 }]);
    await flush();
    expect(p!.loads[0]).toEqual({ url: 'x.mp4', start: 3 });
  });

  it('reload restarts the last input at the current position', async () => {
    const { providers: [p] } = setup();
    d.transforms.push((_s, sel) => ({ ...sel, start: 99 }));
    d.commands.run('load', ['a.mp4']);
    await flush();
    d.video.currentTime = 42;
    d.commands.run('reload', []);
    await flush();
    expect(p!.loads[p!.loads.length - 1]).toEqual({ url: 'a.mp4', start: 42 });
  });
});

describe('MediaController attempts and retries', () => {
  it('ignores a duplicate failure report for the same attempt', async () => {
    const fp: ReturnType<typeof fakeProvider> = fakeProvider({
      load: async (url) => {
        if (url === 'a.mp4') {
          const error = { kind: 'network' as const, message: 'x' };
          fp.ctx.error(error);
          throw error;
        }
      },
    });
    setup({}, [fp]);
    d.commands.run('load', ['a.mp4 or b.mp4 or c.mp4']);
    await flush();
    expect(fp.loads.map((l) => l.url)).toEqual(['a.mp4', 'b.mp4']);
  });

  it('ignores a superseded attempt that resolves late', async () => {
    let resolveA!: () => void;
    const fp: ReturnType<typeof fakeProvider> = fakeProvider({
      load: (url) =>
        new Promise<void>((resolve) => {
          if (url === 'a.mp4') {
            resolveA = resolve;
            fp.ctx.error({ kind: 'network', message: 'x' });
          }
        }),
    });
    setup({}, [fp]);
    d.commands.run('load', ['a.mp4 or b.mp4']);
    await flush();
    expect(fp.loads.map((l) => l.url)).toEqual(['a.mp4', 'b.mp4']);
    resolveA();
    await flush();
    expect(d.store.get().status).toBe('loading');
    expect(names()).not.toContain('metadata');
  });

  it('restores the retry budget after a successful load', async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const fp = fakeProvider({ fail: () => (++attempts === 1 ? { kind: 'network', message: 'x' } : null) });
    setup({ reload: { retries: 1, delay: 100 } }, [fp]);
    d.commands.run('load', ['a.mp4']);
    await flush();
    await vi.advanceTimersByTimeAsync(100);
    expect(attempts).toBe(2);
    expect(d.store.get().status).toBe('ready');
    media.setError(3);
    await vi.advanceTimersByTimeAsync(100);
    expect(attempts).toBe(3);
    expect(d.store.get().status).toBe('ready');
  });
});

describe('MediaController switching', () => {
  it('switches file-based quality keeping position, playback and audio label', async () => {
    const { providers: [p] } = setup();
    d.commands.run('load', ['[360p]{En}a360en.mp4;{Ru}a360ru.mp4,[720p]{En}a720en.mp4;{Ru}a720ru.mp4']);
    await flush();
    d.commands.run('setAudioTrack', [1]);
    await flush();
    expect(p!.loads[p!.loads.length - 1]!.url).toBe('a720ru.mp4');
    await d.video.play();
    d.video.currentTime = 30;
    d.commands.run('setQuality', [0]);
    await flush();
    expect(p!.loads[p!.loads.length - 1]).toEqual({ url: 'a360ru.mp4', start: 30 });
    expect(d.store.get()).toMatchObject({ quality: 0, audioTrack: 1 });
    expect(emitted).toContainEqual(['quality', '360p']);
    expect(emitted).toContainEqual(['audiotrack', 'Ru']);
    expect(media.play).toHaveBeenCalledTimes(2);
  });

  it('delegates to the provider when it owns the quality list', async () => {
    const { providers: [p] } = setup();
    d.commands.run('load', ['a.m3u8']);
    await flush();
    p!.ctx.setQualities([{ label: 'Авто' }, { label: '360p' }, { label: '720p' }], 0);
    expect(d.store.get().qualities).toHaveLength(3);
    d.commands.run('setQuality', [2]);
    expect(p!.provider.setQuality).toHaveBeenCalledWith(2);
    expect(p!.loads).toHaveLength(1);
    expect(d.store.get().quality).toBe(2);
  });

  it('ignores provider quality lists when the spec has several file qualities', async () => {
    const { providers: [p] } = setup();
    d.commands.run('load', ['[a]a.m3u8,[b]b.m3u8']);
    await flush();
    p!.ctx.setQualities([{ label: 'x' }, { label: 'y' }, { label: 'z' }], 0);
    expect(d.store.get().qualities.map((q) => q.label)).toEqual(['a', 'b']);
  });

  it('ignores out-of-range and current indexes', async () => {
    const { providers: [p] } = setup();
    d.commands.run('load', ['[a]a.mp4,[b]b.mp4']);
    await flush();
    d.commands.run('setQuality', [1]);
    d.commands.run('setQuality', [7]);
    expect(p!.loads).toHaveLength(1);
  });

  it('falls back on media errors after load and ignores them while loading', async () => {
    const { providers: [p] } = setup();
    d.commands.run('load', ['a.mp4 or b.mp4']);
    media.setError(3);
    await flush();
    expect(p!.loads).toHaveLength(1);
    media.setError(3);
    await flush();
    expect(p!.loads.map((l) => l.url)).toEqual(['a.mp4', 'b.mp4']);
  });

  it('destroy detaches the provider and unregisters commands', async () => {
    const { controller, providers: [p] } = setup();
    d.commands.run('load', ['a.mp4']);
    await flush();
    controller.destroy();
    expect(p!.provider.detach).toHaveBeenCalled();
    expect(d.commands.has('load')).toBe(false);
    expect(d.commands.has('play')).toBe(false);
  });

  it('recovers from a fatal error when switching quality', async () => {
    let broken = true;
    const fp = fakeProvider({ fail: () => (broken ? { kind: 'network', message: 'x' } : null) });
    setup({}, [fp]);
    d.commands.run('load', ['[a]a.mp4,[b]b.mp4']);
    await flush();
    expect(d.store.get().status).toBe('error');
    broken = false;
    d.commands.run('setQuality', [0]);
    await flush();
    expect(d.store.get()).toMatchObject({ status: 'ready', error: null, quality: 0 });
  });

  it('does not emit pause when switching quality during playback', async () => {
    let firePause = false;
    const fp = fakeProvider({
      load: async () => {
        if (firePause) media.fire('pause');
      },
    });
    setup({}, [fp]);
    d.commands.run('load', ['[a]a.mp4,[b]b.mp4']);
    await flush();
    await d.video.play();
    expect(d.store.get().status).toBe('playing');
    emitted.length = 0;
    firePause = true;
    d.commands.run('setQuality', [0]);
    await flush();
    expect(names()).not.toContain('pause');
    expect(d.store.get().status).toBe('playing');
  });

  it('keeps the intended start when switching before metadata', async () => {
    const { providers: [p] } = setup({}, [fakeProvider({ load: async () => {} })]);
    d.commands.run('load', ['[a]a.mp4,[b]b.mp4[seek:30]']);
    d.commands.run('setQuality', [0]);
    await flush();
    expect(p!.loads.map((l) => l.start)).toEqual([30, 30]);
  });
});
