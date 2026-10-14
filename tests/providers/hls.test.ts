import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_HLS_INTEGRITY, DEFAULT_HLS_URL, hlsProvider, loadHlsScript, resetHlsLoader, type HlsConstructor } from '../../src/providers/hls.js';
import { createLogger } from '../../src/core/logger.js';
import type { PlayerError, ProviderContext, Quality, SourceSpec, TrackInfo } from '../../src/types.js';

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
  const hls = FakeHls.instances[FakeHls.instances.length - 1]!;
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

  it('rejects immediately on a fatal error before metadata, without retrying', async () => {
    const a = await loaded();
    a.hls.emit(FakeHls.Events.ERROR, { fatal: true, type: 'networkError', details: 'manifestLoadError' });
    await expect(a.loading).rejects.toEqual({ kind: 'network', message: 'manifestLoadError' });
    expect(a.hls.startLoad).not.toHaveBeenCalled();

    const b = await loaded();
    b.hls.emit(FakeHls.Events.ERROR, { fatal: true, type: 'networkError', details: 'manifestLoadError', response: { code: 404 } });
    await expect(b.loading).rejects.toEqual({ kind: 'not-found', message: 'manifestLoadError' });

    const c = await loaded();
    c.hls.emit(FakeHls.Events.ERROR, { fatal: true, type: 'mediaError', details: 'bufferStalled' });
    await expect(c.loading).rejects.toEqual({ kind: 'decode', message: 'bufferStalled' });
    expect(c.hls.recoverMediaError).not.toHaveBeenCalled();
  });

  it('recovers once from fatal network and media errors after metadata, then reports', async () => {
    const { loading, hls } = await loaded();
    video.dispatchEvent(new Event('loadedmetadata'));
    await loading;
    hls.emit(FakeHls.Events.ERROR, { fatal: true, type: 'networkError', details: 'fragLoadError' });
    expect(hls.startLoad).toHaveBeenCalledTimes(1);
    hls.emit(FakeHls.Events.ERROR, { fatal: true, type: 'mediaError', details: 'bufferStalled' });
    expect(hls.recoverMediaError).toHaveBeenCalledTimes(1);
    expect(errors).toEqual([]);
    hls.emit(FakeHls.Events.ERROR, { fatal: true, type: 'networkError', details: 'fragLoadError' });
    expect(errors).toEqual([{ kind: 'network', message: 'fragLoadError' }]);
  });

  it('publishes audio tracks from AUDIO_TRACKS_UPDATED', async () => {
    const { hls } = await loaded();
    const tracks = hls.audioTracks;
    hls.audioTracks = [];
    hls.emit(FakeHls.Events.MANIFEST_PARSED);
    expect(audio).toEqual([]);
    hls.audioTracks = tracks;
    hls.emit(FakeHls.Events.AUDIO_TRACKS_UPDATED);
    expect(audio[0]).toEqual([[{ label: 'English', lang: 'en' }, { label: 'Русский', lang: 'ru' }], 0]);
  });

  it('drops a load superseded by detach and a new load', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const p = hlsProvider({ loader: async () => (await gate, FakeHls as unknown as HlsConstructor) });
    p.attach(video, ctx);
    const a = p.load('a.m3u8', 0);
    const aResult = a.then(() => 'ok', (e) => e);
    p.detach();
    p.attach(video, ctx);
    const b = p.load('b.m3u8', 0);
    release();
    await expect(aResult).resolves.toEqual({ kind: 'unknown', message: 'superseded' });
    await Promise.resolve();
    expect(FakeHls.instances).toHaveLength(1);
    expect(FakeHls.instances[0]!.loadSource).toHaveBeenCalledWith('b.m3u8');
    video.dispatchEvent(new Event('loadedmetadata'));
    await expect(b).resolves.toBeUndefined();
  });

  it('loads the pinned hls.js with SRI by default and no integrity for a custom hlsUrl', async () => {
    const p = hlsProvider();
    p.attach(video, ctx);
    const loading = p.load('a.m3u8', 0);
    const script = document.head.querySelector(`script[src="${DEFAULT_HLS_URL}"]`) as HTMLScriptElement;
    expect(DEFAULT_HLS_URL).toContain('hls.js@1.7.3');
    expect(script.integrity).toBe(DEFAULT_HLS_INTEGRITY);
    expect(script.crossOrigin).toBe('anonymous');
    script.dispatchEvent(new Event('error'));
    await expect(loading).rejects.toMatchObject({ kind: 'unsupported' });

    ctx.options = { ...ctx.options, hlsUrl: 'https://own/hls.js' };
    const q = hlsProvider();
    q.attach(video, ctx);
    const loading2 = q.load('a.m3u8', 0);
    const custom = document.head.querySelector('script[src="https://own/hls.js"]') as HTMLScriptElement;
    expect(custom.hasAttribute('integrity')).toBe(false);
    expect(custom.hasAttribute('crossorigin')).toBe(false);
    custom.dispatchEvent(new Event('error'));
    await expect(loading2).rejects.toMatchObject({ kind: 'unsupported' });
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
