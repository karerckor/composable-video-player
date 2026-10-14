import { parseCues } from '../../shared/cues';
import { resolveUrl } from '../../shared/url';

export interface Thumb {
  start: number;
  end: number;
  url: string;
  /** Sprite rectangle; w/h are 0 for whole images. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export function parseThumbnails(text: string, baseUrl: string): Thumb[] {
  return parseCues(text)
    .map((cue) => {
      const line = cue.text.split('\n')[0]?.trim() ?? '';
      const [path = '', hash = ''] = line.split('#');
      const rect = hash.match(/xywh=(\d+),(\d+),(\d+),(\d+)/);
      return {
        start: cue.start,
        end: cue.end,
        url: path ? resolveUrl(path, baseUrl) : '',
        x: rect ? Number(rect[1]) : 0,
        y: rect ? Number(rect[2]) : 0,
        w: rect ? Number(rect[3]) : 0,
        h: rect ? Number(rect[4]) : 0,
      };
    })
    .filter((t) => t.url);
}

/** Binary search over cues sorted by start. */
export function findThumb(thumbs: Thumb[], time: number): Thumb | null {
  let lo = 0;
  let hi = thumbs.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const t = thumbs[mid]!;
    if (time < t.start) hi = mid - 1;
    else if (time >= t.end) lo = mid + 1;
    else return t;
  }
  return null;
}
