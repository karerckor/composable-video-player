import { describe, expect, it } from 'vitest';
import { activeText, cueNodes, shiftCues, shiftFromUrl } from '../../src/plugins/subtitles/parse.js';

const render = (text: string) => {
  const div = document.createElement('div');
  div.append(...cueNodes(text));
  return div;
};

describe('subtitle helpers', () => {
  it('shifts cues and reads the shift from the url in tenths of a second', () => {
    expect(shiftCues([{ start: 1, end: 2, text: 'a' }], 0.5)).toEqual([{ start: 1.5, end: 2.5, text: 'a' }]);
    expect(shiftFromUrl('https://a/s.vtt?shift=-5', 0)).toBe(-0.5);
    expect(shiftFromUrl('https://a/s.vtt', 10)).toBe(1);
  });

  it('returns the text of all active cues', () => {
    const cues = [
      { start: 0, end: 2, text: 'A' },
      { start: 1, end: 3, text: 'B' },
      { start: 5, end: 6, text: 'C' },
    ];
    expect(activeText(cues, 1.5)).toBe('A\nB');
    expect(activeText(cues, 4)).toBe('');
    expect(activeText(cues, 2)).toBe('B');
  });

  it('keeps b/i/u and line breaks, strips other tags and decodes entities', () => {
    const div = render('<v Bob><b>Hi</b> <i>there</i></v>\n<c.red>x &amp; y</c> {\\an8}<font color="red">z</font>');
    expect(div.querySelector('b')!.textContent).toBe('Hi');
    expect(div.querySelector('i')!.textContent).toBe('there');
    expect(div.querySelectorAll('br')).toHaveLength(1);
    expect(div.textContent).toBe('Hi therex & y z');
    expect(div.querySelector('v, c, font')).toBeNull();
  });

  it('never creates script elements', () => {
    const div = render('<script>alert(1)</script><img src=x onerror=alert(2)>ok');
    expect(div.querySelector('script, img')).toBeNull();
    expect(div.textContent).toBe('alert(1)ok');
  });

  it('keeps plain angle brackets and handles tag case and timestamps', () => {
    expect(render('1 < 2 and 3 > 2').textContent).toBe('1 < 2 and 3 > 2');
    const upper = render('<B>x</B><I>y</I>');
    expect(upper.querySelector('b')!.textContent).toBe('x');
    expect(upper.querySelector('i')!.textContent).toBe('y');
    expect(render('<00:00:01.000>word').textContent).toBe('word');
    expect(render('<00:01.500>a<00:02.000>b').textContent).toBe('ab');
  });

  it('decodes nbsp and numeric entities', () => {
    expect(render('&#8217;').textContent).toBe('\u2019');
    expect(render('&#x41;').textContent).toBe('A');
    expect(render('a&nbsp;b').textContent).toBe('a\u00a0b');
    expect(render('&#1114112;').textContent).toBe('&#1114112;');
  });
});
