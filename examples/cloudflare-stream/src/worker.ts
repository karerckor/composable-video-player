import { Hono } from 'hono';
import library from '../library.config.js';
import { StreamError, streamClient, type Bindings, type Fetcher } from './stream.js';
import type { LibraryConfig, LibraryResponse, PlaybackResponse, VideoConfig } from './shared.js';
import { demoSource, demoVideos } from './demo-library.js';
import { publicCaption } from './public-captions.js';

export function createApp({ config, fetch: fetcher = globalThis.fetch }: { config: LibraryConfig; fetch?: Fetcher }) {
  const app = new Hono<{ Bindings: Bindings }>();
  const videos = config.demo ? demoVideos : config.videos;
  function find(slug: string): VideoConfig {
    const video = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? videos.find(v => v.slug === slug) : undefined;
    if (!video) throw new StreamError(404, 'This video is not in the library.');
    return video;
  }
  app.use('/api/*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    c.header('X-Content-Type-Options', 'nosniff');
    await next();
  });
  app.get('/api/library', c => c.json({
    demo: config.demo, branding: config.branding,
    videos: videos.map(({ streamId: _id, captions: _captions, ...publicVideo }) => publicVideo),
  } satisfies LibraryResponse));
  app.get('/api/videos/:slug', async c => {
    const video = find(c.req.param('slug'));
    if (config.demo) return c.json({ slug: video.slug, source: demoSource(video), poster: video.poster ?? '', duration: video.duration ?? 0, captions: [{ language: 'en', label: 'English', url: `/api/videos/${video.slug}/captions/en` }] } satisfies PlaybackResponse);
    const stream = streamClient(c.env ?? {}, fetcher);
    const details = await stream.details(video.streamId);
    if (details.requireSignedURLs) throw new StreamError(409, 'Use a public Stream video for this example. Signed playback needs an access policy.');
    if (details.status?.state === 'error') throw new StreamError(409, 'Stream could not process this video. Check it in your Cloudflare dashboard.');
    if (!details.readyToStream || !details.playback?.hls) throw new StreamError(409, 'This video is still processing. Try again shortly.');
    const captions = [...(video.captions ?? [])];
    let captionsUnavailable = false;
    try {
      const available = await stream.captions(video.streamId);
      captions.push(...available.filter(track => !captions.some(caption => caption.language === track.language)).map(track => ({
        language: track.language, label: track.label,
        url: `/api/videos/${video.slug}/captions/${encodeURIComponent(track.language)}`,
      })));
    } catch { captionsUnavailable = true; }
    return c.json({ slug: video.slug, source: details.playback.hls, poster: details.thumbnail ?? '', duration: details.duration ?? 0, captions, captionsUnavailable } satisfies PlaybackResponse);
  });
  app.get('/api/videos/:slug/captions/:language', async c => {
    const video = find(c.req.param('slug'));
    const language = c.req.param('language');
    if (!/^[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*$/.test(language)) throw new StreamError(404, 'Caption track not found.');
    if (config.demo) {
      if (language !== 'en') throw new StreamError(404, 'Caption track not found.');
      const response = await publicCaption(demoSource(video), language, fetcher);
      return new Response(response.body, { headers: { 'Content-Type': 'text/vtt; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
    }
    const stream = streamClient(c.env ?? {}, fetcher);
    const details = await stream.details(video.streamId);
    if (details.requireSignedURLs) throw new StreamError(409, 'Use a public Stream video for this example. Signed playback needs an access policy.');
    const tracks = await stream.captions(video.streamId);
    if (!tracks.some(track => track.language === language)) throw new StreamError(404, 'Caption track not found.');
    const response = await stream.captionFile(video.streamId, language);
    return new Response(response.body, { headers: { 'Content-Type': 'text/vtt; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  });
  app.all('/api/*', c => c.json({ error: 'Endpoint not found.' }, 404));
  app.onError((error, c) => error instanceof StreamError ? c.json({ error: error.message }, error.status) : c.json({ error: 'Something went wrong. Please try again.' }, 500));
  return app;
}

export default createApp({ config: library });
