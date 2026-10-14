import { parseTimestamp } from './time';

export interface Cue {
  start: number;
  end: number;
  text: string;
}

/** Parses WebVTT or SRT text into cues (blocks without a `-->` line are ignored). */
export function parseCues(input: string): Cue[] {
  const text = input.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const cues: Cue[] = [];
  for (const block of text.split(/\n{2,}/)) {
    const lines = block.split('\n');
    const timing = lines.findIndex((line) => line.includes('-->'));
    if (timing < 0) continue;
    const [left = '', right = ''] = lines[timing]!.split('-->');
    const start = parseTimestamp(left.trim());
    const end = parseTimestamp(right.trim().split(/\s+/)[0] ?? '');
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    cues.push({ start, end, text: lines.slice(timing + 1).join('\n').trim() });
  }
  return cues.sort((a, b) => a.start - b.start);
}
