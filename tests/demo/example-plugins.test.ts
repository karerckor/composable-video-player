import { afterEach, describe, expect, it } from 'vitest';
import { chapterAt, parseTimecodes, timecodesPlugin } from '../../demo/plugins/timecodes.js';
import { buildShareUrl, parseStartTime, sharePlugin } from '../../demo/plugins/share.js';
import { createTestPlayer } from '../helpers/player-harness.js';
import { flush } from '../helpers/flush.js';

describe('timecodes example plugin', () => {
  it('parses description-style lines in any order and skips the rest', () => {
    const text = ['Chapters:', '0:00 Intro', '- 1:05 — Second part', '[01:02:03] Late', '0:30 | Middle', 'not a timecode', '0:30 Duplicate'].join('\n');
    expect(parseTimecodes(text)).toEqual([
      { time: 0, label: 'Intro' },
      { time: 30, label: 'Middle' },
      { time: 65, label: 'Second part' },
      { time: 3723, label: 'Late' },
    ]);
  });

  it('finds the chapter playing at a time', () => {
    const list = parseTimecodes('0:00 A\n0:10 B');
    expect(chapterAt(list, 0)?.label).toBe('A');
    expect(chapterAt(list, 9.9)?.label).toBe('A');
    expect(chapterAt(list, 10)?.label).toBe('B');
    expect(chapterAt([], 5)).toBeUndefined();
  });

  it('publishes chapters as timeline markers and clears them with setTimecodes', async () => {
    const { player, media } = createTestPlayer({ source: 'a.mp4', timecodes: '0:00 A\n0:12 B', plugins: [timecodesPlugin()] });
    await flush();
    media.setDuration(30);
    expect(player.state.markers.map((m) => m.time)).toEqual([0, 12]);
    expect(player.root.querySelectorAll('.vp-timeline-marker')).toHaveLength(1);
    player.command('setTimecodes', '');
    expect(player.state.markers).toEqual([]);
  });
});

describe('share example plugin', () => {
  afterEach(() => history.replaceState(null, '', '/'));

  it('parses start times', () => {
    expect(parseStartTime('83')).toBe(83);
    expect(parseStartTime('83s')).toBe(83);
    expect(parseStartTime('1m23s')).toBe(83);
    expect(parseStartTime('1h2m3s')).toBe(3723);
    expect(parseStartTime('1:23')).toBe(83);
    expect(parseStartTime('1:02:03')).toBe(3723);
    for (const bad of [null, '', 'abc', '1:2:3:4', 'm']) expect(parseStartTime(bad)).toBeNull();
  });

  it('builds share links, keeping other query params', () => {
    expect(buildShareUrl('https://a.com/v?x=1', 't', 83.7)).toBe('https://a.com/v?x=1&t=83');
    expect(buildShareUrl('https://a.com/v?x=1&t=5', 't', null)).toBe('https://a.com/v?x=1');
    expect(buildShareUrl('https://a.com/v?t=5', 't', 0.4)).toBe('https://a.com/v');
  });

  it('starts the first source at ?t= and leaves later loads alone', async () => {
    history.replaceState(null, '', '/?t=1m5s');
    const { player, fp } = createTestPlayer({ source: 'a.mp4', plugins: [sharePlugin()] });
    await flush();
    player.load('b.mp4');
    await flush();
    expect(fp.loads).toEqual([
      { url: 'a.mp4', start: 65 },
      { url: 'b.mp4', start: 0 },
    ]);
  });
});
