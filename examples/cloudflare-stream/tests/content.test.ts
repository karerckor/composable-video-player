import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseTimestamp, chapterAt, parseTranscript, playbackStart } from '../src/content.js';

describe('watch navigation and transcript', () => {
  it('accepts seconds and share-friendly clock timestamps including zero', () => {
    assert.equal(parseTimestamp('0'), 0);
    assert.equal(parseTimestamp('83'), 83);
    assert.equal(parseTimestamp('1:23'), 83);
    assert.equal(parseTimestamp('1h2m3s'), 3723);
    assert.equal(parseTimestamp('1:02:03'), 3723);
    for (const value of [null, '', '-1', 'NaN', '12abc', '1:99', '1.2.3']) assert.equal(parseTimestamp(value), null);
  });
  it('uses an explicit zero instead of remembered progress and ignores malformed times', () => {
    assert.equal(playbackStart('0', 30), 0);
    assert.equal(playbackStart('15', 30), 15);
    assert.equal(playbackStart('broken', 30), 30);
    assert.equal(playbackStart(null, 30), 30);
  });
  it('selects the current chapter at exact boundaries', () => {
    const chapters = [{ time: 0, title: 'Intro' }, { time: 10, title: 'Next' }];
    assert.equal(chapterAt(chapters, 9.9), 0);
    assert.equal(chapterAt(chapters, 10), 1);
    assert.equal(chapterAt([], 10), -1);
  });
  it('reads VTT and SRT as safe transcript text, including multiline cues', () => {
    const vtt = 'WEBVTT\n\nNOTE ignore me\nA note\n\n1\n00:00.000 --> 00:02.000 align:start\nHello <b>world</b> &amp; friends\nSecond line\n\n00:02.000 --> 00:04.000\nNext';
    assert.deepEqual(parseTranscript(vtt), [
      { start: 0, end: 2, text: 'Hello world & friends Second line' },
      { start: 2, end: 4, text: 'Next' },
    ]);
    assert.deepEqual(parseTranscript('1\r\n00:00:01,000 --> 00:00:02,500\r\nHi'), [{ start: 1, end: 2.5, text: 'Hi' }]);
  });
  it('ignores malformed or empty transcript cues', () => {
    assert.deepEqual(parseTranscript('WEBVTT\n\n00:02.000 --> 00:01.000\nBackwards\n\nbad --> time\nOops'), []);
  });
});
