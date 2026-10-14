export interface PlaylistItem {
  title?: string;
  file?: string;
  poster?: string;
  /** `[Label]url,[Label]url` */
  subtitle?: string;
  thumbnails?: string;
  id?: string;
  /** Seconds, or 'continue' to keep the current position (e.g. switching dubs). */
  start?: number | 'continue';
  folder?: PlaylistItem[];
  [key: string]: unknown;
}

export interface FlatItem {
  item: PlaylistItem;
  index: number;
  depth: number;
}

export interface PlaylistState {
  items: PlaylistItem[];
  flat: FlatItem[];
  index: number;
  open: boolean;
}

export function normalizePlaylist(data: unknown): PlaylistItem[] {
  if (Array.isArray(data)) return data as PlaylistItem[];
  if (data && typeof data === 'object') {
    const wrapped = (data as { playlist?: unknown }).playlist;
    if (Array.isArray(wrapped)) return wrapped as PlaylistItem[];
    if ('file' in data || 'folder' in data) return [data as PlaylistItem];
  }
  throw new Error('Invalid playlist: expected an array of items');
}

export function flattenPlaylist(items: PlaylistItem[]): FlatItem[] {
  const flat: FlatItem[] = [];
  const walk = (list: PlaylistItem[], depth: number) => {
    for (const item of list) {
      if (Array.isArray(item.folder)) walk(item.folder, depth + 1);
      else if (item.file) flat.push({ item, index: flat.length, depth });
    }
  };
  walk(items, 0);
  return flat;
}

/** By id first (ids are often numeric strings in CMS data), then by index. */
export function findIndex(flat: FlatItem[], idOrIndex: string | number): number {
  const byId = flat.findIndex((f) => f.item.id !== undefined && String(f.item.id) === String(idOrIndex));
  if (byId >= 0) return byId;
  if (typeof idOrIndex === 'number' || /^\d+$/.test(idOrIndex)) {
    const i = Number(idOrIndex);
    return i >= 0 && i < flat.length ? i : -1;
  }
  return -1;
}

/** A JSON string, or a URL to a JSON (.txt/.json) playlist. */
export async function loadPlaylistInput(input: string, fetchFn: typeof fetch): Promise<PlaylistItem[]> {
  const trimmed = input.trim();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) return normalizePlaylist(JSON.parse(trimmed));
  const response = await fetchFn(trimmed);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return normalizePlaylist(JSON.parse(await response.text()));
}
