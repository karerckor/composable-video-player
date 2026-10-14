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
    expect(video.load).not.toHaveBeenCalled();
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
