import type { Fetcher } from './stream.js';
import { StreamError } from './stream.js';

function sameOrigin(path: string, source: string): string | null {
  try {
    const url = new URL(path, source);
    return url.protocol === 'https:' && url.origin === new URL(source).origin && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
export function captionPlaylistUrl(manifest: string, source: string, language: string): string | null {
  for (const line of manifest.split(/\r?\n/)) {
    if (!line.startsWith('#EXT-X-MEDIA:')) continue;
    const attributes = Object.fromEntries([...line.matchAll(/([A-Z-]+)=(?:"([^"]*)"|([^,]*))/g)].map(match => [match[1], match[2] ?? match[3]]));
    if (attributes.TYPE === 'SUBTITLES' && attributes.LANGUAGE === language && attributes.URI) return sameOrigin(attributes.URI, source);
  }
  return null;
}
export function captionFileUrl(manifest: string, source: string): string | null {
  const files = manifest.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'));
  return files.length === 1 ? sameOrigin(files[0], source) : null;
}
export async function publicCaption(source: string, language: string, fetcher: Fetcher): Promise<Response> {
  // Stream signs caption asset URLs dynamically. Resolve them on each request, never store a manifest.
  const signal = AbortSignal.timeout(15_000);
  async function get(url: string) {
    let response: Response;
    // Workers supports follow/manual, not redirect:error. Reject redirects via the status check.
    try { response = await fetcher(url, { signal, redirect: 'manual' }); }
    catch { throw new StreamError(502, 'This caption track could not be reached. Please try again.'); }
    if (!response.ok) throw new StreamError(502, 'This caption track is temporarily unavailable.');
    return response;
  }
  const playlist = captionPlaylistUrl(await (await get(source)).text(), source, language);
  if (!playlist) throw new StreamError(404, 'Caption track not found.');
  const file = captionFileUrl(await (await get(playlist)).text(), playlist);
  if (!file) throw new StreamError(502, 'This caption track is not available as a single transcript.');
  return get(file);
}
