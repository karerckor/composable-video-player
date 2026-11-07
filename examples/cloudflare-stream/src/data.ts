import { json } from './dom.js';
import type { LibraryResponse, PlaybackResponse } from './shared.js';

export const publicPreview = false;
export const loadLibrary = (signal?: AbortSignal) => json<LibraryResponse>('/api/library', signal);
export const loadPlayback = (slug: string, signal?: AbortSignal) => json<PlaybackResponse>(`/api/videos/${encodeURIComponent(slug)}`, signal);
