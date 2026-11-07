import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createPublicData } from '../src/preview-data.js';

describe('public Pages preview', () => {
  it('exposes only the public demo catalogue, without account configuration', async () => {
    const data = createPublicData(async () => { throw new Error('No network needed for catalogue'); });
    const library = await data.loadLibrary();
    assert.equal(library.videos.length, 6);
    assert.equal(library.demo, true);
    assert.equal('streamId' in library.videos[0], false);
  });
  it('resolves fresh caption URLs from Stream, without a Worker or API token', async () => {
    let sequence = 0;
    const calls: string[] = [];
    const data = createPublicData(async input => {
      const url = String(input); calls.push(url);
      assert.ok(url.startsWith('https://customer-rhnwzxvb3mg4wz3v.cloudflarestream.com/'));
      if (url.endsWith('/video.m3u8')) return new Response('#EXTM3U\n#EXT-X-MEDIA:TYPE=SUBTITLES,LANGUAGE="en",URI="text/en.m3u8"');
      return new Response(`#EXTM3U\n../en.vtt?signature=${++sequence}\n`);
    });
    const first = await data.loadPlayback('stream-live');
    const second = await data.loadPlayback('stream-live');
    assert.ok(first.source.endsWith('/manifest/video.m3u8'));
    assert.ok(first.captions[0].url.endsWith('/manifest/en.vtt?signature=1'));
    assert.ok(second.captions[0].url.endsWith('/manifest/en.vtt?signature=2'));
    assert.equal(calls.length, 4);
  });
  it('keeps video playable if public captions are unavailable', async () => {
    const data = createPublicData(async () => new Response('unavailable', { status: 503 }));
    const playback = await data.loadPlayback('stream-live');
    assert.equal(playback.captions.length, 0);
    assert.equal(playback.captionsUnavailable, true);
    assert.ok(playback.source.endsWith('/manifest/video.m3u8'));
  });
  it('rejects unknown video IDs without making a network request', async () => {
    const data = createPublicData(async () => { throw new Error('Must not fetch'); });
    await assert.rejects(data.loadPlayback('../account-secrets'), /not in the library/);
  });
  it('propagates navigation cancellation instead of rendering an obsolete video', async () => {
    const signal = AbortSignal.abort();
    const data = createPublicData(async () => { throw new DOMException('Aborted', 'AbortError'); });
    await assert.rejects(data.loadPlayback('stream-live', signal), { name: 'AbortError' });
  });
});
