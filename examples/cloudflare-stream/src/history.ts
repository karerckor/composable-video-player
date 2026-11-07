export interface Progress { time: number; duration: number; updatedAt: number; completed: boolean }
export type ViewingHistory = Record<string, Progress>;
export function readProgress(value: string | null): ViewingHistory {
  try {
    const parsed: unknown = JSON.parse(value ?? '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([slug, entry]) => {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !entry || typeof entry !== 'object') return false;
      return [entry.time, entry.duration, entry.updatedAt].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0) && typeof entry.completed === 'boolean';
    }));
  } catch { return {}; }
}
export function recordProgress(history: ViewingHistory, slug: string, time: number, duration: number, now: number, completed = false): ViewingHistory {
  if (![time, duration, now].every(n => Number.isFinite(n) && n >= 0)) return history;
  const next = { ...history, [slug]: { time: duration > 0 ? Math.min(time, duration) : time, duration, updatedAt: now, completed: completed || history[slug]?.completed === true } };
  return Object.fromEntries(Object.entries(next).sort((a, b) => b[1].updatedAt - a[1].updatedAt).slice(0, 100));
}
export function continuingVideos(history: ViewingHistory, slugs: string[]): (Progress & { slug: string })[] {
  const allowed = new Set(slugs);
  return Object.entries(history).filter(([slug, progress]) => allowed.has(slug) && !progress.completed && progress.time > 5 && (!(progress.duration > 0) || progress.time < progress.duration - 10)).sort((a, b) => b[1].updatedAt - a[1].updatedAt).map(([slug, progress]) => ({ slug, ...progress }));
}
