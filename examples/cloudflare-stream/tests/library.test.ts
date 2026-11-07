import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/worker.js';
import config from '../library.config.js';
import { readProgress, recordProgress, continuingVideos } from '../src/history.js';
import { captionPlaylistUrl, captionFileUrl } from '../src/public-captions.js';

describe('a useful demo catalogue', () => {
  it('offers distinct, attributed recordings in multiple topics with genuine captions', async () => {
    const app = createApp({ config: { ...config, demo: true } });
    const library = await (await app.request('/api/library')).json() as { videos: { slug: string; sourceUrl?: string; recordedAt?: string; duration?: number; chapters?: { time: number }[] }[] };
    assert.ok(library.videos.length >= 5, 'A catalogue needs more than one demonstration video');
    assert.ok(new Set(library.videos.map(v => v.slug)).size === library.videos.length);
    const sources = new Set<string>();
    for (const video of library.videos) {
      assert.match(video.sourceUrl ?? '', /^https:\/\/cloudflare\.tv\//);
      assert.match(video.recordedAt ?? '', /^\d{4}-\d{2}-\d{2}$/);
      assert.ok((video.duration ?? 0) > 60);
      assert.ok((video.chapters?.length ?? 0) >= 3);
      const playback = await (await app.request(`/api/videos/${video.slug}`)).json() as { source: string; captions: { url: string }[] };
      sources.add(playback.source);
      assert.equal(playback.captions[0]?.url, `/api/videos/${video.slug}/captions/en`);
    }
    assert.equal(sources.size, library.videos.length, 'Cards must play different videos');
  });
});

describe('demo caption delivery', () => {
  it('serves original captions through fresh, allowlisted public manifests', async () => {
    const app = createApp({ config: { ...config, demo: true }, fetch: async (input, init) => {
      assert.notEqual(init?.redirect, 'follow');
      const url = String(input);
      if (url.endsWith('/video.m3u8')) return new Response('#EXTM3U\n#EXT-X-MEDIA:TYPE=SUBTITLES,LANGUAGE="en",URI="captions.m3u8"');
      if (url.endsWith('/captions.m3u8')) return new Response('#EXTM3U\n#EXTINF:60,\n../text/en.vtt?p=fresh\n#EXT-X-ENDLIST');
      if (url.endsWith('/text/en.vtt?p=fresh')) return new Response('WEBVTT\n\n00:00.000 --> 00:03.000\nOriginal captions');
      throw new Error('Unexpected URL');
    } });
    const response = await app.request('/api/videos/stream-live/captions/en');
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Original captions/);
    assert.equal((await app.request('/api/videos/stream-live/captions/de')).status, 404);
  });
});

describe('local viewing history', () => {
  it('restores only finite, safe progress and handles blocked or corrupted storage', () => {
    assert.deepEqual(readProgress(null), {});
    assert.deepEqual(readProgress('broken'), {});
    assert.deepEqual(readProgress('{"x":{"time":-1,"duration":60,"updatedAt":1}}'), {});
    assert.deepEqual(readProgress('{"a":{"time":12,"duration":60,"updatedAt":1,"completed":false}}'), { a: { time: 12, duration: 60, updatedAt: 1, completed: false } });
  });
  it('keeps distinct progress per video and preserves completed state', () => {
    let history = recordProgress({}, 'first', 45, 300, 10);
    history = recordProgress(history, 'second', 25, 200, 20);
    assert.deepEqual(continuingVideos(history, ['first', 'second']).map(v => v.slug), ['second', 'first']);
    history = recordProgress(history, 'second', 200, 200, 30, true);
    history = recordProgress(history, 'second', 200, 200, 31);
    assert.equal(history.second.completed, true);
    assert.deepEqual(continuingVideos(history, ['first', 'second']).map(v => v.slug), ['first']);
  });
  it('excludes removed videos, near-finished clips and trivial progress', () => {
    let history = recordProgress({}, 'first', 4, 300, 1);
    history = recordProgress(history, 'second', 295, 300, 2);
    history = recordProgress(history, 'gone', 40, 300, 3);
    assert.deepEqual(continuingVideos(history, ['first', 'second']), []);
  });
});

describe('fresh public Stream captions', () => {
  const source = 'https://customer-example.cloudflarestream.com/abc/manifest/video.m3u8';
  it('resolves the requested language and signed VTT URL from fresh manifests', () => {
    const master = '#EXTM3U\n#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="sub",LANGUAGE="en",NAME="English",URI="captions-en.m3u8"';
    const playlist = captionPlaylistUrl(master, source, 'en');
    assert.equal(playlist, 'https://customer-example.cloudflarestream.com/abc/manifest/captions-en.m3u8');
    assert.equal(captionFileUrl('#EXTM3U\n#EXTINF:60,\n../text/en.vtt?p=fresh&s=signature\n#EXT-X-ENDLIST', playlist!), 'https://customer-example.cloudflarestream.com/abc/text/en.vtt?p=fresh&s=signature');
    assert.equal(captionPlaylistUrl(master, source, 'de'), null);
  });
  it('rejects off-origin URLs and segmented subtitle playlists', () => {
    const malicious = '#EXTM3U\n#EXT-X-MEDIA:TYPE=SUBTITLES,LANGUAGE="en",URI="https://other.example/private"';
    assert.equal(captionPlaylistUrl(malicious, source, 'en'), null);
    assert.equal(captionFileUrl('#EXTM3U\nhttps://other.example/track.vtt', source), null);
    assert.equal(captionFileUrl('#EXTM3U\none.vtt\ntwo.vtt', source), null);
  });
});
