import type { Chapter } from './shared.js';

export function parseTimestamp(value: string | null): number | null {
  const text = (value ?? '').trim().toLowerCase();
  let seconds: number;
  if (/^\d+(?:\.\d+)?s?$/.test(text)) seconds = parseFloat(text);
  else if (/^\d+(?::[0-5]\d){1,2}(?:\.\d+)?$/.test(text)) seconds = text.split(':').reduce((sum, part) => sum * 60 + Number(part), 0);
  else {
    const match = text.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
    if (!match || !text) return null;
    seconds = Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
  }
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}
export const playbackStart = (value: string | null, saved: number) => parseTimestamp(value) ?? saved;
export function chapterAt(chapters: Chapter[], time: number): number {
  let current = -1;
  for (let i = 0; i < chapters.length; i++) if (chapters[i].time <= time) current = i;
  return current;
}
export interface TranscriptCue { start: number; end: number; text: string }
export function parseTranscript(text: string): TranscriptCue[] {
  const cues: TranscriptCue[] = [];
  for (const block of text.replace(/\r/g, '').split(/\n\s*\n/)) {
    if (/^(?:WEBVTT|NOTE|STYLE|REGION)/.test(block.trim())) continue;
    const lines = block.trim().split('\n');
    const timingIndex = lines.findIndex(line => line.includes('-->'));
    if (timingIndex < 0) continue;
    const match = lines[timingIndex].match(/^((?:\d{2}:)?\d{2}:\d{2}[.,]\d{3})\s+-->\s+((?:\d{2}:)?\d{2}:\d{2}[.,]\d{3})/);
    if (!match) continue;
    const start = parseTimestamp(match[1].replace(',', '.'));
    const end = parseTimestamp(match[2].replace(',', '.'));
    const decoded = lines.slice(timingIndex + 1).join(' ').replace(/<[^>]*>/g, '').replace(/\{\\[^}]*\}/g, '').replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, entity: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' })[entity] ?? '').trim();
    if (start !== null && end !== null && end > start && decoded) cues.push({ start, end, text: decoded });
  }
  return cues;
}
