import { describe, expect, it } from 'vitest';
import { clamp } from '../../src/shared/clamp';
import { mediaErrorToPlayerError, toPlayerError } from '../../src/shared/errors';
import { extOf, resolveUrl } from '../../src/shared/url';
import { formatTime, parseTimestamp } from '../../src/shared/time';

describe('clamp', () => {
  it('limits a value to a range', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-1, 0, 1)).toBe(0);
    expect(clamp(0.5, 0, 1)).toBe(0.5);
  });
});

describe('errors', () => {
  it('maps MediaError codes', () => {
    expect(mediaErrorToPlayerError({ code: 2, message: '' } as MediaError).kind).toBe('network');
    expect(mediaErrorToPlayerError({ code: 3, message: '' } as MediaError).kind).toBe('decode');
    expect(mediaErrorToPlayerError({ code: 4, message: '' } as MediaError).kind).toBe('unsupported');
    expect(mediaErrorToPlayerError(null).kind).toBe('unknown');
  });
  it('normalizes unknown values', () => {
    expect(toPlayerError({ kind: 'network', message: 'x' })).toEqual({ kind: 'network', message: 'x' });
    expect(toPlayerError(new Error('boom'))).toEqual({ kind: 'unknown', message: 'boom' });
    expect(toPlayerError('oops')).toEqual({ kind: 'unknown', message: 'oops' });
  });
});

describe('url', () => {
  it('extracts lowercase extension ignoring query and hash', () => {
    expect(extOf('https://a.com/v/Movie.MP4?x=1#t')).toBe('mp4');
    expect(extOf('//a.com/live.m3u8')).toBe('m3u8');
    expect(extOf('https://a.com/stream')).toBe('');
  });
  it('resolves relative urls against a base', () => {
    expect(resolveUrl('sprite.jpg', 'https://a.com/thumbs/t.vtt')).toBe('https://a.com/thumbs/sprite.jpg');
    expect(resolveUrl('https://b.com/x.jpg', 'https://a.com/t.vtt')).toBe('https://b.com/x.jpg');
  });
});

describe('time', () => {
  it('formats seconds', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(65.4)).toBe('1:05');
    expect(formatTime(3725, 4000)).toBe('1:02:05');
    expect(formatTime(5, 4000)).toBe('0:00:05');
    expect(formatTime(NaN)).toBe('0:00');
  });
  it('parses VTT/SRT timestamps', () => {
    expect(parseTimestamp('00:01.500')).toBeCloseTo(1.5);
    expect(parseTimestamp('01:02:03.250')).toBeCloseTo(3723.25);
    expect(parseTimestamp('00:00:02,040')).toBeCloseTo(2.04);
    expect(parseTimestamp('garbage')).toBeNaN();
  });
});
