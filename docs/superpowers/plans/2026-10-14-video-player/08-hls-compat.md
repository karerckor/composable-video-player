## Chunk 8: HLS provider, PlayerJS compat layer, UMD build

Delivers: the hls.js provider (lazy script load, levels → qualities with "auto", audio tracks, fatal-error recovery), the PlayerJS compat layer (`new Playerjs({...})`, option mapping, `PlayerjsEvents`/DOM events bridge, iframe `postMessage`), the UMD entry and build.

Spec references: §4.2 (hls), §5 (errors), §8 (compat), §11 (build).

Deviations (recorded in `00-overview.md` as 31–34):
- hls.js is loaded with a `<script>` tag (default `https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js`, option `hlsUrl`) instead of `import(url)`: works identically in ESM and UMD bundles, and reuses a page-provided `window.Hls`.
- The compat events bridge, `postMessage` bridge and `ready` callback are installed by an internal `playerjs-compat` plugin, so they see `init`.
- The UMD file is `dist/player.umd.cjs` (package is `"type": "module"`).

### Task 8.1: HLS provider

**Files:**
- Create: `src/providers/hls.ts`
- Modify: `src/player.ts` (register `hlsProvider()` after `html5Provider()`)
- Test: `tests/providers/hls.test.ts`

- [ ] **Step 1: Write the failing test `tests/providers/hls.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hlsProvider, loadHlsScript, resetHlsLoader, type HlsConstructor } from '../../src/providers/hls';
import { createLogger } from '../../src/core/logger';
import type { PlayerError, ProviderContext, Quality, SourceSpec, TrackInfo } from '../../src/types';

const spec: SourceSpec = { qualities: [], subtitles: [] };

class FakeHls {
  static Events = { MANIFEST_PARSED: 'hlsManifestParsed', ERROR: 'hlsError', AUDIO_TRACKS_UPDATED: 'hlsAudioTracksUpdated' };
  static ErrorTypes = { NETWORK_ERROR: 'networkError', MEDIA_ERROR: 'mediaError', OTHER_ERROR: 'otherError' };
  static instances: FakeHls[] = [];
  handlers: Record<string, Array<(e: string, data: any) => void>> = {};
  levels = [{ height: 360, bitrate: 800_000 }, { height: 720, bitrate: 2_500_000 }, { height: 720, bitrate: 4_000_000 }];
  audioTracks = [{ name: 'English', lang: 'en' }, { name: 'Русский', lang: 'ru' }];
  audioTrack = 0;
  currentLevel = -1;
  loadSource = vi.fn();
  attachMedia = vi.fn();
  startLoad = vi.fn();
  recoverMediaError = vi.fn();
  destroy = vi.fn();
  constructor(public config: Record<string, unknown>) {
    FakeHls.instances.push(this);
  }
  on(event: string, cb: (e: string, data: any) => void) {
    (this.handlers[event] ??= []).push(cb);
  }
  emit(event: string, data: any = {}) {
    for (const cb of this.handlers[event] ?? []) cb(event, data);
  }
}

let video: HTMLVideoElement;
let qualities: Array<[Quality[], number]>;
let audio: Array<[TrackInfo[], number]>;
let errors: PlayerError[];
let ctx: ProviderContext;

beforeEach(() => {
  FakeHls.instances = [];
  video = document.createElement('video');
  qualities = [];
  audio = [];
  errors = [];
  ctx = {
    setQualities: (q, c) => void qualities.push([q, c]),
    setAudioTracks: (t, c) => void audio.push([t, c]),
    error: (e) => void errors.push(e),
    log: createLogger(false),
    options: { container: 'x', hlsConfig: { maxBufferLength: 10 } },
  };
  vi.stubGlobal('MediaSource', class {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  resetHlsLoader();
  delete (window as unknown as { Hls?: unknown }).Hls;
});

const provider = () => hlsProvider({ loader: async () => FakeHls as unknown as HlsConstructor });

async function loaded(start = 0) {
  const p = provider();
  p.attach(video, ctx);
  const loading = p.load('https://a.com/master.m3u8', start);
  await Promise.resolve();
  await Promise.resolve();
  const hls = FakeHls.instances[0]!;
  return { p, loading, hls };
}

describe('hlsProvider.canPlay', () => {
  it('prefers m3u8 (or forceType hls) when MediaSource exists and HLS is not native', () => {
    const p = provider();
    expect(p.canPlay('a.m3u8?token=1', spec)).toBe(2);
    expect(p.canPlay('a.php', { ...spec, forceType: 'hls' })).toBe(2);
    expect(p.canPlay('a.mp4', spec)).toBe(0);
    vi.unstubAllGlobals();
    delete (window as unknown as { MediaSource?: unknown }).MediaSource;
    expect(p.canPlay('a.m3u8', spec)).toBe(0);
  });

  it('is preferred over native HLS when MSE exists (html5 only scores 1)', () => {
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('maybe');
    expect(provider().canPlay('a.m3u8', spec)).toBe(2);
  });
});

describe('hlsProvider.load', () => {
  it('creates hls.js with config and start position, attaches and resolves on metadata', async () => {
    const { loading, hls } = await loaded(12);
    expect(hls.config).toEqual({ maxBufferLength: 10, startPosition: 12 });
    expect(hls.loadSource).toHaveBeenCalledWith('https://a.com/master.m3u8');
    expect(hls.attachMedia).toHaveBeenCalledWith(video);
    video.dispatchEvent(new Event('loadedmetadata'));
    await expect(loading).resolves.toBeUndefined();
  });

  it('publishes levels with an auto entry and collision-safe labels, and audio tracks', async () => {
    const { hls } = await loaded();
    hls.emit(FakeHls.Events.MANIFEST_PARSED);
    expect(qualities[0]).toEqual([
      [
        { label: 'auto' },
        { label: '360p', height: 360, bitrate: 800_000 },
        { label: '720p 2500kbps', height: 720, bitrate: 2_500_000 },
        { label: '720p 4000kbps', height: 720, bitrate: 4_000_000 },
      ],
      0,
    ]);
    expect(audio[0]).toEqual([[{ label: 'English', lang: 'en' }, { label: 'Русский', lang: 'ru' }], 0]);
  });

  it('maps store indexes to hls levels and audio tracks', async () => {
    const { p, hls } = await loaded();
    p.setQuality!(2);
    expect(hls.currentLevel).toBe(1);
    p.setQuality!(0);
    expect(hls.currentLevel).toBe(-1);
    p.setAudioTrack!(1);
    expect(hls.audioTrack).toBe(1);
  });

  it('recovers once from fatal network and media errors, then rejects', async () => {
    const { loading, hls } = await loaded();
    hls.emit(FakeHls.Events.ERROR, { fatal: true, type: 'networkError', details: 'manifestLoadError' });
    expect(hls.startLoad).toHaveBeenCalledTimes(1);
    hls.emit(FakeHls.Events.ERROR, { fatal: true, type: 'mediaError', details: 'bufferStalled' });
    expect(hls.recoverMediaError).toHaveBeenCalledTimes(1);
    hls.emit(FakeHls.Events.ERROR, { fatal: true, type: 'networkError', details: 'manifestLoadError', response: { code: 404 } });
    await expect(loading).rejects.toEqual({ kind: 'not-found', message: 'manifestLoadError' });
  });

  it('ignores non-fatal errors and reports fatal errors after load through ctx.error', async () => {
    const { loading, hls } = await loaded();
    hls.emit(FakeHls.Events.ERROR, { fatal: false, type: 'networkError' });
    video.dispatchEvent(new Event('loadedmetadata'));
    await loading;
    hls.emit(FakeHls.Events.ERROR, { fatal: true, type: 'otherError', details: 'x' });
    expect(errors).toEqual([{ kind: 'unknown', message: 'x' }]);
  });

  it('rejects as unsupported when hls.js cannot be loaded, and destroys on detach', async () => {
    const failing = hlsProvider({ loader: () => Promise.reject(new Error('offline')) });
    failing.attach(video, ctx);
    await expect(failing.load('a.m3u8', 0)).rejects.toMatchObject({ kind: 'unsupported' });
    const { p, hls } = await loaded();
    p.detach();
    expect(hls.destroy).toHaveBeenCalled();
  });
});

describe('loadHlsScript', () => {
  it('reuses window.Hls', async () => {
    (window as unknown as { Hls: unknown }).Hls = FakeHls;
    await expect(loadHlsScript('x.js')).resolves.toBe(FakeHls);
    expect(document.head.querySelector('script[src="x.js"]')).toBeNull();
  });

  it('injects one script tag and resolves with window.Hls after load', async () => {
    const a = loadHlsScript('https://cdn/hls.js');
    const b = loadHlsScript('https://cdn/hls.js');
    const scripts = document.head.querySelectorAll('script[src="https://cdn/hls.js"]');
    expect(scripts).toHaveLength(1);
    (window as unknown as { Hls: unknown }).Hls = FakeHls;
    scripts[0]!.dispatchEvent(new Event('load'));
    await expect(a).resolves.toBe(FakeHls);
    expect(b).toBe(a);
  });

  it('rejects on script error and allows a retry', async () => {
    const a = loadHlsScript('https://cdn/broken.js');
    document.head.querySelector('script[src="https://cdn/broken.js"]')!.dispatchEvent(new Event('error'));
    await expect(a).rejects.toThrow(/broken/);
    expect(loadHlsScript('https://cdn/broken.js')).not.toBe(a);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/providers/hls.test.ts`
Expected: FAIL — cannot resolve `../../src/providers/hls`.

- [ ] **Step 3: Implement `src/providers/hls.ts`**

```ts
import type { ErrorKind, MediaProvider, PlayerError, ProviderContext, Quality } from '../types';
import { extOf } from '../shared/url';

/** The subset of the hls.js API this provider uses. */
export interface HlsInstance {
  levels: Array<{ height?: number; bitrate: number }>;
  audioTracks: Array<{ name?: string; lang?: string }>;
  audioTrack: number;
  currentLevel: number;
  loadSource(url: string): void;
  attachMedia(video: HTMLMediaElement): void;
  startLoad(): void;
  recoverMediaError(): void;
  destroy(): void;
  on(event: string, cb: (event: string, data: any) => void): void;
}
export interface HlsConstructor {
  new (config?: Record<string, unknown>): HlsInstance;
  Events: Record<string, string>;
  ErrorTypes: Record<string, string>;
}

export const DEFAULT_HLS_URL = 'https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js';

let pending: Promise<HlsConstructor> | null = null;

/** Loads the hls.js UMD bundle once (or reuses a page-provided window.Hls). */
export function loadHlsScript(src: string): Promise<HlsConstructor> {
  const w = window as unknown as { Hls?: HlsConstructor };
  if (w.Hls) return Promise.resolve(w.Hls);
  if (pending) return pending;
  const loading = new Promise<HlsConstructor>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.addEventListener('load', () => (w.Hls ? resolve(w.Hls) : reject(new Error(`${src} did not define window.Hls`))));
    script.addEventListener('error', () => {
      script.remove();
      reject(new Error(`failed to load ${src}`));
    });
    document.head.append(script);
  });
  pending = loading;
  loading.catch(() => {
    if (pending === loading) pending = null;
  });
  return loading;
}

/** Test helper: forget a cached loader promise. */
export function resetHlsLoader(): void {
  pending = null;
}

function levelLabels(levels: HlsInstance['levels']): Quality[] {
  const base = levels.map((l) => (l.height ? `${l.height}p` : `${Math.round(l.bitrate / 1000)}kbps`));
  return levels.map((l, i) => {
    const duplicate = base.filter((b) => b === base[i]).length > 1;
    const label = duplicate && l.height ? `${base[i]} ${Math.round(l.bitrate / 1000)}kbps` : base[i]!;
    return { label, height: l.height, bitrate: l.bitrate };
  });
}

export interface HlsProviderOptions {
  /** Override how the hls.js constructor is obtained (tests, bundlers). */
  loader?: (src: string) => Promise<HlsConstructor>;
}

export function hlsProvider(o: HlsProviderOptions = {}): MediaProvider {
  let video: HTMLVideoElement | null = null;
  let ctx: ProviderContext | null = null;
  let hls: HlsInstance | null = null;
  let cleanupLoad: (() => void) | null = null;

  const destroyHls = () => {
    cleanupLoad?.();
    hls?.destroy();
    hls = null;
  };

  return {
    name: 'hls',

    /**
     * Prefer hls.js wherever MSE exists (desktop Chrome now reports native HLS but exposes no
     * renditions, so there would be no quality menu). Without MSE (iPhone) html5 plays natively.
     */
    canPlay(url, spec) {
      const isHls = extOf(url) === 'm3u8' || spec.forceType === 'hls';
      if (!isHls) return 0;
      return typeof window !== 'undefined' && 'MediaSource' in window ? 2 : 0;
    },

    attach(v, c) {
      video = v;
      ctx = c;
    },

    async load(url, startTime) {
      const c = ctx;
      if (!video || !c) throw { kind: 'unknown', message: 'hls provider is not attached' } satisfies PlayerError;
      let Hls: HlsConstructor;
      try {
        Hls = await (o.loader ?? loadHlsScript)(c.options.hlsUrl ?? DEFAULT_HLS_URL);
      } catch (e) {
        throw { kind: 'unsupported', message: `hls.js failed to load: ${String(e)}` } satisfies PlayerError;
      }
      const media = video;
      if (!media) throw { kind: 'unknown', message: 'hls provider was detached' } satisfies PlayerError;
      destroyHls();
      // A user-provided startPosition wins unless the player asks for a specific start time.
      const instance = new Hls({ startPosition: -1, ...(c.options.hlsConfig ?? {}), ...(startTime > 0 ? { startPosition: startTime } : {}) });
      hls = instance;

      return new Promise<void>((resolve, reject) => {
        let settled = false;
        let networkRetried = false;
        let mediaRetried = false;

        const onMeta = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        media.addEventListener('loadedmetadata', onMeta);
        cleanupLoad = () => {
          media.removeEventListener('loadedmetadata', onMeta);
          cleanupLoad = null;
        };

        instance.on(Hls.Events.MANIFEST_PARSED!, () => {
          if (instance.levels.length > 1) c.setQualities([{ label: 'auto' }, ...levelLabels(instance.levels)], 0);
          if (instance.audioTracks.length > 1) {
            c.setAudioTracks(
              instance.audioTracks.map((t, i) => ({ label: t.name || t.lang || String(i + 1), lang: t.lang })),
              Math.max(0, instance.audioTrack),
            );
          }
        });

        instance.on(Hls.Events.ERROR!, (_event, data: { fatal?: boolean; type?: string; details?: string; response?: { code?: number } }) => {
          if (!data.fatal) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR && !networkRetried) {
            networkRetried = true;
            instance.startLoad();
            return;
          }
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !mediaRetried) {
            mediaRetried = true;
            instance.recoverMediaError();
            return;
          }
          const kind: ErrorKind =
            data.response?.code === 404 ? 'not-found' : data.type === Hls.ErrorTypes.NETWORK_ERROR ? 'network' : data.type === Hls.ErrorTypes.MEDIA_ERROR ? 'decode' : 'unknown';
          const error: PlayerError = { kind, message: data.details ?? 'hls.js error' };
          if (!settled) {
            settled = true;
            cleanupLoad?.();
            reject(error);
          } else {
            c.error(error);
          }
        });

        instance.loadSource(url);
        instance.attachMedia(media);
      });
    },

    detach() {
      destroyHls();
      video = null;
    },

    setQuality(index) {
      if (hls) hls.currentLevel = index === 0 ? -1 : index - 1;
    },

    setAudioTrack(index) {
      if (hls) hls.audioTrack = index;
    },
  };
}
```

- [ ] **Step 4: Register the provider in `src/player.ts`**

Add `import { hlsProvider } from './providers/hls';` and change `const providers: MediaProvider[] = [html5Provider()];` to `const providers: MediaProvider[] = [html5Provider(), hlsProvider()];`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/providers/hls.test.ts tests/player.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/providers/hls.ts src/player.ts tests/providers/hls.test.ts
git commit -m "feat(providers): add lazy hls.js provider"
```

### Task 8.2: PlayerJS option mapping

**Files:**
- Create: `src/compat/options.ts`
- Test: `tests/compat/options.test.ts`

- [ ] **Step 1: Write the failing test `tests/compat/options.test.ts`**

```ts
import { describe, expect, it, vi } from 'vitest';
import { mapPlayerjsOptions } from '../../src/compat/options';
import { createLogger } from '../../src/core/logger';

const log = createLogger(false);

describe('mapPlayerjsOptions', () => {
  it('maps PlayerJS names, 0/1 flags and numbers', () => {
    const out = mapPlayerjsOptions(
      {
        id: 'player',
        file: '[720p]a.mp4',
        poster: 'p.jpg',
        title: 'T',
        autoplay: 1,
        loop: '0',
        volume: '0.5',
        start: 10,
        end: -5,
        ratio: '4:3',
        default_quality: 'max',
        forbidden_quality: '1080p',
        qualities: '480p,720p',
        default_audio: 'Ru',
        rename_audio: { 0: 'Русский' },
        default_speed: '1.25',
        default_subtitle: 'En',
        subtitle: '[En]en.vtt',
        subtitle_start: 0,
        subshift: '-5',
        thumbnails: 't.vtt',
        autonext: 0,
        playlistloop: 1,
        plstart: 's2',
        hideplaylist: 0,
        cuid: 'c1',
        hls: 1,
        hlsconfig: { maxBufferLength: 5 },
        log: 1,
        color1: '#f00',
        color3: '#00f',
      },
      log,
    );
    expect(out).toEqual({
      container: 'player',
      source: '[720p]a.mp4',
      poster: 'p.jpg',
      title: 'T',
      autoplay: true,
      loop: false,
      volume: 0.5,
      start: 10,
      end: -5,
      ratio: '4:3',
      defaultQuality: 'max',
      forbiddenQuality: '1080p',
      qualities: '480p,720p',
      defaultAudio: 'Ru',
      renameAudio: { 0: 'Русский' },
      defaultSpeed: 1.25,
      defaultSubtitle: 'En',
      subtitle: '[En]en.vtt',
      subtitleStart: false,
      subshift: -5,
      thumbnails: 't.vtt',
      autonext: false,
      playlistLoop: true,
      plstart: 's2',
      hidePlaylist: false,
      cuid: 'c1',
      forceType: 'hls',
      hlsConfig: { maxBufferLength: 5 },
      log: true,
      theme: { color1: '#f00', color3: '#00f' },
    });
  });

  it('parses hlsconfig given as a JSON string', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(mapPlayerjsOptions({ id: 'p', hlsconfig: '{"maxBufferLength":3}' }, log).hlsConfig).toEqual({ maxBufferLength: 3 });
    expect(mapPlayerjsOptions({ id: 'p', hlsconfig: '{bad' }, log).hlsConfig).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('ignores compat-only keys, warns on unknown keys and requires id', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out = mapPlayerjsOptions({ id: 'p', nocontrols: 1, ready: 'fn', postmessage: 1, postmessageOrigin: 'https://a', mystery: 1 }, log);
    expect(out).toEqual({ container: 'p' });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(() => mapPlayerjsOptions({} as never, log)).toThrow(/id/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/compat/options.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/compat/options.ts`**

```ts
import type { Logger, PlayerOptions, ThemeVars } from '../types';

export interface PlayerjsOptions {
  id: string;
  file?: string;
  poster?: string;
  title?: string;
  nocontrols?: 0 | 1 | boolean;
  /** Name of a global function called with the player id after init. */
  ready?: string;
  postmessage?: 0 | 1 | boolean;
  postmessageOrigin?: string;
  [key: string]: unknown;
}

export const flag = (v: unknown) => v === true || v === 1 || v === '1' || v === 'true';
const num = (v: unknown) => Number(v);
const str = (v: unknown) => String(v);

type Mapper = (value: unknown, out: Partial<PlayerOptions>) => void;
const set =
  <K extends keyof PlayerOptions>(key: K, convert: (v: unknown) => PlayerOptions[K]): Mapper =>
  (value, out) => {
    out[key] = convert(value);
  };
const color =
  (key: keyof ThemeVars): Mapper =>
  (value, out) => {
    out.theme = { ...out.theme, [key]: String(value) };
  };

/** The only place that knows PlayerJS option names. */
const TABLE: Record<string, Mapper> = {
  id: set('container', str),
  file: set('source', str),
  poster: set('poster', str),
  title: set('title', str),
  autoplay: set('autoplay', flag),
  loop: set('loop', flag),
  volume: set('volume', num),
  start: set('start', num),
  end: set('end', num),
  ratio: set('ratio', str),
  default_quality: set('defaultQuality', str),
  forbidden_quality: set('forbiddenQuality', str),
  qualities: set('qualities', str),
  default_audio: set('defaultAudio', str),
  rename_audio: set('renameAudio', (v) => v as Record<string, string>),
  default_speed: set('defaultSpeed', num),
  default_subtitle: set('defaultSubtitle', str),
  subtitle: set('subtitle', str),
  subtitle_start: set('subtitleStart', flag),
  subshift: set('subshift', num),
  thumbnails: set('thumbnails', str),
  autonext: set('autonext', flag),
  playlistloop: set('playlistLoop', flag),
  plstart: set('plstart', str),
  hideplaylist: set('hidePlaylist', flag),
  cuid: set('cuid', str),
  hls: (value, out) => {
    if (flag(value)) out.forceType = 'hls';
  },
  hlsconfig: set('hlsConfig', (v) => {
    if (typeof v !== 'string') return v as Record<string, unknown>;
    try {
      return JSON.parse(v) as Record<string, unknown>;
    } catch {
      console.warn('[vp] Playerjs: hlsconfig is not valid JSON; ignored');
      return undefined;
    }
  }),
  log: set('log', flag),
  color1: color('color1'),
  color2: color('color2'),
  color3: color('color3'),
};

/** Handled by the Playerjs class itself, not mapped to PlayerOptions. */
const COMPAT_ONLY = new Set(['nocontrols', 'ready', 'postmessage', 'postmessageOrigin']);

export function mapPlayerjsOptions(input: PlayerjsOptions, log: Logger): PlayerOptions {
  if (!input || !input.id) throw new Error('[vp] Playerjs: the "id" option is required');
  const out: Partial<PlayerOptions> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || COMPAT_ONLY.has(key)) continue;
    const mapper = TABLE[key];
    if (mapper) mapper(value, out);
    else log.warn(`Playerjs: unknown option "${key}" ignored`);
  }
  return out as PlayerOptions;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/compat/options.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/compat/options.ts tests/compat/options.test.ts
git commit -m "feat(compat): map PlayerJS options to player options"
```

## Chunk 8b: Compat bridges, Playerjs facade and UMD build

### Task 8.3: Events and postMessage bridges

**Files:**
- Create: `src/compat/events.ts`, `src/compat/postmessage.ts`
- Test: `tests/compat/bridges.test.ts`

- [ ] **Step 1: Write the failing test `tests/compat/bridges.test.ts`**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bridgeEvents } from '../../src/compat/events';
import { bridgePostMessage } from '../../src/compat/postmessage';
import { createEventBus } from '../../src/core/events';

afterEach(() => {
  delete (window as unknown as { PlayerjsEvents?: unknown }).PlayerjsEvents;
});

describe('bridgeEvents', () => {
  it('calls PlayerjsEvents and dispatches DOM events for public events only', () => {
    const bus = createEventBus();
    const container = document.createElement('div');
    const global = vi.fn();
    (window as unknown as { PlayerjsEvents: unknown }).PlayerjsEvents = global;
    const dom = vi.fn();
    container.addEventListener('time', dom);
    const off = bridgeEvents(bus, container, 'player');
    bus.emit('time', 5);
    bus.emit('ui:timeline-leave');
    expect(global).toHaveBeenCalledTimes(1);
    expect(global).toHaveBeenCalledWith('time', 'player', 5);
    expect((dom.mock.calls[0]![0] as CustomEvent).detail).toBe(5);
    off();
    bus.emit('time', 6);
    expect(global).toHaveBeenCalledTimes(1);
  });

  it('survives a throwing PlayerjsEvents', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const bus = createEventBus();
    (window as unknown as { PlayerjsEvents: unknown }).PlayerjsEvents = () => {
      throw new Error('x');
    };
    bridgeEvents(bus, document.createElement('div'), 'p');
    expect(() => bus.emit('play')).not.toThrow();
  });
});

describe('bridgePostMessage', () => {
  function fakeWindow() {
    const listeners: Array<(e: MessageEvent) => void> = [];
    const parent = { postMessage: vi.fn() };
    const win = {
      parent,
      addEventListener: (_type: string, fn: (e: MessageEvent) => void) => listeners.push(fn),
      removeEventListener: vi.fn(),
    } as unknown as Window;
    const send = (data: unknown, origin = 'https://host', source: unknown = parent) =>
      listeners.forEach((fn) => fn({ data, origin, source } as unknown as MessageEvent));
    return { win, parent, send };
  }

  it('runs api commands from the parent and answers getters', () => {
    const { win, parent, send } = fakeWindow();
    const api = vi.fn((cmd: string, arg?: unknown) => (cmd === 'time' ? 12 : arg === undefined ? undefined : undefined));
    bridgePostMessage({ api, events: createEventBus(), id: 'p', win });
    send({ api: 'volume', set: 0.5 });
    send({ api: 'time' });
    expect(api).toHaveBeenNthCalledWith(1, 'volume', 0.5);
    expect(api).toHaveBeenNthCalledWith(2, 'time');
    expect(parent.postMessage).toHaveBeenCalledWith({ event: 'time', answer: 12 }, 'https://host');
  });

  it('ignores other sources, wrong origins and malformed messages', () => {
    const { win, send } = fakeWindow();
    const api = vi.fn();
    bridgePostMessage({ api, events: createEventBus(), id: 'p', win, origin: 'https://host' });
    send({ api: 'play' }, 'https://evil');
    send({ api: 'play' }, 'https://host', {});
    send('play');
    send({ api: 42 });
    expect(api).not.toHaveBeenCalled();
  });

  it('forwards public events to the parent', () => {
    const { win, parent } = fakeWindow();
    const bus = createEventBus();
    bridgePostMessage({ api: vi.fn(), events: bus, id: 'p', win });
    bus.emit('pause');
    bus.emit('ui:menu', { open: true });
    expect(parent.postMessage).toHaveBeenCalledTimes(1);
    expect(parent.postMessage).toHaveBeenCalledWith({ event: 'pause', id: 'p', data: undefined }, '*');
  });

  it('does not forward events when not inside an iframe', () => {
    const postMessage = vi.spyOn(window, 'postMessage');
    const bus = createEventBus();
    bridgePostMessage({ api: vi.fn(), events: bus, id: 'p' });
    bus.emit('pause');
    expect(postMessage).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/compat/bridges.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `src/compat/events.ts`**

```ts
import type { EventBus, EventName } from '../types';
import { PLAYERJS_EVENTS } from '../api/events-list';

const PUBLIC = new Set<EventName>(PLAYERJS_EVENTS);

/** PlayerJS-style events: global `PlayerjsEvents(event, id, data)` and DOM CustomEvents on the container. */
export function bridgeEvents(events: EventBus, container: HTMLElement, id: string): () => void {
  return events.onAny((name, data) => {
    if (!PUBLIC.has(name)) return;
    const handler = (window as unknown as { PlayerjsEvents?: unknown }).PlayerjsEvents;
    if (typeof handler === 'function') {
      try {
        handler(name, id, data);
      } catch (e) {
        console.error('[vp] PlayerjsEvents handler failed', e);
      }
    }
    container.dispatchEvent(new CustomEvent(name, { detail: data }));
  });
}
```

- [ ] **Step 4: Implement `src/compat/postmessage.ts`**

```ts
import type { EventBus, EventName } from '../types';
import { PLAYERJS_EVENTS } from '../api/events-list';

const PUBLIC = new Set<EventName>(PLAYERJS_EVENTS);

export interface PostMessageBridgeOptions {
  api: (cmd: string, arg?: unknown) => unknown;
  events: EventBus;
  id: string;
  /** Accept commands only from this origin and post events only to it. */
  origin?: string;
  win?: Window;
}

/** Iframe embedding: `{ api, set }` commands from the parent, `{ event, id, data }` events to the parent. */
export function bridgePostMessage(o: PostMessageBridgeOptions): () => void {
  const win = o.win ?? window;
  const parent = win.parent;

  const onMessage = (e: MessageEvent) => {
    if (e.source !== parent) return;
    if (o.origin && e.origin !== o.origin) return;
    const data = e.data as { api?: unknown; set?: unknown } | null;
    if (!data || typeof data !== 'object' || typeof data.api !== 'string') return;
    const answer = 'set' in data ? o.api(data.api, data.set) : o.api(data.api);
    if (answer !== undefined && !(answer instanceof Promise)) {
      (e.source as Window).postMessage({ event: data.api, answer }, !e.origin || e.origin === 'null' ? '*' : e.origin);
    }
  };
  win.addEventListener('message', onMessage as EventListener);

  const offEvents =
    parent && parent !== win
      ? o.events.onAny((name, data) => {
          if (!PUBLIC.has(name)) return;
          try {
            parent.postMessage({ event: name, id: o.id, data }, o.origin ?? '*');
          } catch {
            /* non-cloneable payload */
          }
        })
      : () => {};

  return () => {
    win.removeEventListener('message', onMessage as EventListener);
    offEvents();
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/compat/bridges.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/compat/events.ts src/compat/postmessage.ts tests/compat/bridges.test.ts
git commit -m "feat(compat): bridge events to PlayerjsEvents, DOM and postMessage"
```

### Task 8.4: `Playerjs` class

**Files:**
- Create: `src/compat/playerjs.ts`
- Modify: `src/index.ts` (export compat)
- Test: `tests/compat/playerjs.test.ts`

- [ ] **Step 1: Write the failing test `tests/compat/playerjs.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Playerjs } from '../../src/compat/playerjs';
import { installFakeMedia } from '../helpers/fake-media';

let instance: Playerjs | null;

beforeEach(() => {
  localStorage.clear();
  document.body.replaceChildren();
  const host = document.createElement('div');
  host.id = 'player';
  document.body.append(host);
  instance = null;
});
afterEach(() => {
  instance?.api('destroy');
  delete (window as unknown as Record<string, unknown>).PlayerjsEvents;
  delete (window as unknown as Record<string, unknown>).onPlayerReady;
});

describe('Playerjs', () => {
  it('creates a player in #id with default plugins and the default layout', () => {
    instance = new Playerjs({ id: 'player', title: 'Hello' });
    expect(document.querySelector('#player .vp-root .vp-toolbar')).not.toBeNull();
    expect(instance.api('title')).toBe('Hello');
    expect(instance.player.id).toBe('player');
  });

  it('delivers init and later events to PlayerjsEvents and DOM listeners', () => {
    const calls: Array<[string, string, unknown]> = [];
    (window as unknown as { PlayerjsEvents: unknown }).PlayerjsEvents = (e: string, id: string, data: unknown) => calls.push([e, id, data]);
    instance = new Playerjs({ id: 'player' });
    installFakeMedia(instance.player.video);
    const dom = vi.fn();
    document.getElementById('player')!.addEventListener('volume', dom);
    instance.api('volume', 0.4);
    expect(calls[0]).toEqual(['init', 'player', undefined]);
    expect(calls).toContainEqual(['volume', 'player', 0.4]);
    expect(dom).toHaveBeenCalled();
  });

  it('calls the ready function and supports nocontrols', () => {
    const ready = vi.fn();
    (window as unknown as { onPlayerReady: unknown }).onPlayerReady = ready;
    instance = new Playerjs({ id: 'player', ready: 'onPlayerReady', nocontrols: 1 });
    expect(ready).toHaveBeenCalledWith('player');
    expect(document.querySelector('#player .vp-toolbar')).toBeNull();
    expect(document.querySelector('#player .vp-click-layer')).not.toBeNull();
  });

  it('answers postMessage commands from the parent window', () => {
    instance = new Playerjs({ id: 'player', postmessage: 1, title: 'T' });
    const reply = vi.spyOn(window, 'postMessage').mockImplementation(() => {});
    window.dispatchEvent(new MessageEvent('message', { data: { api: 'title' }, source: window, origin: 'https://host' }));
    expect(reply).toHaveBeenCalledWith({ event: 'title', answer: 'T' }, 'https://host');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/compat/playerjs.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/compat/playerjs.ts`**

```ts
import type { Player, Plugin } from '../types';
import { createPlayer } from '../player';
import { createLogger } from '../core/logger';
import { defaultPlugins } from '../plugins';
import { bridgeEvents } from './events';
import { bridgePostMessage } from './postmessage';
import { flag, mapPlayerjsOptions, type PlayerjsOptions } from './options';

export type { PlayerjsOptions } from './options';

/** Drop-in style facade: `new Playerjs({ id, file, ... })` + `player.api(cmd, arg)`. */
export class Playerjs {
  readonly player: Player;

  constructor(opts: PlayerjsOptions) {
    const log = createLogger(flag(opts.log));
    const options = mapPlayerjsOptions(opts, log);

    // Installed as the first plugin so the bridges see `init`.
    const compat: Plugin = {
      name: 'playerjs-compat',
      setup(ctx) {
        const offs: Array<() => void> = [bridgeEvents(ctx.events, ctx.player.container, ctx.player.id)];
        if (flag(opts.postmessage)) {
          offs.push(bridgePostMessage({ api: (cmd, arg) => ctx.player.api(cmd, arg), events: ctx.events, id: ctx.player.id, origin: opts.postmessageOrigin }));
        }
        if (typeof opts.ready === 'string') {
          const name = opts.ready;
          offs.push(
            ctx.events.once('init', () => {
              const fn = (window as unknown as Record<string, unknown>)[name];
              if (typeof fn === 'function') fn(ctx.player.id);
              else ctx.log.warn(`Playerjs: ready function "${name}" not found`);
            }),
          );
        }
        return () => offs.forEach((off) => off());
      },
    };

    if (flag(opts.nocontrols)) options.layout = { type: 'root', children: [{ type: 'media-click-layer' }] };
    this.player = createPlayer({ ...options, plugins: [compat, ...defaultPlugins()] });
  }

  api(cmd: string, arg?: unknown): unknown {
    return this.player.api(cmd, arg);
  }
}
```

- [ ] **Step 4: Export compat from `src/index.ts`** — append:

```ts
export { Playerjs } from './compat/playerjs';
export type { PlayerjsOptions } from './compat/playerjs';
export { mapPlayerjsOptions } from './compat/options';
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/compat/playerjs.test.ts`
Expected: PASS. (jsdom accepts `window` as `MessageEvent.source`; in jsdom `window.parent === window`, so the inbound check passes and no outbound events are posted.)

- [ ] **Step 6: Commit**

```bash
git add src/compat/playerjs.ts src/index.ts tests/compat/playerjs.test.ts
git commit -m "feat(compat): add Playerjs facade"
```

### Task 8.5: UMD entry and library build

**Files:**
- Create: `src/umd.ts`, `vite.umd.config.ts`
- Test: `tests/umd.test.ts`

- [ ] **Step 1: Write the failing test `tests/umd.test.ts`**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).Playerjs;
  delete (window as unknown as Record<string, unknown>).PlayerjsAsync;
  vi.resetModules();
});

describe('umd entry', () => {
  it('exposes window.Playerjs and calls PlayerjsAsync', async () => {
    const async = vi.fn();
    (window as unknown as { PlayerjsAsync: unknown }).PlayerjsAsync = async;
    const mod = await import('../src/umd');
    expect((window as unknown as { Playerjs: unknown }).Playerjs).toBe(mod.Playerjs);
    expect(typeof mod.createPlayer).toBe('function');
    expect(async).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/umd.test.ts`
Expected: FAIL — cannot resolve `../src/umd`.

- [ ] **Step 3: Implement `src/umd.ts`**

```ts
import { Playerjs } from './compat/playerjs';

export * from './index';

if (typeof window !== 'undefined') {
  const w = window as unknown as { Playerjs?: unknown; PlayerjsAsync?: unknown };
  w.Playerjs = Playerjs;
  if (typeof w.PlayerjsAsync === 'function') {
    try {
      (w.PlayerjsAsync as () => void)();
    } catch (e) {
      console.error('[vp] PlayerjsAsync failed', e);
    }
  }
}
```

- [ ] **Step 4: Create `vite.umd.config.ts`**

```ts
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/umd.ts',
      name: 'VP',
      formats: ['umd'],
      fileName: () => 'player.umd.cjs',
    },
    emptyOutDir: false,
    sourcemap: true,
    target: 'es2020',
  },
});
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/umd.test.ts`
Expected: PASS.

- [ ] **Step 6: Build and verify the artifacts**

Run: `npm run build && ls dist && node -e "const vp=require('./dist/player.umd.cjs'); console.log(typeof vp.createPlayer, typeof vp.Playerjs, typeof vp.defaultPlugins)" && grep -c "vp-root" dist/player.js`
Expected: `dist` lists `player.js`, `player.umd.cjs`, their `.map` files and `types/`; node prints `function function function`; grep prints a number ≥ 1 (CSS inlined). If `require` fails because the bundle touches `document` at import time, find the top-level DOM access and move it into a function.

- [ ] **Step 7: Check that the declarations are complete**

Run: `ls dist/types && grep -c "createPlayer" dist/types/index.d.ts`
Expected: `index.d.ts`, `types.d.ts`, `player.d.ts` and subfolders exist; grep prints ≥ 1.

- [ ] **Step 8: Run the whole suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: all pass; typecheck exits 0.

- [ ] **Step 9: Commit**

```bash
git add src/umd.ts vite.umd.config.ts tests/umd.test.ts
git commit -m "build: add UMD entry and library build"
```
