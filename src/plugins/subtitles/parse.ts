import type { Cue } from '../../shared/cues';

export { parseCues as parseSubtitles, type Cue } from '../../shared/cues';

export function shiftCues(cues: Cue[], seconds: number): Cue[] {
  if (!seconds) return cues;
  return cues.map((c) => ({ ...c, start: c.start + seconds, end: c.end + seconds }));
}

/** PlayerJS shifts are in tenths of a second: `?shift=-5` or the `subshift` option. */
export function shiftFromUrl(url: string, fallbackTenths: number): number {
  const match = url.match(/[?&]shift=(-?\d+(?:\.\d+)?)/);
  return (match ? Number(match[1]) : fallbackTenths) / 10;
}

export function activeText(cues: Cue[], time: number): string {
  return cues
    .filter((c) => c.start <= time && time < c.end)
    .map((c) => c.text)
    .join('\n');
}

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
const decode = (s: string) => s.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m] ?? m);
const TAG_RE = /<(\/?)([biu])>|<[^>]*>/g;

/** Builds DOM nodes for cue text: keeps <b>, <i>, <u> and newlines; strips everything else. */
export function cueNodes(raw: string): Node[] {
  const text = raw.replace(/\{\\[^}]*\}/g, '');
  const fragment = document.createDocumentFragment();
  const stack: Node[] = [fragment];
  const top = () => stack[stack.length - 1]!;
  const pushText = (chunk: string) => {
    decode(chunk)
      .split('\n')
      .forEach((part, i) => {
        if (i > 0) top().appendChild(document.createElement('br'));
        if (part) top().appendChild(document.createTextNode(part));
      });
  };

  let last = 0;
  for (const match of text.matchAll(TAG_RE)) {
    const index = match.index ?? 0;
    pushText(text.slice(last, index));
    last = index + match[0].length;
    const [, closing, tag] = match;
    if (!tag) continue;
    if (closing) {
      if (stack.length > 1) stack.pop();
    } else {
      const el = document.createElement(tag);
      top().appendChild(el);
      stack.push(el);
    }
  }
  pushText(text.slice(last));
  return [...fragment.childNodes];
}
