import type { SourceInput, SourceSpec, SourceSpecInput, SourceTrack, SubtitleRef } from '../types.js';

export interface ParseOptions {
  /** Labels for unlabeled comma-separated qualities, e.g. "480p,720p". */
  qualities?: string;
  random?: () => number;
}

const SUBTITLE_PREFIX = '(subtitle:';
const PAIR_RE = /\[([^\]]*)\]([^[,]+)/g;
const SEEK_RE = /\[seek:(\d+(?:\.\d+)?)\]$/;

function takeLabel(part: string, open: string, close: string): [string, string] {
  if (part.startsWith(open)) {
    const end = part.indexOf(close);
    if (end > 0) return [part.slice(1, end).trim(), part.slice(end + 1).trim()];
  }
  return ['', part];
}

function fileLabel(url: string): string {
  const name = url.split(/[?#]/)[0]!.split('/').pop() ?? '';
  return name.replace(/\.[^.]+$/, '');
}

function pickAlternative(link: string, random: () => number): string {
  if (!link.includes(' and ')) return link;
  const options = link.split(' and ').map((s) => s.trim()).filter(Boolean);
  return options[Math.min(options.length - 1, Math.floor(random() * options.length))] ?? '';
}

function extractInlineSubtitles(input: string): { rest: string; subtitles: SubtitleRef[] } {
  const subtitles: SubtitleRef[] = [];
  let rest = input;
  let idx = rest.indexOf(SUBTITLE_PREFIX);
  while (idx >= 0) {
    const end = rest.indexOf(')', idx);
    if (end < 0) break;
    const inner = rest.slice(idx + SUBTITLE_PREFIX.length, end);
    for (const m of inner.matchAll(PAIR_RE)) subtitles.push({ label: m[1]!.trim(), url: m[2]!.trim() });
    rest = rest.slice(0, idx) + rest.slice(end + 1);
    idx = rest.indexOf(SUBTITLE_PREFIX);
  }
  return { rest, subtitles };
}

export function parseSource(input: string, opts: ParseOptions = {}): SourceSpec {
  const random = opts.random ?? Math.random;
  const { rest, subtitles } = extractInlineSubtitles(input.trim());
  const labels = opts.qualities?.split(',').map((s) => s.trim()) ?? [];
  let start: number | undefined;

  const parseTrack = (part: string): SourceTrack => {
    const [label, body] = takeLabel(part, '{', '}');
    const urls = body
      .split(' or ')
      .map((link) => pickAlternative(link.trim(), random))
      .map((url) => {
        const m = url.match(SEEK_RE);
        if (!m) return url;
        start ??= Number(m[1]);
        return url.slice(0, m.index).trim();
      })
      .filter(Boolean);
    return { label, urls };
  };

  const qualities = rest
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((part) => takeLabel(part, '[', ']'))
    .filter(([label]) => !label.startsWith('<<<'))
    .map(([label, body], i) => ({
      label: label || labels[i] || '',
      tracks: body.split(';').map((s) => s.trim()).filter(Boolean).map(parseTrack).filter((t) => t.urls.length > 0),
    }))
    .filter((q) => q.tracks.length > 0);

  const spec: SourceSpec = { qualities, subtitles, key: input.trim() };
  if (start !== undefined) spec.start = start;
  return spec;
}

export function parseSubtitleList(value: string): SubtitleRef[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((part) => {
      const [label, url] = takeLabel(part, '[', ']');
      return { label: label || fileLabel(url), url };
    });
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A source spec object: the only non-string input the media controller can load itself. */
export function isSourceSpecInput(input: unknown): input is SourceSpecInput {
  return isRecord(input) && Array.isArray(input.qualities);
}

/** A playlist: JSON or a .txt/.json url, an array of items, or an item / `{ playlist }` object. */
export function isPlaylistInput(input: SourceInput): boolean {
  if (Array.isArray(input)) return input.length > 0 && input.every(isRecord);
  if (isRecord(input)) return !isSourceSpecInput(input) && ('file' in input || 'folder' in input || 'playlist' in input);
  if (typeof input !== 'string') return false;
  const s = input.trim();
  if (s.startsWith('[{') || s.startsWith('{')) {
    try {
      JSON.parse(s);
      return true;
    } catch {
      return false;
    }
  }
  const path = (s.split(/[?#]/)[0] ?? '').toLowerCase();
  return path.endsWith('.txt') || path.endsWith('.json');
}

export function normalizeSpec(input: SourceSpecInput, forceType?: 'hls'): SourceSpec {
  return {
    qualities: input.qualities,
    subtitles: input.subtitles ?? [],
    start: input.start,
    forceType: input.forceType ?? forceType,
    key: input.key,
  };
}

/** Stable identity of a source: its `key` when known, else the first url of the first quality/track. */
export function sourceKey(spec: SourceSpec): string {
  return spec.key ?? spec.qualities[0]?.tracks[0]?.urls[0] ?? '';
}
