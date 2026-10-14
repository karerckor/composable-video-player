import { describe, expect, it } from 'vitest';
import { isPlaylistInput, normalizeSpec, parseSource, parseSubtitleList, sourceKey } from '../../src/source/parse';

describe('parseSource', () => {
  it('parses a plain url', () => {
    expect(parseSource('https://a.com/v.mp4')).toEqual({
      qualities: [{ label: '', tracks: [{ label: '', urls: ['https://a.com/v.mp4'] }] }],
      subtitles: [],
      key: 'https://a.com/v.mp4',
    });
  });

  it('keeps a stable key regardless of the random alternative', () => {
    expect(parseSource('a.mp4 and b.mp4', { random: () => 0 }).key).toBe('a.mp4 and b.mp4');
    expect(parseSource('a.mp4 and b.mp4', { random: () => 0 }).key).toBe(parseSource('a.mp4 and b.mp4', { random: () => 0.99 }).key);
  });

  it('parses labeled qualities', () => {
    const spec = parseSource('[360p]//a/360.mp4,[720p]//a/720.mp4');
    expect(spec.qualities.map((q) => q.label)).toEqual(['360p', '720p']);
    expect(spec.qualities[1]!.tracks[0]!.urls).toEqual(['//a/720.mp4']);
  });

  it('parses audio tracks inside qualities', () => {
    const spec = parseSource('[480p]{French}//a/480_fr.mp4;{English}//a/480_en.mp4,[720p]{French}//a/720_fr.mp4;{English}//a/720_en.mp4');
    expect(spec.qualities).toHaveLength(2);
    expect(spec.qualities[0]!.tracks.map((t) => t.label)).toEqual(['French', 'English']);
    expect(spec.qualities[1]!.tracks[1]!.urls).toEqual(['//a/720_en.mp4']);
  });

  it('parses or-fallback chains', () => {
    const spec = parseSource('//a/v.m3u8 or //a/v.mp4');
    expect(spec.qualities[0]!.tracks[0]!.urls).toEqual(['//a/v.m3u8', '//a/v.mp4']);
  });

  it('resolves and-alternatives with the injected random', () => {
    expect(parseSource('//a/1.mp4 and //a/2.mp4', { random: () => 0 }).qualities[0]!.tracks[0]!.urls).toEqual(['//a/1.mp4']);
    expect(parseSource('//a/1.mp4 and //a/2.mp4', { random: () => 0.99 }).qualities[0]!.tracks[0]!.urls).toEqual(['//a/2.mp4']);
  });

  it('extracts inline subtitles', () => {
    const spec = parseSource('https://a.com/v.m3u8(subtitle:[En]https://a.com/en.vtt[Es]https://a.com/es.vtt)');
    expect(spec.qualities[0]!.tracks[0]!.urls).toEqual(['https://a.com/v.m3u8']);
    expect(spec.subtitles).toEqual([
      { label: 'En', url: 'https://a.com/en.vtt' },
      { label: 'Es', url: 'https://a.com/es.vtt' },
    ]);
  });

  it('extracts comma-separated inline subtitles without trailing commas', () => {
    const spec = parseSource('a.mp4(subtitle:[Eng]a.vtt,[Rus]b.vtt)');
    expect(spec.subtitles).toEqual([
      { label: 'Eng', url: 'a.vtt' },
      { label: 'Rus', url: 'b.vtt' },
    ]);
  });

  it('extracts the [seek:N] suffix as start', () => {
    const spec = parseSource('//a/v.mp4[seek:10]');
    expect(spec.start).toBe(10);
    expect(spec.qualities[0]!.tracks[0]!.urls).toEqual(['//a/v.mp4']);
  });

  it('drops <<< group separators', () => {
    const spec = parseSource('[480p]//a/1.mp4,[<<<Second]//,[720p]//a/2.mp4');
    expect(spec.qualities.map((q) => q.label)).toEqual(['480p', '720p']);
  });

  it('labels unlabeled qualities from opts.qualities', () => {
    const spec = parseSource('//a/1.mp4,//a/2.mp4', { qualities: '480p, 720p' });
    expect(spec.qualities.map((q) => q.label)).toEqual(['480p', '720p']);
  });
});

describe('parseSubtitleList', () => {
  it('parses labeled and unlabeled entries', () => {
    expect(parseSubtitleList('[English]https://a/en.vtt,[Russian]https://a/ru.srt')).toEqual([
      { label: 'English', url: 'https://a/en.vtt' },
      { label: 'Russian', url: 'https://a/ru.srt' },
    ]);
    expect(parseSubtitleList('https://a/subs/en.vtt')).toEqual([{ label: 'en', url: 'https://a/subs/en.vtt' }]);
    expect(parseSubtitleList('')).toEqual([]);
  });
});

describe('isPlaylistInput', () => {
  it('detects JSON and playlist urls', () => {
    expect(isPlaylistInput('[{"title":"a","file":"x.mp4"}]')).toBe(true);
    expect(isPlaylistInput('{"playlist":[]}')).toBe(true);
    expect(isPlaylistInput('https://a.com/pl.txt?x=1')).toBe(true);
    expect(isPlaylistInput('https://a.com/pl.json')).toBe(true);
    expect(isPlaylistInput('[720p]https://a.com/v.mp4')).toBe(false);
    expect(isPlaylistInput('[{broken')).toBe(false);
    expect(isPlaylistInput({ qualities: [] })).toBe(false);
  });
});

describe('normalizeSpec and sourceKey', () => {
  it('fills defaults', () => {
    const spec = normalizeSpec({ qualities: [{ label: '', tracks: [{ label: '', urls: ['a.mp4'] }] }] }, 'hls');
    expect(spec).toEqual({ qualities: [{ label: '', tracks: [{ label: '', urls: ['a.mp4'] }] }], subtitles: [], start: undefined, forceType: 'hls' });
    expect(sourceKey(spec)).toBe('a.mp4');
    expect(sourceKey({ qualities: [], subtitles: [] })).toBe('');
  });

  it('passes the key through and prefers it in sourceKey', () => {
    const spec = normalizeSpec({ qualities: [{ label: '', tracks: [{ label: '', urls: ['a.mp4'] }] }], key: 'raw-key' });
    expect(spec.key).toBe('raw-key');
    expect(sourceKey(spec)).toBe('raw-key');
  });
});
