// Optional live check: npm run test:stream. Ordinary unit tests stay offline.
import { it } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/worker.js';
import config from '../library.config.js';

const app = createApp({ config: { ...config, demo: true } });
const list = await (await app.request('/api/library')).json() as { videos: { slug: string; title: string }[] };
for (const video of list.videos) it(`${video.title}: live video, audio and original captions`, async () => {
  const playback = await (await app.request(`/api/videos/${video.slug}`)).json() as { source: string; captions: { url: string }[] };
  const response = await fetch(playback.source, { signal: AbortSignal.timeout(20_000) });
  assert.equal(response.status, 200);
  const manifest = await response.text();
  assert.match(manifest, /#EXT-X-STREAM-INF/);
  assert.match(manifest, /mp4a\.|TYPE=AUDIO/, 'Every demo video must contain audio');
  assert.match(manifest, /TYPE=SUBTITLES/);
  const captions = await app.request(playback.captions[0].url);
  assert.equal(captions.status, 200, await captions.clone().text());
  assert.match(await captions.text(), /WEBVTT/);
});
