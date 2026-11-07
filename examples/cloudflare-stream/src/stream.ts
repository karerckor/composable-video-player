export type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
export interface Bindings { CLOUDFLARE_ACCOUNT_ID?: string; CLOUDFLARE_STREAM_API_TOKEN?: string }
export class StreamError extends Error {
  constructor(public status: 404 | 409 | 502 | 503, message: string) { super(message); }
}
interface Details {
  readyToStream?: boolean;
  requireSignedURLs?: boolean;
  playback?: { hls?: string };
  thumbnail?: string;
  duration?: number;
  status?: { state?: string };
}
interface Track { language: string; label: string; status?: string }

export function streamClient(env: Bindings, fetcher: Fetcher) {
  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_STREAM_API_TOKEN) throw new StreamError(503, 'Stream is not configured. The site owner needs to add the account ID and API token.');
  if (!/^[a-f0-9]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID)) throw new StreamError(503, 'The Stream account ID is not configured correctly.');
  const base = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/stream`;
  async function request(id: string, suffix = '') {
    if (!/^[a-f0-9]{32}$/i.test(id)) throw new StreamError(503, 'A Stream video ID is not configured correctly.');
    let response: Response;
    try {
      response = await fetcher(`${base}/${id}${suffix}`, { headers: { Authorization: `Bearer ${env.CLOUDFLARE_STREAM_API_TOKEN}` }, signal: AbortSignal.timeout(10_000) });
    } catch { throw new StreamError(502, 'Cloudflare Stream could not be reached. Please try again.'); }
    if (response.status === 404) throw new StreamError(404, 'This video or caption could not be found in Stream.');
    if (!response.ok) throw new StreamError(502, 'Cloudflare Stream could not load this content. The owner can check the API token permissions.');
    return response;
  }
  async function json<T>(id: string, suffix = ''): Promise<T> {
    const response = await request(id, suffix);
    try {
      const body = await response.json() as { success: boolean; result: T };
      if (!body.success || body.result == null) throw new Error();
      return body.result;
    } catch { throw new StreamError(502, 'Cloudflare Stream returned an unexpected response. Please try again.'); }
  }
  return {
    details: (id: string) => json<Details>(id),
    captions: async (id: string) => {
      const tracks = await json<Track[]>(id, '/captions');
      if (!Array.isArray(tracks)) throw new StreamError(502, 'Cloudflare Stream returned unexpected caption data.');
      return tracks.filter(track => typeof track.language === 'string' && /^[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*$/.test(track.language) && (track.status === undefined || track.status === 'ready'));
    },
    captionFile: (id: string, language: string) => request(id, `/captions/${encodeURIComponent(language)}/vtt`),
  };
}
