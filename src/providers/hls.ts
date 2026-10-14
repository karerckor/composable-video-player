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

export const DEFAULT_HLS_URL = 'https://cdn.jsdelivr.net/npm/hls.js@1.7.3/dist/hls.min.js';
/** Subresource Integrity hash of the pinned DEFAULT_HLS_URL bundle. */
export const DEFAULT_HLS_INTEGRITY = 'sha384-cciJ0zi8d1uMKC2zJd7jvPY4HQt7W4ByUI/FlMkltvBi31aW61rcpVBhpmW8/NwX';

let pending: Promise<HlsConstructor> | null = null;

/** Loads the hls.js UMD bundle once (or reuses a page-provided window.Hls). */
export function loadHlsScript(src: string, integrity?: string): Promise<HlsConstructor> {
  const w = window as unknown as { Hls?: HlsConstructor };
  if (w.Hls) return Promise.resolve(w.Hls);
  if (pending) return pending;
  const loading = new Promise<HlsConstructor>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    if (integrity) {
      script.integrity = integrity;
      script.crossOrigin = 'anonymous';
    }
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
  loader?: (src: string, integrity?: string) => Promise<HlsConstructor>;
}

export function hlsProvider(o: HlsProviderOptions = {}): MediaProvider {
  let video: HTMLVideoElement | null = null;
  let ctx: ProviderContext | null = null;
  let hls: HlsInstance | null = null;
  let cleanupLoad: (() => void) | null = null;
  let loadId = 0;

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
      const id = ++loadId;
      if (!video || !c) throw { kind: 'unknown', message: 'hls provider is not attached' } satisfies PlayerError;
      let Hls: HlsConstructor;
      try {
        const { hlsUrl, hlsIntegrity } = c.options;
        Hls = await (o.loader ?? loadHlsScript)(hlsUrl ?? DEFAULT_HLS_URL, hlsUrl ? hlsIntegrity : (hlsIntegrity ?? DEFAULT_HLS_INTEGRITY));
      } catch (e) {
        throw { kind: 'unsupported', message: `hls.js failed to load: ${String(e)}` } satisfies PlayerError;
      }
      if (id !== loadId) throw { kind: 'unknown', message: 'superseded' } satisfies PlayerError;
      const media = video;
      if (!media) throw { kind: 'unknown', message: 'hls provider was detached' } satisfies PlayerError;
      destroyHls();
      // A user-provided startPosition wins unless the player asks for a specific start time.
      const instance = new Hls({ startPosition: -1, ...(c.options.hlsConfig ?? {}), ...(startTime > 0 ? { startPosition: startTime } : {}) });
      hls = instance;

      return new Promise<void>((resolve, reject) => {
        let state: 'loading' | 'loaded' | 'failed' = 'loading';
        let networkRetried = false;
        let mediaRetried = false;

        const onMeta = () => {
          if (state !== 'loading') return;
          state = 'loaded';
          cleanupLoad?.();
          resolve();
        };
        media.addEventListener('loadedmetadata', onMeta);
        cleanupLoad = () => {
          media.removeEventListener('loadedmetadata', onMeta);
          cleanupLoad = null;
        };

        const publishAudio = () => {
          if (instance.audioTracks.length > 1) {
            c.setAudioTracks(
              instance.audioTracks.map((t, i) => ({ label: t.name || t.lang || String(i + 1), lang: t.lang })),
              Math.max(0, instance.audioTrack),
            );
          }
        };

        instance.on(Hls.Events.MANIFEST_PARSED!, () => {
          if (instance.levels.length > 1) c.setQualities([{ label: 'auto' }, ...levelLabels(instance.levels)], 0);
          publishAudio();
        });
        if (Hls.Events.AUDIO_TRACKS_UPDATED) instance.on(Hls.Events.AUDIO_TRACKS_UPDATED, publishAudio);

        instance.on(Hls.Events.ERROR!, (_event, data: { fatal?: boolean; type?: string; details?: string; response?: { code?: number } }) => {
          if (!data.fatal || state === 'failed') return;
          const isNetwork = data.type === Hls.ErrorTypes.NETWORK_ERROR;
          const isMedia = data.type === Hls.ErrorTypes.MEDIA_ERROR;
          // After metadata, try hls.js recovery once per kind. Before it, hls.js has already
          // exhausted its own retries, so retrying here could hang the load forever.
          if (state === 'loaded') {
            if (isNetwork && !networkRetried) {
              networkRetried = true;
              instance.startLoad();
              return;
            }
            if (isMedia && !mediaRetried) {
              mediaRetried = true;
              instance.recoverMediaError();
              return;
            }
          }
          const kind: ErrorKind = data.response?.code === 404 ? 'not-found' : isNetwork ? 'network' : isMedia ? 'decode' : 'unknown';
          const error: PlayerError = { kind, message: data.details ?? 'hls.js error' };
          if (state === 'loading') {
            state = 'failed';
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
      loadId++;
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
