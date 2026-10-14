const pad = (n: number) => String(n).padStart(2, '0');

/** `m:ss`, or `h:mm:ss` when `reference` (usually duration) is at least an hour. */
export function formatTime(seconds: number, reference = seconds): string {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0 || (Number.isFinite(reference) && reference >= 3600)) return `${h}:${pad(m)}:${pad(s)}`;
  return `${m}:${pad(s)}`;
}

/** Parses `hh:mm:ss.mmm`, `mm:ss.mmm` and SRT-style `hh:mm:ss,mmm`. */
export function parseTimestamp(value: string): number {
  const match = value.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$/);
  if (!match) return NaN;
  const [, h = '0', m, s, ms = '0'] = match;
  return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms.padEnd(3, '0')) / 1000;
}
