## Chunk 2: Media layer

Delivers: test fakes, initial state, `<video>` event → store/event mapping, media commands, fullscreen helpers, the `MediaController` (load pipeline, provider choice, `or`-fallback, retries, quality/audio switching) and the html5 provider.

Spec references: §3.2 (status table), §3.3 (who emits what), §3.4 (core commands, "play after load" rule), §4.2–4.4, §5.

### Task 2.1: Test helpers

**Files:**
- Create: `tests/helpers/flush.ts`, `tests/helpers/fake-media.ts`, `tests/helpers/fake-provider.ts`

`FakeMedia` overrides playback members on a real jsdom `<video>` (jsdom does not implement media playback) and dispatches the same events a browser would. `fakeProvider` is a scriptable `MediaProvider`.

- [ ] **Step 1: Create `tests/helpers/flush.ts`**

```ts
/** Drains pending microtasks (works with fake timers too). */
export async function flush(times = 10): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve();
}
```

- [ ] **Step 2: Create `tests/helpers/fake-media.ts`**

```ts
import { vi } from 'vitest';

export interface FakeMedia {
  fire(type: string): void;
  setDuration(d: number): void;
  /** Sets currentTime without seeking and fires timeupdate (normal playback progress). */
  timeTo(t: number): void;
  end(): void;
  setBuffered(end: number): void;
  rejectNextPlay(err: unknown): void;
  setError(code: number): void;
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
}

export function installFakeMedia(video: HTMLVideoElement): FakeMedia {
  let paused = true;
  let ended = false;
  let currentTime = 0;
  let duration = NaN;
  // Start from the element's current values (the player may have synced options onto it already).
  let volume = typeof video.volume === 'number' ? video.volume : 1;
  let muted = video.muted === true;
  let rate = video.playbackRate || 1;
  let defaultRate = video.defaultPlaybackRate || 1;
  let bufferedEnd = 0;
  let error: MediaError | null = null;
  let nextPlayError: unknown = null;

  const fire = (type: string) => video.dispatchEvent(new Event(type));
  const def = (name: string, get: () => unknown, set?: (v: any) => void) =>
    Object.defineProperty(video, name, { configurable: true, get, set });

  def('paused', () => paused);
  def('ended', () => ended);
  def('currentTime', () => currentTime, (v: number) => {
    currentTime = v;
    fire('seeking');
    fire('seeked');
    fire('timeupdate');
  });
  def('duration', () => duration);
  def('volume', () => volume, (v: number) => {
    volume = v;
    fire('volumechange');
  });
  def('muted', () => muted, (v: boolean) => {
    muted = !!v;
    fire('volumechange');
  });
  def('playbackRate', () => rate, (v: number) => {
    rate = v;
    fire('ratechange');
  });
  def('defaultPlaybackRate', () => defaultRate, (v: number) => {
    defaultRate = v;
  });
  def('buffered', () => ({ length: bufferedEnd > 0 ? 1 : 0, start: () => 0, end: () => bufferedEnd }));
  def('error', () => error);

  const play = vi.fn(() => {
    if (nextPlayError) {
      const e = nextPlayError;
      nextPlayError = null;
      return Promise.reject(e);
    }
    paused = false;
    ended = false;
    fire('play');
    fire('playing');
    return Promise.resolve();
  });
  const pause = vi.fn(() => {
    if (paused) return;
    paused = true;
    fire('pause');
  });
  video.play = play as unknown as HTMLVideoElement['play'];
  video.pause = pause as unknown as HTMLVideoElement['pause'];
  video.load = vi.fn() as unknown as HTMLVideoElement['load'];

  return {
    fire,
    setDuration(d) {
      duration = d;
      fire('durationchange');
    },
    timeTo(t) {
      currentTime = t;
      fire('timeupdate');
    },
    end() {
      paused = true;
      ended = true;
      fire('pause');
      fire('ended');
    },
    setBuffered(end) {
      bufferedEnd = end;
      fire('progress');
    },
    rejectNextPlay(err) {
      nextPlayError = err;
    },
    setError(code) {
      error = { code, message: 'fake' } as MediaError;
      fire('error');
    },
    play,
    pause,
  };
}
```

- [ ] **Step 3: Create `tests/helpers/fake-provider.ts`**

```ts
import { vi } from 'vitest';
import type { MediaProvider, PlayerError, ProviderContext } from '../../src/types';

export interface FakeProviderOptions {
  name?: string;
  canPlay?: (url: string) => 0 | 1 | 2;
  /** Return an error to make load(url) reject with it. */
  fail?: (url: string) => PlayerError | null;
  /** Replace the default load behaviour entirely. */
  load?: (url: string, start: number) => Promise<void>;
}

export function fakeProvider(opts: FakeProviderOptions = {}) {
  const loads: Array<{ url: string; start: number }> = [];
  let ctx: ProviderContext | null = null;
  let video: HTMLVideoElement | null = null;
  const provider: MediaProvider = {
    name: opts.name ?? 'fake',
    canPlay: (url) => (opts.canPlay ? opts.canPlay(url) : 2),
    attach: vi.fn((v: HTMLVideoElement, c: ProviderContext) => {
      video = v;
      ctx = c;
    }),
    load: vi.fn(async (url: string, start: number) => {
      loads.push({ url, start });
      if (opts.load) return opts.load(url, start);
      const err = opts.fail?.(url);
      if (err) throw err;
      if (start > 0 && video) video.currentTime = start;
    }),
    detach: vi.fn(),
    setQuality: vi.fn(),
    setAudioTrack: vi.fn(),
  };
  return {
    provider,
    loads,
    get ctx(): ProviderContext {
      if (!ctx) throw new Error('provider not attached');
      return ctx;
    },
  };
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add tests/helpers
git commit -m "test: add fake media element and fake provider helpers"
```

### Task 2.2: Initial state and fullscreen helpers

**Files:**
- Create: `src/core/initial-state.ts`, `src/core/fullscreen.ts`
- Test: `tests/core/initial-state.test.ts`

- [ ] **Step 1: Write the failing test `tests/core/initial-state.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { createInitialState } from '../../src/core/initial-state';

describe('createInitialState', () => {
  it('uses defaults', () => {
    const s = createInitialState({ container: 'x' });
    expect(s).toMatchObject({ status: 'idle', volume: 1, muted: false, rate: 1, loop: false, textTrack: -1, title: '', poster: '' });
  });
  it('applies options and clamps volume', () => {
    const s = createInitialState({ container: 'x', volume: 3, muted: true, rate: 1.5, loop: true, title: 'T', poster: 'p.jpg' });
    expect(s).toMatchObject({ volume: 1, muted: true, rate: 1.5, loop: true, title: 'T', poster: 'p.jpg' });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/core/initial-state.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/core/initial-state.ts`**

```ts
import type { PlayerOptions, PlayerState } from '../types';
import { clamp } from '../shared/clamp';

export function createInitialState(o: PlayerOptions): PlayerState {
  return {
    status: 'idle',
    started: false,
    currentTime: 0,
    duration: 0,
    buffered: 0,
    live: false,
    waiting: false,
    volume: clamp(o.volume ?? 1, 0, 1),
    muted: !!o.muted,
    rate: o.rate ?? 1,
    fullscreen: false,
    userActive: false,
    controlsLocked: false,
    width: 0,
    height: 0,
    url: '',
    qualities: [],
    quality: 0,
    audioTracks: [],
    audioTrack: 0,
    textTracks: [],
    textTrack: -1,
    preferredSubtitle: null,
    title: o.title ?? '',
    poster: o.poster ?? '',
    loop: !!o.loop,
    error: null,
  };
}
```

- [ ] **Step 4: Implement `src/core/fullscreen.ts`**

```ts
import type { Logger } from '../types';

type FsDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => void;
};
type FsElement = HTMLElement & { webkitRequestFullscreen?: () => void };
type IOSVideo = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void;
  webkitExitFullscreen?: () => void;
};

export function fullscreenElement(): Element | null {
  const d = document as FsDocument;
  return d.fullscreenElement ?? d.webkitFullscreenElement ?? null;
}

/** Must be called from a user gesture, otherwise browsers reject. */
export function enterFullscreen(root: HTMLElement, video: HTMLVideoElement, log: Logger): void {
  const el = root as FsElement;
  if (typeof el.requestFullscreen === 'function') {
    Promise.resolve(el.requestFullscreen()).catch((e) => log.warn('fullscreen request rejected', e));
  } else if (typeof el.webkitRequestFullscreen === 'function') {
    el.webkitRequestFullscreen();
  } else {
    (video as IOSVideo).webkitEnterFullscreen?.();
  }
}

export function exitFullscreen(video: HTMLVideoElement): void {
  const d = document as FsDocument;
  if (fullscreenElement()) {
    if (typeof d.exitFullscreen === 'function') Promise.resolve(d.exitFullscreen()).catch(() => {});
    else d.webkitExitFullscreen?.();
  } else {
    (video as IOSVideo).webkitExitFullscreen?.();
  }
}

export function watchFullscreen(root: HTMLElement, video: HTMLVideoElement, onChange: (fs: boolean) => void): () => void {
  const check = () => onChange(fullscreenElement() === root);
  const begin = () => onChange(true);
  const end = () => onChange(false);
  document.addEventListener('fullscreenchange', check);
  document.addEventListener('webkitfullscreenchange', check);
  video.addEventListener('webkitbeginfullscreen', begin);
  video.addEventListener('webkitendfullscreen', end);
  return () => {
    document.removeEventListener('fullscreenchange', check);
    document.removeEventListener('webkitfullscreenchange', check);
    video.removeEventListener('webkitbeginfullscreen', begin);
    video.removeEventListener('webkitendfullscreen', end);
  };
}
```

- [ ] **Step 5: Run the test to verify it passes, then typecheck**

Run: `npx vitest run tests/core/initial-state.test.ts && npm run typecheck`
Expected: PASS; typecheck exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/core/initial-state.ts src/core/fullscreen.ts tests/core/initial-state.test.ts
git commit -m "feat(core): add initial state and fullscreen helpers"
```

### Task 2.3: Media events → store and events

**Files:**
- Create: `src/core/media-deps.ts`, `src/core/media-events.ts`
- Test: `tests/core/media-events.test.ts`

`MediaDeps` is the bag of collaborators shared by media modules.

- [ ] **Step 1: Create `src/core/media-deps.ts`**

```ts
import type { CommandRegistry, EventBus, Logger, MediaProvider, PlayerOptions, PlayerState, SourceTransform, Store } from '../types';

export interface MediaDeps {
  video: HTMLVideoElement;
  root: HTMLElement;
  store: Store<PlayerState>;
  events: EventBus;
  commands: CommandRegistry;
  log: Logger;
  options: PlayerOptions;
  /** Mutable registry; plugins may push more providers. */
  providers: MediaProvider[];
  /** Mutable list; plugins add transforms through PluginContext.addSourceTransform. */
  transforms: SourceTransform[];
  random?: () => number;
}
```

- [ ] **Step 2: Write the failing test `tests/core/media-events.test.ts`**

```ts
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
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run tests/core/media-events.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `src/core/media-events.ts`**

```ts
import type { PlayerError } from '../types';
import type { MediaDeps } from './media-deps';
import { mediaErrorToPlayerError } from '../shared/errors';

export interface MediaEventHooks {
  onMediaError(err: PlayerError): void;
}

const QUARTILES = [25, 50, 75] as const;

function bufferedEnd(video: HTMLVideoElement): number {
  const ranges = video.buffered;
  const t = video.currentTime;
  for (let i = 0; i < ranges.length; i++) {
    if (ranges.start(i) <= t + 0.5 && t <= ranges.end(i)) return ranges.end(i);
  }
  return 0;
}

export function bindMediaEvents(d: MediaDeps, hooks: MediaEventHooks): () => void {
  const { video, store, events, options } = d;
  const offs: Array<() => void> = [];
  const quartiles = new Set<number>();
  /** The `end` option fired for this source; re-armed by `new` or a seek before the end point. */
  let endReached = false;
  /** Swallow the `pause` event caused by our own pause() at the end point. */
  let suppressPause = false;

  const endAt = () => {
    const duration = video.duration;
    if (options.end === undefined || !Number.isFinite(duration) || duration <= 0) return Infinity;
    return options.end > 0 ? options.end : duration + options.end;
  };

  const on = (type: string, fn: () => void) => {
    video.addEventListener(type, fn);
    offs.push(() => video.removeEventListener(type, fn));
  };

  const finish = () => {
    if (!quartiles.has(100)) {
      quartiles.add(100);
      events.emit('quartile', 100);
    }
    store.set({ status: 'ended' });
    events.emit('end');
    events.emit('finish');
  };

  const unwait = () => {
    if (!store.get().waiting) return;
    store.set({ waiting: false });
    events.emit('buffered');
  };

  offs.push(
    events.on('new', () => {
      quartiles.clear();
      endReached = false;
      suppressPause = false;
    }),
  );

  on('durationchange', () => {
    const duration = video.duration;
    store.set({ duration: Number.isFinite(duration) ? duration : 0, live: duration === Infinity });
    if (Number.isFinite(duration)) events.emit('duration', duration);
  });

  on('play', () => {
    store.set({ status: 'playing' });
    events.emit('play');
  });

  on('playing', () => {
    store.set({ status: 'playing' });
    unwait();
    if (!store.get().started) {
      store.set({ started: true });
      events.emit('start');
    }
  });

  on('pause', () => {
    if (suppressPause) {
      suppressPause = false;
      return;
    }
    if (video.ended || store.get().status === 'error') return;
    store.set({ status: 'paused' });
    events.emit('pause');
  });

  on('waiting', () => {
    if (store.get().waiting) return;
    store.set({ waiting: true });
    events.emit('buffering');
  });

  on('canplay', unwait);

  on('seeked', () => {
    unwait();
    if (video.currentTime < endAt()) endReached = false;
    events.emit('seek', video.currentTime);
  });

  on('timeupdate', () => {
    const t = video.currentTime;
    store.set({ currentTime: t, buffered: bufferedEnd(video) });
    events.emit('time', t);

    const duration = video.duration;
    if (Number.isFinite(duration) && duration > 0) {
      const pct = (t / duration) * 100;
      for (const q of QUARTILES) {
        if (pct >= q && !quartiles.has(q)) {
          quartiles.add(q);
          events.emit('quartile', q);
        }
      }
      if (!endReached && t >= endAt()) {
        endReached = true;
        if (!video.paused) {
          suppressPause = true;
          video.pause();
        }
        finish();
      }
    }
  });

  on('progress', () => store.set({ buffered: bufferedEnd(video) }));

  on('volumechange', () => {
    const prev = store.get();
    store.set({ volume: video.volume, muted: video.muted });
    if (prev.volume !== video.volume) events.emit('volume', video.volume);
    if (prev.muted !== video.muted) events.emit(video.muted ? 'mute' : 'unmute');
  });

  on('ratechange', () => {
    if (store.get().rate === video.playbackRate) return;
    store.set({ rate: video.playbackRate });
    events.emit('speed', video.playbackRate);
  });

  on('ended', () => {
    if (!endReached) finish();
  });

  on('error', () => hooks.onMediaError(mediaErrorToPlayerError(video.error)));

  return () => offs.forEach((off) => off());
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/core/media-events.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/media-deps.ts src/core/media-events.ts tests/core/media-events.test.ts
git commit -m "feat(core): map media element events to store and player events"
```

### Task 2.4: Media commands

**Files:**
- Create: `src/core/media-commands.ts`
- Test: `tests/core/media-commands.test.ts`

Commands: `play, pause, toggle, stop, seek, setVolume, mute, unmute, toggleMute, setRate, setLoop, setTitle, setPoster, fullscreen, exitFullscreen, toggleFullscreen, setControlsLocked`. `play` returns the raw `video.play()` promise (spec §3.4). `user*` events are emitted when `ctx.source === 'user'`.

- [ ] **Step 1: Write the failing test `tests/core/media-commands.test.ts`**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerMediaCommands } from '../../src/core/media-commands';
import { bindMediaEvents } from '../../src/core/media-events';
import { createStore } from '../../src/core/store';
import { createEventBus } from '../../src/core/events';
import { createCommandRegistry } from '../../src/core/commands';
import { createLogger } from '../../src/core/logger';
import { createInitialState } from '../../src/core/initial-state';
import { installFakeMedia, type FakeMedia } from '../helpers/fake-media';
import type { MediaDeps } from '../../src/core/media-deps';
import type { EventName } from '../../src/types';

let d: MediaDeps;
let media: FakeMedia;
let emitted: EventName[];
const USER = { source: 'user' } as const;

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const video = document.createElement('video');
  media = installFakeMedia(video);
  const log = createLogger(false);
  d = {
    video,
    root: document.createElement('div'),
    store: createStore(createInitialState({ container: 'x' })),
    events: createEventBus(log),
    commands: createCommandRegistry(log),
    log,
    options: { container: 'x' },
    providers: [],
    transforms: [],
  };
  emitted = [];
  d.events.onAny((n) => emitted.push(n));
  bindMediaEvents(d, { onMediaError: () => {} });
  registerMediaCommands(d);
  media.setDuration(100);
});

describe('media commands', () => {
  it('play returns the media promise and emits userplay for user source', async () => {
    await d.commands.run('play', [], USER);
    expect(media.play).toHaveBeenCalled();
    expect(emitted).toContain('userplay');
  });

  it('play propagates rejection', async () => {
    const err = new DOMException('blocked', 'NotAllowedError');
    media.rejectNextPlay(err);
    await expect(d.commands.run('play', [])).rejects.toBe(err);
  });

  it('toggle plays, pauses and restarts after end', async () => {
    d.commands.run('toggle', []);
    await Promise.resolve();
    expect(d.store.get().status).toBe('playing');
    d.commands.run('toggle', [], USER);
    expect(d.store.get().status).toBe('paused');
    expect(emitted).toContain('userpause');
    media.end();
    d.commands.run('toggle', []);
    expect(d.video.currentTime).toBe(0);
    expect(media.play).toHaveBeenCalledTimes(2);
  });

  it('seek handles absolute, relative and clamping', () => {
    d.commands.run('seek', [30]);
    expect(d.video.currentTime).toBe(30);
    d.commands.run('seek', ['+10']);
    expect(d.video.currentTime).toBe(40);
    d.commands.run('seek', ['-100'], USER);
    expect(d.video.currentTime).toBe(0);
    expect(emitted).toContain('userseek');
    d.commands.run('seek', [500]);
    expect(d.video.currentTime).toBe(100);
  });

  it('seek is a no-op for live', () => {
    media.setDuration(Infinity);
    d.commands.run('seek', [10]);
    expect(d.video.currentTime).toBe(0);
  });

  it('setVolume clamps, supports relative values and unmutes', () => {
    d.video.muted = true;
    d.commands.run('setVolume', [0.5]);
    expect(d.video.volume).toBe(0.5);
    expect(d.video.muted).toBe(false);
    d.commands.run('setVolume', ['+0.8']);
    expect(d.video.volume).toBe(1);
    d.commands.run('setVolume', ['-2']);
    expect(d.video.volume).toBe(0);
  });

  it('mute, unmute and toggleMute', () => {
    d.commands.run('mute', []);
    expect(d.video.muted).toBe(true);
    d.commands.run('toggleMute', []);
    expect(d.video.muted).toBe(false);
    d.commands.run('toggleMute', []);
    d.commands.run('unmute', []);
    expect(d.video.muted).toBe(false);
  });

  it('stop pauses, rewinds and emits stop', async () => {
    await d.commands.run('play', []);
    d.video.currentTime = 50;
    d.commands.run('stop', []);
    expect(d.video.paused).toBe(true);
    expect(d.video.currentTime).toBe(0);
    expect(emitted).toContain('stop');
  });

  it('setRate also sets defaultPlaybackRate', () => {
    d.commands.run('setRate', [1.5]);
    expect(d.video.playbackRate).toBe(1.5);
    expect(d.video.defaultPlaybackRate).toBe(1.5);
  });

  it('setLoop, setTitle, setPoster, setControlsLocked update store', () => {
    d.commands.run('setLoop', [true]);
    d.commands.run('setTitle', ['Hello']);
    d.commands.run('setPoster', ['p.jpg']);
    d.commands.run('setControlsLocked', [true]);
    expect(d.video.loop).toBe(true);
    expect(d.video.poster).toContain('p.jpg');
    expect(d.store.get()).toMatchObject({ loop: true, title: 'Hello', poster: 'p.jpg', controlsLocked: true });
  });

  it('fullscreen commands call the Fullscreen API and track state', () => {
    const request = vi.fn(() => Promise.resolve());
    (d.root as any).requestFullscreen = request;
    d.commands.run('toggleFullscreen', []);
    expect(request).toHaveBeenCalled();
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => d.root });
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(d.store.get().fullscreen).toBe(true);
    expect(emitted).toContain('fullscreen');
    const exit = vi.fn(() => Promise.resolve());
    (document as any).exitFullscreen = exit;
    d.commands.run('toggleFullscreen', []);
    expect(exit).toHaveBeenCalled();
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => null });
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(d.store.get().fullscreen).toBe(false);
    expect(emitted).toContain('exitfullscreen');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/core/media-commands.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/core/media-commands.ts`**

```ts
import type { CommandContext } from '../types';
import type { MediaDeps } from './media-deps';
import { clamp } from '../shared/clamp';
import { enterFullscreen, exitFullscreen, watchFullscreen } from './fullscreen';

const isRelative = (v: number | string): v is string => typeof v === 'string' && /^[+-]/.test(v.trim());

export function registerMediaCommands(d: MediaDeps): () => void {
  const { video, store, events, commands, log, root } = d;

  const playSafe = (ctx: CommandContext) => {
    const p = commands.run('play', [], ctx);
    if (p) p.catch((e) => log.warn('play() was rejected', e));
  };

  const offs: Array<() => void> = [
    commands.register('play', (_args, ctx) => {
      const p = video.play() ?? Promise.resolve();
      if (ctx.source === 'user') events.emit('userplay');
      return p;
    }),

    commands.register('pause', (_args, ctx) => {
      video.pause();
      if (ctx.source === 'user') events.emit('userpause');
    }),

    commands.register('toggle', (_args, ctx) => {
      if (store.get().status === 'ended') {
        video.currentTime = 0;
        playSafe(ctx);
      } else if (!video.paused) {
        commands.run('pause', [], ctx);
      } else {
        playSafe(ctx);
      }
    }),

    commands.register('stop', () => {
      video.pause();
      video.currentTime = 0;
      events.emit('stop');
    }),

    commands.register('seek', ([t], ctx) => {
      if (store.get().live) return;
      let target = isRelative(t) ? video.currentTime + Number(t) : Number(t);
      if (!Number.isFinite(target)) return;
      const duration = video.duration;
      target = Number.isFinite(duration) ? clamp(target, 0, duration) : Math.max(0, target);
      video.currentTime = target;
      store.set({ currentTime: target });
      if (ctx.source === 'user') events.emit('userseek', target);
    }),

    commands.register('setVolume', ([v]) => {
      const raw = isRelative(v) ? video.volume + Number(v) : Number(v);
      if (!Number.isFinite(raw)) return;
      const volume = clamp(raw, 0, 1);
      video.volume = volume;
      if (volume > 0 && video.muted) video.muted = false;
    }),

    commands.register('mute', () => {
      video.muted = true;
    }),
    commands.register('unmute', () => {
      video.muted = false;
    }),
    commands.register('toggleMute', () => {
      video.muted = !video.muted;
    }),

    commands.register('setRate', ([r]) => {
      if (!(r > 0)) return;
      video.defaultPlaybackRate = r;
      video.playbackRate = r;
    }),

    commands.register('setLoop', ([b]) => {
      video.loop = b;
      store.set({ loop: b });
    }),
    commands.register('setTitle', ([title]) => store.set({ title })),
    commands.register('setPoster', ([poster]) => {
      video.poster = poster;
      store.set({ poster });
    }),
    commands.register('setControlsLocked', ([b]) => store.set({ controlsLocked: b })),

    commands.register('fullscreen', () => enterFullscreen(root, video, log)),
    commands.register('exitFullscreen', () => exitFullscreen(video)),
    commands.register('toggleFullscreen', () => {
      if (store.get().fullscreen) exitFullscreen(video);
      else enterFullscreen(root, video, log);
    }),

    watchFullscreen(root, video, (fs) => {
      if (store.get().fullscreen === fs) return;
      store.set({ fullscreen: fs });
      events.emit(fs ? 'fullscreen' : 'exitfullscreen');
    }),
  ];

  return () => offs.forEach((off) => off());
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/core/media-commands.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/media-commands.ts tests/core/media-commands.test.ts
git commit -m "feat(core): add playback, volume, seek and fullscreen commands"
```

## Chunk 2b: MediaController and html5 provider

### Task 2.5: MediaController (load pipeline, fallback, switching)

**Files:**
- Create: `src/core/media-controller.ts`
- Test: `tests/core/media-controller.test.ts`

Pipeline (spec §4.3): before-hooks (in CommandRegistry) → playlist check → parse/normalize → selection + `SourceTransform`s (+ `reload` start override) → store reset → `new` → provider chain. Fallback/retry/error per §5. Quality/audio switching per §4.4. A provider's `setQualities`/`setAudioTracks` are ignored when the spec has more than one file-based quality/track (file-based lists win).

- [ ] **Step 1: Write the failing test `tests/core/media-controller.test.ts`**

```ts
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
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/core/media-controller.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/core/media-controller.ts`**

```ts
import type { MediaProvider, PlayerError, ProviderContext, Selection, SourceInput, SourceSpec } from '../types';
import type { MediaDeps } from './media-deps';
import { isPlaylistInput, normalizeSpec, parseSource } from '../source/parse';
import { toPlayerError } from '../shared/errors';
import { clamp } from '../shared/clamp';
import { bindMediaEvents } from './media-events';
import { registerMediaCommands } from './media-commands';

export interface MediaController {
  readonly provider: MediaProvider | null;
  destroy(): void;
}

export function createMediaController(d: MediaDeps): MediaController {
  const { video, store, events, commands, log, options } = d;

  let spec: SourceSpec | null = null;
  let selection: Selection = { quality: 0, audio: 0, start: 0 };
  let lastInput: SourceInput | null = null;
  let provider: MediaProvider | null = null;
  let providerQualities = false;
  let providerAudio = false;
  let token = 0;
  let chain: string[] = [];
  let chainIndex = 0;
  let retriesUsed = 0;
  let pending = false;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let reloadStart: number | undefined;

  // Sync initial options/state onto the element.
  const initial = store.get();
  video.volume = initial.volume;
  video.muted = initial.muted;
  video.loop = initial.loop;
  video.defaultPlaybackRate = initial.rate;
  video.playbackRate = initial.rate;
  if (initial.poster) video.poster = initial.poster;

  const currentTracks = () => spec?.qualities[selection.quality]?.tracks ?? [];

  const reloadOptions = () => options.reload ?? { retries: store.get().live ? 3 : 0, delay: 2000 };

  const playSafe = () => {
    const p = commands.run('play', []);
    if (p) p.catch((e) => log.warn('play() was rejected', e));
  };

  const contextFor = (owner: MediaProvider): ProviderContext => ({
    setQualities(list, current) {
      if (provider !== owner || (spec && spec.qualities.length > 1)) return;
      providerQualities = true;
      store.set({ qualities: list, quality: clamp(current, 0, Math.max(0, list.length - 1)) });
    },
    setAudioTracks(list, current) {
      if (provider !== owner || currentTracks().length > 1) return;
      providerAudio = true;
      store.set({ audioTracks: list, audioTrack: clamp(current, 0, Math.max(0, list.length - 1)) });
    },
    error(err) {
      if (provider === owner) fail(token, store.get().url, err, video.currentTime, !video.paused);
    },
    log,
    options,
  });

  const pickProvider = (url: string, s: SourceSpec): MediaProvider | null => {
    let best: MediaProvider | null = null;
    let score = 0;
    for (const p of d.providers) {
      const value = p.canPlay(url, s);
      if (value > score) {
        best = p;
        score = value;
      }
    }
    return best;
  };

  const setError = (error: PlayerError) => {
    store.set({ status: 'error', error });
    events.emit('error', error);
  };

  const fail = (t: number, url: string, error: PlayerError, time: number, resume: boolean) => {
    if (t !== token) return;
    pending = false;
    events.emit('loaderror', { url, error });
    if (chainIndex < chain.length - 1) {
      chainIndex++;
      tryUrl(t, time, resume);
      return;
    }
    const { retries, delay } = reloadOptions();
    if (retriesUsed < retries) {
      retriesUsed++;
      retryTimer = setTimeout(() => {
        if (t === token) tryUrl(t, time, resume);
      }, delay);
      return;
    }
    setError(error);
  };

  const tryUrl = (t: number, time: number, resume: boolean) => {
    const url = chain[chainIndex]!;
    const next = spec ? pickProvider(url, spec) : null;
    if (!next) {
      fail(t, url, { kind: 'unsupported', message: `No provider can play ${url}` }, time, resume);
      return;
    }
    if (next !== provider) {
      provider?.detach();
      provider = next;
      providerQualities = false;
      providerAudio = false;
      next.attach(video, contextFor(next));
    }
    store.set({ url });
    pending = true;
    let loading: Promise<void>;
    try {
      loading = next.load(url, time);
    } catch (e) {
      loading = Promise.reject(e);
    }
    loading.then(
      () => {
        if (t !== token) return;
        pending = false;
        if (store.get().status === 'loading') store.set({ status: 'ready' });
        events.emit('metadata', { duration: video.duration });
        if (resume) playSafe();
      },
      (err) => fail(t, url, toPlayerError(err), time, resume),
    );
  };

  const startChain = (time: number, resume: boolean) => {
    clearTimeout(retryTimer);
    token++;
    chain = currentTracks()[selection.audio]?.urls ?? [];
    chainIndex = 0;
    retriesUsed = 0;
    if (!chain.length) {
      setError({ kind: 'unsupported', message: 'Source has no urls' });
      return;
    }
    tryUrl(token, time, resume);
  };

  const switchSource = () => startChain(video.currentTime, !video.paused);

  const rejectInput = (input: SourceInput, message: string) => {
    token++;
    const error: PlayerError = { kind: 'unsupported', message };
    log.error(message);
    events.emit('loaderror', { url: typeof input === 'string' ? input : '', error });
    setError(error);
  };

  const offs: Array<() => void> = [
    bindMediaEvents(d, {
      onMediaError(err) {
        if (pending || !chain.length || store.get().status === 'error') return;
        fail(token, store.get().url, err, video.currentTime, !video.paused);
      },
    }),
    registerMediaCommands(d),

    commands.register('load', ([input]) => {
      lastInput = input;
      if (isPlaylistInput(input)) {
        rejectInput(input, 'Playlist input requires the playlist plugin');
        return;
      }
      const parsed =
        typeof input === 'string'
          ? { ...parseSource(input, { qualities: options.qualities, random: d.random }), ...(options.forceType ? { forceType: options.forceType } : {}) }
          : normalizeSpec(input, options.forceType);
      if (!parsed.qualities.length) {
        rejectInput(input, 'Source is empty');
        return;
      }

      let sel: Selection = { quality: parsed.qualities.length - 1, audio: 0, start: parsed.start ?? options.start ?? 0 };
      for (const transform of [...d.transforms]) {
        try {
          sel = { ...transform(parsed, sel) };
        } catch (e) {
          log.error('source transform failed', e);
        }
      }
      if (reloadStart !== undefined) {
        sel.start = reloadStart;
        reloadStart = undefined;
      }
      sel.quality = clamp(Math.round(sel.quality) || 0, 0, parsed.qualities.length - 1);
      const tracks = parsed.qualities[sel.quality]!.tracks;
      sel.audio = clamp(Math.round(sel.audio) || 0, 0, tracks.length - 1);
      sel.start = Math.max(0, Number(sel.start) || 0);

      spec = parsed;
      selection = sel;
      providerQualities = false;
      providerAudio = false;
      store.set({
        status: 'loading',
        started: false,
        currentTime: 0,
        duration: 0,
        buffered: 0,
        live: false,
        waiting: false,
        error: null,
        url: '',
        qualities: parsed.qualities.map((q) => ({ label: q.label })),
        quality: sel.quality,
        audioTracks: tracks.map((t) => ({ label: t.label })),
        audioTrack: sel.audio,
      });
      events.emit('new', { spec: parsed, selection: sel });
      startChain(sel.start, false);
    }),

    commands.register('reload', () => {
      if (lastInput === null) return;
      reloadStart = store.get().currentTime || video.currentTime || 0;
      commands.run('load', [lastInput]);
      reloadStart = undefined; // consumed by load, or discarded if a before-hook cancelled it
    }),

    commands.register('setQuality', ([i]) => {
      const s = store.get();
      if (!Number.isInteger(i) || i < 0 || i >= s.qualities.length || i === s.quality) return;
      const label = s.qualities[i]!.label;
      if (providerQualities) {
        provider?.setQuality?.(i);
        store.set({ quality: i });
        events.emit('quality', label);
        return;
      }
      if (!spec) return;
      const currentAudio = s.audioTracks[s.audioTrack]?.label;
      const tracks = spec.qualities[i]!.tracks;
      const audio = Math.max(0, tracks.findIndex((t) => t.label === currentAudio));
      selection = { ...selection, quality: i, audio };
      providerAudio = false;
      store.set({ quality: i, audioTracks: tracks.map((t) => ({ label: t.label })), audioTrack: audio });
      switchSource();
      events.emit('quality', label);
    }),

    commands.register('setAudioTrack', ([i]) => {
      const s = store.get();
      if (!Number.isInteger(i) || i < 0 || i >= s.audioTracks.length || i === s.audioTrack) return;
      const label = s.audioTracks[i]!.label;
      if (providerAudio) {
        provider?.setAudioTrack?.(i);
        store.set({ audioTrack: i });
        events.emit('audiotrack', label);
        return;
      }
      if (!spec) return;
      selection = { ...selection, audio: i };
      store.set({ audioTrack: i });
      switchSource();
      events.emit('audiotrack', label);
    }),
  ];

  return {
    get provider() {
      return provider;
    },
    destroy() {
      clearTimeout(retryTimer);
      token++;
      offs.forEach((off) => off());
      provider?.detach();
      provider = null;
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/core/media-controller.test.ts`
Expected: PASS. If `falls back on media errors after load` fails because `pending` is still true, check that `fail` resets `pending` and that the success path sets `pending = false` before emitting `metadata`.

- [ ] **Step 5: Run the whole suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: all pass; typecheck exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/core/media-controller.ts tests/core/media-controller.test.ts
git commit -m "feat(core): add media controller with load pipeline, fallback and track switching"
```

### Task 2.6: html5 provider

**Files:**
- Create: `src/providers/html5.ts`
- Test: `tests/providers/html5.test.ts`

- [ ] **Step 1: Write the failing test `tests/providers/html5.test.ts`**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { html5Provider, hasNativeHls } from '../../src/providers/html5';
import { createLogger } from '../../src/core/logger';
import { installFakeMedia } from '../helpers/fake-media';
import type { ProviderContext, SourceSpec } from '../../src/types';

const spec: SourceSpec = { qualities: [], subtitles: [] };
const ctx = { log: createLogger(false), options: { container: 'x' }, setQualities() {}, setAudioTracks() {}, error() {} } as ProviderContext;

afterEach(() => vi.restoreAllMocks());

describe('html5Provider.canPlay', () => {
  it('accepts progressive formats and unknown extensions', () => {
    const p = html5Provider();
    expect(p.canPlay('a.mp4', spec)).toBe(1);
    expect(p.canPlay('a.webm?x', spec)).toBe(1);
    expect(p.canPlay('https://a.com/stream', spec)).toBe(1);
  });

  it('rejects dash and non-native hls', () => {
    const p = html5Provider();
    expect(p.canPlay('a.mpd', spec)).toBe(0);
    expect(p.canPlay('a.m3u8', spec)).toBe(0);
    expect(p.canPlay('a.php', { ...spec, forceType: 'hls' })).toBe(0);
  });

  it('accepts hls when natively supported', () => {
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('maybe');
    expect(hasNativeHls()).toBe(true);
    expect(html5Provider().canPlay('a.m3u8', spec)).toBe(1);
  });
});

describe('html5Provider.load', () => {
  it('sets src, waits for metadata and applies the start time', async () => {
    const video = document.createElement('video');
    installFakeMedia(video);
    const p = html5Provider();
    p.attach(video, ctx);
    const loading = p.load('https://a.com/v.mp4', 15);
    expect(video.getAttribute('src')).toBe('https://a.com/v.mp4');
    video.dispatchEvent(new Event('loadedmetadata'));
    await loading;
    expect(video.currentTime).toBe(15);
  });

  it('rejects with a PlayerError on media error', async () => {
    const video = document.createElement('video');
    const media = installFakeMedia(video);
    const p = html5Provider();
    p.attach(video, ctx);
    const loading = p.load('bad.mp4', 0);
    media.setError(4);
    await expect(loading).rejects.toEqual({ kind: 'unsupported', message: 'fake' });
  });

  it('detach removes the source', () => {
    const video = document.createElement('video');
    installFakeMedia(video);
    const p = html5Provider();
    p.attach(video, ctx);
    void p.load('a.mp4', 0);
    p.detach();
    expect(video.hasAttribute('src')).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/providers/html5.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/providers/html5.ts`**

```ts
import type { MediaProvider } from '../types';
import { extOf } from '../shared/url';
import { mediaErrorToPlayerError } from '../shared/errors';

export function hasNativeHls(): boolean {
  if (typeof document === 'undefined') return false;
  return document.createElement('video').canPlayType('application/vnd.apple.mpegurl') !== '';
}

export function html5Provider(): MediaProvider {
  let video: HTMLVideoElement | null = null;
  let cancel: (() => void) | null = null;

  return {
    name: 'html5',

    canPlay(url, spec) {
      const ext = extOf(url);
      if (ext === 'm3u8' || spec.forceType === 'hls') return hasNativeHls() ? 1 : 0;
      if (ext === 'mpd') return 0;
      return 1;
    },

    attach(v) {
      video = v;
    },

    load(url, startTime) {
      const v = video;
      if (!v) return Promise.reject({ kind: 'unknown', message: 'html5 provider is not attached' });
      cancel?.();
      return new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          v.removeEventListener('loadedmetadata', onMeta);
          v.removeEventListener('error', onError);
          cancel = null;
        };
        const onMeta = () => {
          cleanup();
          if (startTime > 0) v.currentTime = startTime;
          resolve();
        };
        const onError = () => {
          cleanup();
          reject(mediaErrorToPlayerError(v.error));
        };
        cancel = cleanup;
        v.addEventListener('loadedmetadata', onMeta);
        v.addEventListener('error', onError);
        v.src = url;
        v.load();
      });
    },

    detach() {
      cancel?.();
      if (video) {
        video.removeAttribute('src');
        video.load();
      }
      video = null;
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/providers/html5.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the whole suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: all pass; typecheck exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/providers/html5.ts tests/providers/html5.test.ts
git commit -m "feat(providers): add html5 provider"
```
