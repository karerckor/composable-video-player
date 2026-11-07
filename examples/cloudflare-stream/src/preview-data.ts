import { demoSource, demoVideos } from './demo-library.js';
import { captionFileUrl, captionPlaylistUrl } from './public-captions.js';
import type { LibraryResponse, PlaybackResponse } from './shared.js';
import type { Fetcher } from './stream.js';

// Public-only Pages adapter. Never imports the owner's library.config or account API.
export const publicPreview = true;
export function createPublicData(fetcher: Fetcher = globalThis.fetch) {
  return {
    async loadLibrary(signal?: AbortSignal): Promise<LibraryResponse> {
      signal?.throwIfAborted();
      return {
        demo: true,
        branding: {
          name: 'Fieldnotes', description: 'A working video library built with composable-video-player. Find a chapter, share a moment, and explore the integration.', defaultScheme: 'dark',
          light: { background: '#f5f3ee', surface: '#ffffff', text: '#222720', muted: '#666d62', accent: '#547a39' },
          dark: { background: '#141813', surface: '#20261e', text: '#eff2e9', muted: '#a1ac99', accent: '#c3e88d' },
          player: { subtitleColor: '#ffffff', subtitleBackground: 'rgba(0,0,0,0.75)', subtitleSize: '1.3em', radius: '10px' },
        },
        videos: demoVideos.map(({ streamId: _id, captions: _captions, ...video }) => video),
      };
    },
    async loadPlayback(slug: string, signal?: AbortSignal): Promise<PlaybackResponse> {
      signal?.throwIfAborted();
      const video = demoVideos.find(item => item.slug === slug);
      if (!video) throw new Error('This video is not in the library.');
      const source = demoSource(video);
      const playback: PlaybackResponse = { slug, source, poster: video.poster ?? '', duration: video.duration ?? 0, captions: [] };
      const requestSignal = AbortSignal.any([AbortSignal.timeout(10000), ...(signal ? [signal] : [])]);
      async function text(url: string) {
        const response = await fetcher(url, { signal: requestSignal, redirect: 'manual' });
        if (!response.ok) throw new Error('Public captions are unavailable.');
        return response.text();
      }
      try {
        const playlist = captionPlaylistUrl(await text(source), source, 'en');
        if (!playlist) throw new Error('No English track');
        const file = captionFileUrl(await text(playlist), playlist);
        if (!file) throw new Error('No transcript');
        playback.captions = [{ language: 'en', label: 'English', url: file }];
      } catch {
        signal?.throwIfAborted();
        playback.captionsUnavailable = true;
      }
      signal?.throwIfAborted();
      return playback;
    },
  };
}
export const { loadLibrary, loadPlayback } = createPublicData();
