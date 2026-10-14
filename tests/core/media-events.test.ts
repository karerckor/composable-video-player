import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { bindMediaEvents } from '../../src/core/media-events';
import { createStore } from '../../src/core/store';
import { createEventBus } from '../../src/core/events';
import { createCommandRegistry } from '../../src/core/commands';
import { createLogger } from '../../src/core/logger';
import { createInitialState } from '../../src/core/initial-state';
import { installFakeMedia, type FakeMedia } from '../helpers/fake-media';
import type { MediaDeps } from '../../src/core/media-deps';
import type { EventName, PlayerError } from '../../src/types';

let deps: MediaDeps;
let media: FakeMedia;
let onError: Mock<(err: PlayerError) => void>;
let emitted: Array<[EventName, unknown]>;

function setup(extra: Partial<MediaDeps['options']> = {}) {
  const video = document.createElement('video');
  media = installFakeMedia(video);
  const log = createLogger(false);
  deps = {
    video,
    root: document.createElement('div'),
    store: createStore(createInitialState({ container: 'x', ...extra })),
    events: createEventBus(log),
    commands: createCommandRegistry(log),
    log,
    options: { container: 'x', ...extra },
    providers: [],
    transforms: [],
  };
  emitted = [];
  deps.events.onAny((n, d) => emitted.push([n, d]));
  onError = vi.fn();
  bindMediaEvents(deps, { onMediaError: onError });
}
const names = () => emitted.map(([n]) => n);

describe('bindMediaEvents', () => {
  beforeEach(() => setup());

  it('tracks play/playing/pause and start', async () => {
    await deps.video.play();
    expect(deps.store.get()).toMatchObject({ status: 'playing', started: true });
    expect(names()).toEqual(['play', 'start']);
    deps.video.pause();
    expect(deps.store.get().status).toBe('paused');
    expect(names()).toContain('pause');
  });

  it('emits start only once per load', async () => {
    await deps.video.play();
    deps.video.pause();
    await deps.video.play();
    expect(names().filter((n) => n === 'start')).toHaveLength(1);
  });

  it('tracks duration and live', () => {
    media.setDuration(120);
    expect(deps.store.get()).toMatchObject({ duration: 120, live: false });
    expect(emitted).toContainEqual(['duration', 120]);
    media.setDuration(Infinity);
    expect(deps.store.get()).toMatchObject({ duration: 0, live: true });
  });

  it('tracks buffering', () => {
    media.fire('waiting');
    expect(deps.store.get().waiting).toBe(true);
    media.fire('canplay');
    expect(deps.store.get().waiting).toBe(false);
    expect(names()).toEqual(['buffering', 'buffered']);
  });

  it('emits time and quartiles once', () => {
    media.setDuration(100);
    media.timeTo(26);
    media.timeTo(27);
    media.timeTo(80);
    expect(emitted.filter(([n]) => n === 'quartile').map(([, d]) => d)).toEqual([25, 50, 75]);
    expect(deps.store.get().currentTime).toBe(80);
    expect(emitted).toContainEqual(['time', 26]);
  });

  it('resets quartiles on new source', () => {
    media.setDuration(100);
    media.timeTo(30);
    deps.events.emit('new', { spec: { qualities: [], subtitles: [] }, selection: { quality: 0, audio: 0, start: 0 } });
    media.timeTo(30);
    expect(emitted.filter(([n]) => n === 'quartile')).toHaveLength(2);
  });

  it('handles ended', () => {
    media.end();
    expect(deps.store.get().status).toBe('ended');
    expect(names()).toEqual(['quartile', 'end', 'finish']);
  });

  it('emits seek on seeked', () => {
    deps.video.currentTime = 42;
    expect(emitted).toContainEqual(['seek', 42]);
  });

  it('tracks volume, mute and rate', () => {
    deps.video.volume = 0.5;
    deps.video.muted = true;
    deps.video.playbackRate = 2;
    expect(deps.store.get()).toMatchObject({ volume: 0.5, muted: true, rate: 2 });
    expect(emitted).toContainEqual(['volume', 0.5]);
    expect(names()).toContain('mute');
    expect(emitted).toContainEqual(['speed', 2]);
  });

  it('tracks buffered end', () => {
    media.setBuffered(30);
    expect(deps.store.get().buffered).toBe(30);
  });

  it('forwards media errors', () => {
    media.setError(2);
    expect(onError).toHaveBeenCalledWith({ kind: 'network', message: 'fake' });
  });

  it('stops at the end option once, and re-arms after seeking back', async () => {
    setup({ end: -10 });
    media.setDuration(100);
    await deps.video.play();
    media.timeTo(91);
    expect(deps.store.get().status).toBe('ended');
    expect(names().filter((n) => n === 'end')).toHaveLength(1);
    expect(media.pause).toHaveBeenCalledTimes(1);
    await deps.video.play();
    media.timeTo(92);
    expect(names().filter((n) => n === 'end')).toHaveLength(1);
    deps.video.pause();
    expect(deps.store.get().status).toBe('paused');
    deps.video.currentTime = 10;
    await deps.video.play();
    media.timeTo(95);
    expect(names().filter((n) => n === 'end')).toHaveLength(2);
  });

  it('does not emit speed when the rate did not change', () => {
    deps.video.playbackRate = 1;
    expect(names()).not.toContain('speed');
  });

  it('keeps the ended status when the media ends after the end option already fired', async () => {
    setup({ end: -10 });
    media.setDuration(100);
    await deps.video.play();
    media.timeTo(91);
    expect(names().filter((n) => n === 'end')).toHaveLength(1);
    await deps.video.play();
    media.end();
    expect(deps.store.get().status).toBe('ended');
    expect(names().filter((n) => n === 'end')).toHaveLength(1);
  });

  it('ignores pause while loading', async () => {
    await deps.video.play();
    emitted.length = 0;
    deps.store.set({ status: 'loading' });
    deps.video.pause();
    expect(deps.store.get().status).toBe('loading');
    expect(names()).not.toContain('pause');
  });
});
