import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/worker.js';
import library from '../library.config.js';
import type { LibraryConfig } from '../src/shared.js';

const video = { slug: 'first-lesson', streamId: 'a'.repeat(32), title: 'First lesson', description: 'Learn a thing', category: 'Guides', chapters: [{ time: 0, title: 'Intro' }] };
const config: LibraryConfig = { ...library, demo: false, videos: [video] };
const env = { CLOUDFLARE_ACCOUNT_ID: 'b'.repeat(32), CLOUDFLARE_STREAM_API_TOKEN: 'server-only-secret' };
const details = { readyToStream: true, requireSignedURLs: false, duration: 60, playback: { hls: 'https://customer-test.cloudflarestream.com/video/manifest/video.m3u8' }, thumbnail: 'https://customer-test.cloudflarestream.com/video/thumbnails/thumbnail.jpg' };
function upstream(result: unknown, status = 200) {
  return new Response(JSON.stringify({ success: status === 200, result, errors: [{ message: 'server-only-secret' }] }), { status, headers: { 'Content-Type': 'application/json' } });
}
function makeApp(overrides: Partial<typeof details> = {}, status = 200) {
  return createApp({ config, fetch: async (input, init) => {
    const url = String(input);
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer server-only-secret');
    if (url.endsWith('/captions')) return upstream([{ language: 'en', label: 'English', status: 'ready' }, { language: 'de', label: 'Deutsch', status: 'inprogress' }]);
    if (url.endsWith('/captions/en/vtt')) return new Response('WEBVTT\n\n00:00.000 --> 00:02.000\nHello');
    return upstream({ ...details, ...overrides }, status);
  } });
}

describe('Hono Stream integration', () => {
  it('only lists curated public metadata without account IDs or secrets', async () => {
    const response = await makeApp().request('/api/library', {}, env);
    assert.equal(response.status, 200);
    const body = await response.text();
    assert.ok(body.includes('First lesson'));
    assert.ok(!body.includes(video.streamId));
    assert.ok(!body.includes(env.CLOUDFLARE_STREAM_API_TOKEN));
  });
  it('rejects unlisted videos before touching the account API', async () => {
    const app = createApp({ config, fetch: async () => { throw new Error('must not fetch'); } });
    assert.equal((await app.request('/api/videos/unlisted', {}, env)).status, 404);
  });
  it('returns HLS, poster and only ready caption tracks', async () => {
    const response = await makeApp().request('/api/videos/first-lesson', {}, env);
    assert.equal(response.status, 200);
    const body = await response.json() as { source: string; captions: { url: string }[] };
    assert.equal(body.source, details.playback.hls);
    assert.deepEqual(body.captions.map(c => c.url), ['/api/videos/first-lesson/captions/en']);
  });
  it('serves captions without exposing the Stream API token', async () => {
    const response = await makeApp().request('/api/videos/first-lesson/captions/en', {}, env);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('Content-Type') ?? '', /text\/vtt/);
    assert.match(await response.text(), /Hello/);
  });
  it('rejects missing and processing caption languages', async () => {
    assert.equal((await makeApp().request('/api/videos/first-lesson/captions/de', {}, env)).status, 404);
    assert.equal((await makeApp().request('/api/videos/first-lesson/captions/xx', {}, env)).status, 404);
  });
  it('explains missing credentials without attempting a request', async () => {
    const response = await makeApp().request('/api/videos/first-lesson');
    assert.equal(response.status, 503);
    assert.match(await response.text(), /configured/i);
  });
  it('reports processing and signed videos with actionable messages', async () => {
    const processing = await makeApp({ readyToStream: false }).request('/api/videos/first-lesson', {}, env);
    assert.equal(processing.status, 409);
    const signed = await makeApp({ requireSignedURLs: true }).request('/api/videos/first-lesson', {}, env);
    assert.equal(signed.status, 409);
    assert.match(await signed.text(), /public/i);
  });
  it('maps provider 404s and errors without leaking provider bodies', async () => {
    assert.equal((await makeApp({}, 404).request('/api/videos/first-lesson', {}, env)).status, 404);
    const response = await makeApp({}, 500).request('/api/videos/first-lesson', {}, env);
    assert.equal(response.status, 502);
    assert.ok(!(await response.text()).includes('server-only-secret'));
  });
  it('handles network failure with a safe response', async () => {
    const app = createApp({ config, fetch: async () => { throw new Error('server-only-secret'); } });
    const response = await app.request('/api/videos/first-lesson', {}, env);
    assert.equal(response.status, 502);
    assert.ok(!(await response.text()).includes('server-only-secret'));
  });
  it('keeps captions of a signed video private too', async () => {
    const response = await makeApp({ requireSignedURLs: true }).request('/api/videos/first-lesson/captions/en', {}, env);
    assert.equal(response.status, 409);
    assert.ok(!(await response.text()).includes('WEBVTT'));
  });
  it('continues playback when Stream caption discovery is unavailable', async () => {
    const app = createApp({ config, fetch: async input => String(input).endsWith('/captions') ? upstream(null, 500) : upstream(details) });
    const response = await app.request('/api/videos/first-lesson', {}, env);
    assert.equal(response.status, 200);
    const result = await response.json() as { source: string; captions: unknown[]; captionsUnavailable: boolean };
    assert.equal(result.source, details.playback.hls);
    assert.deepEqual(result.captions, []);
    assert.equal(result.captionsUnavailable, true);
  });
  it('uses owner caption overrides for matching Stream languages', async () => {
    const app = createApp({ config: { ...config, videos: [{ ...video, captions: [{ language: 'en', label: 'Custom English', url: '/own.vtt' }] }] }, fetch: async input => String(input).endsWith('/captions') ? upstream([{ language: 'en', label: 'English' }]) : upstream(details) });
    const response = await app.request('/api/videos/first-lesson', {}, env);
    const result = await response.json() as { captions: { url: string }[] };
    assert.deepEqual(result.captions.map(c => c.url), ['/own.vtt']);
  });
  it('rejects invalid account and video IDs without requesting Stream', async () => {
    const never = async () => { throw new Error('must not reach upstream'); };
    const account = await createApp({ config, fetch: never }).request('/api/videos/first-lesson', {}, { ...env, CLOUDFLARE_ACCOUNT_ID: '../other' });
    assert.equal(account.status, 503);
    const invalid = createApp({ config: { ...config, videos: [{ ...video, streamId: '../other' }] }, fetch: never });
    assert.equal((await invalid.request('/api/videos/first-lesson', {}, env)).status, 503);
  });
  it('handles malformed and unsuccessful API envelopes', async () => {
    for (const body of ['not json', JSON.stringify({ success: false, result: { message: 'server-only-secret' } })]) {
      const app = createApp({ config, fetch: async () => new Response(body) });
      const response = await app.request('/api/videos/first-lesson', {}, env);
      assert.equal(response.status, 502);
      assert.ok(!(await response.text()).includes('server-only-secret'));
    }
  });
  it('runs the demo without credentials and leaves an empty owner catalogue empty', async () => {
    const demo = createApp({ config: { ...config, demo: true } });
    const list = await (await demo.request('/api/library')).json() as { videos: { slug: string }[] };
    assert.equal((await demo.request(`/api/videos/${list.videos[0].slug}`)).status, 200);
    const empty = createApp({ config: { ...config, videos: [] } });
    assert.deepEqual((await (await empty.request('/api/library')).json() as { videos: unknown[] }).videos, []);
  });
});
