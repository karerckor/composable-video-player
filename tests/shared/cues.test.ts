import { describe, expect, it } from 'vitest';
import { parseCues } from '../../src/shared/cues';

describe('parseCues', () => {
  it('parses WebVTT with headers, notes, ids and settings', () => {
    const vtt = '﻿WEBVTT\r\n\r\nNOTE a comment\r\n\r\nintro\r\n00:00:01.000 --> 00:00:03.500 align:start\r\nHello\r\nworld\r\n\r\n00:04.000 --> 00:05.000\r\nBye';
    expect(parseCues(vtt)).toEqual([
      { start: 1, end: 3.5, text: 'Hello\nworld' },
      { start: 4, end: 5, text: 'Bye' },
    ]);
  });

  it('parses SRT', () => {
    const srt = '1\n00:00:02,040 --> 00:00:04,000\nПривет\n\n2\n00:00:05,000 --> 00:00:06,000\nПока\n';
    expect(parseCues(srt)).toEqual([
      { start: 2.04, end: 4, text: 'Привет' },
      { start: 5, end: 6, text: 'Пока' },
    ]);
  });

  it('skips malformed blocks and sorts by start', () => {
    expect(parseCues('WEBVTT\n\n00:00:09.000 --> 00:00:10.000\nB\n\nbad --> line\nX\n\n00:00:01.000 --> 00:00:02.000\nA')).toEqual([
      { start: 1, end: 2, text: 'A' },
      { start: 9, end: 10, text: 'B' },
    ]);
  });
});
