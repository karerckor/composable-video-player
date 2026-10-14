## Chunk 7: Plugins B — subtitles and thumbnails

Delivers: a shared WebVTT/SRT cue parser (`shared/cues.ts`), the subtitles plugin (fetch + parse VTT/SRT, own render layer, menu, commands) and the thumbnails plugin (sprite VTT, preview over the timeline).

Spec references: §7 (subtitles, thumbnails rows), §5.5 (auxiliary load errors). Deviations: cue parsing lives in `shared/` because both plugins need it and plugins may not import each other; the playlist plugin (chunk 7b) hands per-item thumbnails over via the `setThumbnails` command; the `subtitle` event is emitted only on explicit changes (so `memory` doesn't persist automatic defaults).

Cue text is rendered without `innerHTML`: only `<b>`, `<i>`, `<u>` and line breaks are kept; every other tag (`<c.x>`, `<v Name>`, `<font>`, timestamps, ASS `{\an8}`) is stripped and basic entities are decoded.

### Task 7.1: Shared cue parser

**Files:**
- Create: `src/shared/cues.ts`
- Test: `tests/shared/cues.test.ts`

- [ ] **Step 1: Write the failing test `tests/shared/cues.test.ts`**

```ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/shared/cues.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/shared/cues.ts`**

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/shared/cues.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/cues.ts tests/shared/cues.test.ts
git commit -m "feat(shared): add WebVTT/SRT cue parser"
```

### Task 7.2: Subtitle helpers (shift, active cues, safe rendering)

**Files:**
- Create: `src/plugins/subtitles/parse.ts`
- Test: `tests/plugins/subtitles-parse.test.ts`

- [ ] **Step 1: Write the failing test `tests/plugins/subtitles-parse.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { activeText, cueNodes, shiftCues, shiftFromUrl } from '../../src/plugins/subtitles/parse';

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
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/plugins/subtitles-parse.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/plugins/subtitles/parse.ts`**

```ts
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

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/plugins/subtitles-parse.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/plugins/subtitles/parse.ts tests/plugins/subtitles-parse.test.ts
git commit -m "feat(subtitles): add cue shift, lookup and safe rendering helpers"
```

### Task 7.3: Subtitles plugin

**Files:**
- Create: `src/plugins/subtitles/index.ts`
- Test: `tests/plugins/subtitles.test.ts`

Behaviour (spec §7): tracks come from `spec.subtitles` (inline `(subtitle:…)` or playlist items) plus the `subtitle` option on the first source. Initial choice: `preferredSubtitle` (memory) → `defaultSubtitle` → off if `subtitleStart === false` → first track. Tracks load lazily when selected. The layer sits in `below-ui` and gets `vp-subtitles-raised` while the toolbar is visible.

- [ ] **Step 1: Write the failing test `tests/plugins/subtitles.test.ts`**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { subtitlesPlugin, type SubtitlesPluginOptions } from '../../src/plugins/subtitles';
import { createTestPlayer } from '../helpers/player-harness';
import { flush } from '../helpers/flush';
import type { PlayerOptions } from '../../src/types';

const FILES: Record<string, string> = {
  'en.vtt': 'WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nHello <b>world</b>',
  'ru.srt': '1\n00:00:01,000 --> 00:00:03,000\nПривет',
};
const fetchMock = vi.fn(async (url: string) => (FILES[url.split('?')[0]!] ? new Response(FILES[url.split('?')[0]!]) : new Response('', { status: 404 })));

function setup(options: Partial<PlayerOptions> = {}, pluginOptions: SubtitlesPluginOptions = {}) {
  const t = createTestPlayer({ ...options, plugins: [subtitlesPlugin({ fetch: fetchMock as unknown as typeof fetch, ...pluginOptions })] });
  const text = () => t.host.querySelector('.vp-subtitles-text')!.textContent;
  return { ...t, text };
}

beforeEach(() => {
  fetchMock.mockClear();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('subtitlesPlugin', () => {
  it('loads tracks from the option and shows the first one by default', async () => {
    const { player, media, text, host } = setup({ subtitle: '[English]en.vtt,[Русский]ru.srt', source: 'a.mp4' });
    await flush();
    expect(player.state.textTracks.map((t) => t.label)).toEqual(['English', 'Русский']);
    expect(player.state.textTrack).toBe(0);
    media.timeTo(1.5);
    expect(text()).toBe('Hello world');
    expect(host.querySelector('.vp-subtitles-text b')!.textContent).toBe('world');
    media.timeTo(4);
    expect(text()).toBe('');
  });

  it('uses inline subtitles from the source and loads lazily', async () => {
    const { player } = setup({ source: 'a.mp4(subtitle:[En]en.vtt[Ru]ru.srt)', subtitleStart: false });
    await flush();
    expect(player.state.textTracks).toHaveLength(2);
    expect(player.state.textTrack).toBe(-1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('respects defaultSubtitle and the memory preference', async () => {
    const a = setup({ subtitle: '[En]en.vtt,[Ru]ru.srt', defaultSubtitle: 'Ru', source: 'a.mp4' });
    await flush();
    expect(a.player.state.textTrack).toBe(1);
    const b = createTestPlayer({
      subtitle: '[En]en.vtt,[Ru]ru.srt',
      defaultSubtitle: 'Ru',
      plugins: [
        { name: 'pref', setup: (ctx) => void ctx.events.on('init', () => ctx.store.set({ preferredSubtitle: 'off' })) },
        subtitlesPlugin({ fetch: fetchMock as unknown as typeof fetch }),
      ],
      source: 'a.mp4',
    });
    await flush();
    expect(b.player.state.textTrack).toBe(-1);
  });

  it('switches through the menu and emits subtitle only on explicit changes', async () => {
    const { player, host } = setup({ subtitle: '[En]en.vtt,[Ru]ru.srt', source: 'a.mp4' });
    const events: string[] = [];
    player.on('subtitle', (label) => events.push(label));
    await flush();
    host.querySelector<HTMLButtonElement>('.vp-settings')!.click();
    const items = [...host.querySelectorAll<HTMLButtonElement>('.vp-menu-item')];
    expect(items.map((b) => b.querySelector('.vp-menu-label')!.textContent)).toEqual(['Выкл', 'En', 'Ru']);
    items[0]!.click();
    expect(player.state.textTrack).toBe(-1);
    expect(events).toEqual(['off']);
  });

  it('supports toggleSubtitles, addSubtitle and api', async () => {
    const { player } = setup({ subtitle: '[En]en.vtt', source: 'a.mp4' });
    await flush();
    player.command('toggleSubtitles');
    expect(player.state.textTrack).toBe(-1);
    player.command('toggleSubtitles');
    expect(player.state.textTrack).toBe(0);
    player.api('subtitle', '[Ru]ru.srt');
    expect(player.state.textTracks.map((t) => t.label)).toEqual(['En', 'Ru']);
    expect(player.state.textTrack).toBe(1);
    player.api('+subtitle', '[De]de.vtt');
    expect(player.state.textTrack).toBe(1);
    expect(player.api('subtitles')).toEqual(['En', 'Ru', 'De']);
  });

  it('applies subshift and url shift', async () => {
    const { media, text } = setup({ subtitle: '[En]en.vtt?shift=10', source: 'a.mp4' });
    await flush();
    media.timeTo(1.5);
    expect(text()).toBe('');
    media.timeTo(2.5);
    expect(text()).toBe('Hello world');
  });

  it('reports load failures and keeps working', async () => {
    const { player, media, text } = setup({ subtitle: '[X]missing.vtt', source: 'a.mp4' });
    const errors: string[] = [];
    player.on('loaderror', ({ url }) => errors.push(url));
    await flush();
    media.timeTo(1);
    expect(text()).toBe('');
    expect(errors).toEqual(['missing.vtt']);
  });

  it('raises the layer while controls are visible', async () => {
    const { player, host } = setup({ subtitle: '[En]en.vtt', source: 'a.mp4' });
    await flush();
    const layer = host.querySelector('.vp-subtitles')!;
    expect(layer.classList.contains('vp-subtitles-raised')).toBe(true);
    await player.play();
    player.command('setControlsLocked', false);
    expect(player.state.userActive).toBe(false);
    expect(layer.classList.contains('vp-subtitles-raised')).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/plugins/subtitles.test.ts`
Expected: FAIL — cannot resolve `../../src/plugins/subtitles`.

- [ ] **Step 3: Implement `src/plugins/subtitles/index.ts`**

```ts
import type { CommandContext, Plugin, SubtitleRef } from '../../types';
import { h } from '../../ui/dom';
import { controlsVisible } from '../../ui/activity';
import { parseSubtitleList } from '../../source/parse';
import { activeText, cueNodes, parseSubtitles, shiftCues, shiftFromUrl, type Cue } from './parse';

declare module '../../types' {
  interface PlayerOptions {
    /** `[Label]url,[Label]url` for the first source. PlayerJS: subtitle. */
    subtitle?: string;
    /** Label to show initially. PlayerJS: default_subtitle. */
    defaultSubtitle?: string;
    /** `false` starts with subtitles off. PlayerJS: subtitle_start:0. */
    subtitleStart?: boolean;
    /** Shift in tenths of a second. PlayerJS: subshift. */
    subshift?: number;
  }
  interface PlayerCommands {
    setTextTrack(index: number): void;
    toggleSubtitles(): void;
    addSubtitle(label: string, url: string, select?: boolean): void;
  }
}

export interface SubtitlesPluginOptions {
  subtitle?: string;
  defaultSubtitle?: string;
  subtitleStart?: boolean;
  subshift?: number;
  fetch?: typeof fetch;
}

interface Track {
  label: string;
  url: string;
  shift: number;
  cues: Cue[] | null;
  loading: Promise<void> | null;
}

const USER: CommandContext = { source: 'user' };

export function subtitlesPlugin(o: SubtitlesPluginOptions = {}): Plugin {
  return {
    name: 'subtitles',
    setup(ctx) {
      const fetchText = o.fetch ?? fetch.bind(globalThis);
      const optionList = o.subtitle ?? ctx.options.subtitle;
      const defaultLabel = o.defaultSubtitle ?? ctx.options.defaultSubtitle;
      const startOn = (o.subtitleStart ?? ctx.options.subtitleStart) !== false;
      const shiftTenths = o.subshift ?? ctx.options.subshift ?? 0;

      let tracks: Track[] = [];
      let lastEnabled = 0;
      let firstSource = true;

      const toTrack = (ref: SubtitleRef): Track => ({ label: ref.label, url: ref.url, shift: shiftFromUrl(ref.url, shiftTenths), cues: null, loading: null });
      const publish = () => ctx.store.set({ textTracks: tracks.map((t) => ({ label: t.label })) });

      const load = (track: Track) => {
        if (track.cues || track.loading) return;
        track.loading = fetchText(track.url)
          .then((response) => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.text();
          })
          .then((text) => {
            track.cues = shiftCues(parseSubtitles(text), track.shift);
          })
          .catch((e: unknown) => {
            track.cues = [];
            ctx.log.warn(`subtitles "${track.url}" failed to load`, e);
            ctx.events.emit('loaderror', { url: track.url, error: { kind: 'network', message: String(e) } });
          })
          .finally(publish); // new textTracks array → the layer re-renders
      };

      const select = (index: number, emit: boolean) => {
        const i = index >= 0 && index < tracks.length ? index : -1;
        if (i >= 0) {
          lastEnabled = i;
          load(tracks[i]!);
        }
        ctx.store.set({ textTrack: i });
        if (emit) ctx.events.emit('subtitle', i >= 0 ? tracks[i]!.label : 'off');
      };

      /** Preference (memory) → default label → off if subtitleStart:false → first track. */
      const initialIndex = () => {
        for (const wanted of [ctx.store.get().preferredSubtitle, defaultLabel]) {
          if (wanted === 'off') return -1;
          const byLabel = wanted ? tracks.findIndex((t) => t.label === wanted) : -1;
          if (byLabel >= 0) return byLabel;
        }
        return startOn && tracks.length ? 0 : -1;
      };

      ctx.registerComponent('subtitles-layer', (ui) => {
        const line = h('div', { class: 'vp-subtitles-text' });
        const el = h('div', { class: 'vp-subtitles', 'aria-live': 'polite' }, line);
        ui.select(
          (s) => {
            const track = s.textTrack >= 0 ? tracks[s.textTrack] : undefined;
            return track?.cues ? activeText(track.cues, s.currentTime) : '';
          },
          (text) => line.replaceChildren(...cueNodes(text)),
          { immediate: true },
        );
        ui.select(controlsVisible, (raised) => el.classList.toggle('vp-subtitles-raised', raised), { immediate: true });
        return { el };
      });

      const offs: Array<() => void> = [
        ctx.addLayer({ type: 'subtitles-layer' }, 'below-ui'),

        ctx.events.on('new', ({ spec }) => {
          const refs = [...spec.subtitles, ...(firstSource && optionList ? parseSubtitleList(optionList) : [])];
          firstSource = false;
          tracks = refs.map(toTrack);
          lastEnabled = 0;
          publish();
          select(initialIndex(), false);
        }),

        ctx.commands.register('setTextTrack', ([index]) => select(index, true)),
        ctx.commands.register('toggleSubtitles', () => {
          if (ctx.store.get().textTrack >= 0) select(-1, true);
          else select(lastEnabled < tracks.length ? lastEnabled : 0, true);
        }),
        ctx.commands.register('addSubtitle', ([label, url, selectIt]) => {
          tracks.push(toTrack({ label, url }));
          publish();
          if (selectIt) select(tracks.length - 1, true);
        }),

        ctx.registerMenu({
          id: 'subtitle',
          label: 'subtitles',
          order: 30,
          visible: (s) => s.textTracks.length > 0,
          options: (s) => [{ label: ctx.t('off'), value: -1 }, ...s.textTracks.map((t, i) => ({ label: t.label || String(i + 1), value: i }))],
          current: (s) => s.textTrack,
          select: (value) => ctx.commands.run('setTextTrack', [value as number], USER),
        }),
      ];
      return () => offs.forEach((off) => off());
    },
  };
}
```

Note on the "raises the layer" test: after `play()` the status is `playing`; `userActive` is false (no pointer events), so `controlsVisible` is false and the class is removed.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/plugins/subtitles.test.ts`
Expected: PASS.

- [ ] **Step 5: Add subtitle styles** — append to `src/theme/player.css` under `/* ===== Plugins (appended in chunk 7) ===== */`:

```css
/* subtitles */
.vp-subtitles {
  position: absolute;
  left: 5%;
  right: 5%;
  bottom: 6%;
  display: flex;
  justify-content: center;
  pointer-events: none !important;
  transition: bottom 0.25s ease;
}
.vp-subtitles.vp-subtitles-raised {
  bottom: calc(6% + 56px);
}
.vp-subtitles-text {
  max-width: 100%;
  padding: 0.1em 0.4em;
  border-radius: 4px;
  background: var(--vp-sub-bg);
  color: var(--vp-sub-color);
  font-size: var(--vp-sub-size);
  line-height: 1.35;
  text-align: center;
  white-space: pre-line;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
}
.vp-subtitles-text:empty {
  display: none;
}
```

- [ ] **Step 6: Commit**

```bash
git add src/plugins/subtitles/index.ts tests/plugins/subtitles.test.ts src/theme/player.css
git commit -m "feat(plugins): add subtitles plugin with VTT/SRT support"
```

### Task 7.4: Thumbnails plugin

**Files:**
- Create: `src/plugins/thumbnails/parse.ts`, `src/plugins/thumbnails/index.ts`
- Test: `tests/plugins/thumbnails.test.ts`

- [ ] **Step 1: Write the failing test `tests/plugins/thumbnails.test.ts`**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { findThumb, parseThumbnails } from '../../src/plugins/thumbnails/parse';
import { thumbnailsPlugin } from '../../src/plugins/thumbnails';
import { createTestPlayer } from '../helpers/player-harness';
import { flush } from '../helpers/flush';

const VTT = 'WEBVTT\n\n00:00.000 --> 00:05.000\nsprite.jpg#xywh=0,0,160,90\n\n00:05.000 --> 00:10.000\nsprite.jpg#xywh=160,0,160,90\n\n00:10.000 --> 00:15.000\nhttps://cdn.example/full.jpg';

describe('parseThumbnails / findThumb', () => {
  it('parses sprite rectangles and resolves urls against the VTT url', () => {
    const thumbs = parseThumbnails(VTT, 'https://a.com/thumbs/t.vtt');
    expect(thumbs[1]).toEqual({ start: 5, end: 10, url: 'https://a.com/thumbs/sprite.jpg', x: 160, y: 0, w: 160, h: 90 });
    expect(thumbs[2]).toMatchObject({ url: 'https://cdn.example/full.jpg', w: 0, h: 0 });
  });
  it('finds the thumb for a time', () => {
    const thumbs = parseThumbnails(VTT, 'https://a.com/t.vtt');
    expect(findThumb(thumbs, 7)!.x).toBe(160);
    expect(findThumb(thumbs, 0)!.x).toBe(0);
    expect(findThumb(thumbs, 99)).toBeNull();
  });
});

describe('thumbnailsPlugin', () => {
  const fetchMock = vi.fn(async () => new Response(VTT));
  let bus: import('../../src/types').EventBus;
  const grab = { name: 'grab', setup: (ctx: import('../../src/types').PluginContext) => void (bus = ctx.events) };

  beforeEach(() => fetchMock.mockClear());

  const setup = (options: Partial<import('../../src/types').PlayerOptions> = { thumbnails: 'https://a.com/t.vtt' }) => {
    const t = createTestPlayer({ ...options, plugins: [grab, thumbnailsPlugin({ fetch: fetchMock as unknown as typeof fetch })], source: 'a.mp4' });
    const preview = () => t.host.querySelector<HTMLElement>('.vp-thumb')!;
    const image = () => t.host.querySelector<HTMLElement>('.vp-thumb-image')!;
    return { ...t, preview, image };
  };

  it('loads the VTT from the option and shows a sprite preview on hover', async () => {
    const { preview, image, player } = setup();
    await flush();
    expect(fetchMock).toHaveBeenCalledWith('https://a.com/t.vtt');
    expect(preview().classList.contains('vp-hidden')).toBe(true);
    bus.emit('ui:timeline-hover', { time: 7, x: 100, rootX: 110, width: 400 });
    expect(preview().classList.contains('vp-hidden')).toBe(false);
    expect(image().style.backgroundImage).toContain('https://a.com/sprite.jpg');
    expect(image().style.backgroundPosition).toBe('-160px 0px');
    expect(image().style.width).toBe('160px');
    expect(preview().querySelector('.vp-thumb-time')!.textContent).toBe('0:07');
    bus.emit('ui:timeline-leave');
    expect(preview().classList.contains('vp-hidden')).toBe(true);
  });

  it('shows only the time without thumbnails, and setThumbnails loads a new file', async () => {
    const { preview, image, player } = setup({});
    await flush();
    bus.emit('ui:timeline-hover', { time: 3, x: 10, rootX: 10, width: 400 });
    expect(preview().classList.contains('vp-hidden')).toBe(false);
    expect(image().hidden).toBe(true);
    player.command('setThumbnails', 'https://a.com/t.vtt');
    await flush();
    bus.emit('ui:timeline-hover', { time: 3, x: 10, rootX: 10, width: 400 });
    expect(image().hidden).toBe(false);
    player.command('setThumbnails', '');
    bus.emit('ui:timeline-hover', { time: 3, x: 10, rootX: 10, width: 400 });
    expect(image().hidden).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/plugins/thumbnails.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `src/plugins/thumbnails/parse.ts`**

```ts
import { parseCues } from '../../shared/cues';
import { resolveUrl } from '../../shared/url';

export interface Thumb {
  start: number;
  end: number;
  url: string;
  /** Sprite rectangle; w/h are 0 for whole images. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export function parseThumbnails(text: string, baseUrl: string): Thumb[] {
  return parseCues(text)
    .map((cue) => {
      const line = cue.text.split('\n')[0]?.trim() ?? '';
      const [path = '', hash = ''] = line.split('#');
      const rect = hash.match(/xywh=(\d+),(\d+),(\d+),(\d+)/);
      return {
        start: cue.start,
        end: cue.end,
        url: path ? resolveUrl(path, baseUrl) : '',
        x: rect ? Number(rect[1]) : 0,
        y: rect ? Number(rect[2]) : 0,
        w: rect ? Number(rect[3]) : 0,
        h: rect ? Number(rect[4]) : 0,
      };
    })
    .filter((t) => t.url);
}

/** Binary search over cues sorted by start. */
export function findThumb(thumbs: Thumb[], time: number): Thumb | null {
  let lo = 0;
  let hi = thumbs.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const t = thumbs[mid]!;
    if (time < t.start) hi = mid - 1;
    else if (time >= t.end) lo = mid + 1;
    else return t;
  }
  return null;
}
```

- [ ] **Step 4: Implement `src/plugins/thumbnails/index.ts`**

```ts
import type { Plugin } from '../../types';
import { h } from '../../ui/dom';
import { clamp } from '../../shared/clamp';
import { formatTime } from '../../shared/time';
import { findThumb, parseThumbnails, type Thumb } from './parse';

declare module '../../types' {
  interface PlayerOptions {
    /** WebVTT with sprite rectangles (`#xywh=`). PlayerJS: thumbnails. */
    thumbnails?: string;
  }
  interface PlayerCommands {
    /** Load a thumbnails VTT; an empty string clears them. */
    setThumbnails(url: string): void;
  }
}

export interface ThumbnailsPluginOptions {
  thumbnails?: string;
  fetch?: typeof fetch;
}

const FALLBACK_W = 160;
const FALLBACK_H = 90;

export function thumbnailsPlugin(o: ThumbnailsPluginOptions = {}): Plugin {
  return {
    name: 'thumbnails',
    setup(ctx) {
      const fetchText = o.fetch ?? fetch.bind(globalThis);
      let thumbs: Thumb[] = [];
      let request = 0;

      const load = (url: string) => {
        const id = ++request;
        thumbs = [];
        if (!url) return;
        fetchText(url)
          .then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.text();
          })
          .then((text) => {
            if (id === request) thumbs = parseThumbnails(text, url);
          })
          .catch((e: unknown) => {
            ctx.log.warn(`thumbnails "${url}" failed to load`, e);
            ctx.events.emit('loaderror', { url, error: { kind: 'network', message: String(e) } });
          });
      };

      ctx.registerComponent('thumbnail-preview', (ui) => {
        const image = h('div', { class: 'vp-thumb-image' });
        const time = h('div', { class: 'vp-thumb-time' });
        const el = h('div', { class: 'vp-thumb vp-hidden', 'aria-hidden': 'true' }, image, time);

        ui.on('ui:timeline-hover', ({ time: t, rootX }) => {
          const s = ui.store.get();
          time.textContent = formatTime(t, s.duration);
          const thumb = findThumb(thumbs, t);
          let width = 0;
          if (thumb) {
            const w = thumb.w || FALLBACK_W;
            const hgt = thumb.h || FALLBACK_H;
            width = w;
            image.hidden = false;
            image.style.width = `${w}px`;
            image.style.height = `${hgt}px`;
            image.style.backgroundImage = `url("${thumb.url.replace(/"/g, '%22')}")`;
            image.style.backgroundPosition = thumb.w ? `-${thumb.x}px -${thumb.y}px` : 'center';
            image.style.backgroundSize = thumb.w ? 'auto' : 'cover';
          } else {
            image.hidden = true;
          }
          const half = (width || 48) / 2;
          el.style.left = `${clamp(rootX - half, 4, Math.max(4, s.width - half * 2 - 4))}px`;
          el.classList.remove('vp-hidden');
        });
        ui.on('ui:timeline-leave', () => el.classList.add('vp-hidden'));
        return { el };
      });

      const offs: Array<() => void> = [
        ctx.addLayer({ type: 'thumbnail-preview' }, 'above-ui'),
        ctx.commands.register('setThumbnails', ([url]) => load(url)),
      ];
      const initial = o.thumbnails ?? ctx.options.thumbnails;
      if (initial) load(initial);
      return () => {
        request++;
        offs.forEach((off) => off());
      };
    },
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/plugins/thumbnails.test.ts`
Expected: PASS. (`style.backgroundPosition` normalizes `0px`; if jsdom reports `-160px 0px` differently, compare with `toMatch(/^-160px 0(px)?$/)`.)

- [ ] **Step 6: Add thumbnail styles** — append to `src/theme/player.css`:

```css
/* thumbnails */
.vp-thumb {
  position: absolute;
  bottom: 72px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  pointer-events: none !important;
}
.vp-thumb-image {
  border: 2px solid rgba(255, 255, 255, 0.85);
  border-radius: 4px;
  background-color: #000;
  background-repeat: no-repeat;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
}
.vp-thumb-time {
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.75);
  font-size: 0.85em;
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 7: Run the whole suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: all pass; typecheck exits 0.

- [ ] **Step 8: Commit**

```bash
git add src/plugins/thumbnails tests/plugins/thumbnails.test.ts src/theme/player.css
git commit -m "feat(plugins): add sprite thumbnails preview plugin"
```

## Chunk 7b: Plugins B — playlist, media session, default plugins

Delivers: the playlist plugin (JSON/URL playlists with folders, panel, `prev`/`next`/`playlist-button` components, hide rules, autonext/loop), the media session plugin, `defaultPlugins()`, and wiring the defaults into `createPlayer` and the public exports.

Spec references: §7 (playlist, mediasession rows), §4.3 step 1 (playlist before-hook), §6.7 (default layout optional nodes). Deviations 5 and 23 apply. Playlist titles are rendered as text (`textContent`); PlayerJS allows HTML in titles, which is intentionally not supported (XSS).

### Task 7.5: Playlist model

**Files:**
- Create: `src/plugins/playlist/model.ts`
- Test: `tests/plugins/playlist-model.test.ts`

- [ ] **Step 1: Write the failing test `tests/plugins/playlist-model.test.ts`**

```ts
import { describe, expect, it, vi } from 'vitest';
import { findIndex, flattenPlaylist, loadPlaylistInput, normalizePlaylist } from '../../src/plugins/playlist/model';

const items = [
  { title: 'Intro', file: 'intro.mp4', id: 'i' },
  {
    title: 'Season 1',
    folder: [
      { title: 'S1E1', file: 's1e1.mp4', id: 's1e1' },
      { title: 'S1E2', file: 's1e2.mp4' },
    ],
  },
  { title: 'No file' },
];

describe('playlist model', () => {
  it('normalizes arrays, {playlist} wrappers and single items', () => {
    expect(normalizePlaylist(items)).toBe(items);
    expect(normalizePlaylist({ playlist: items })).toBe(items);
    expect(normalizePlaylist({ title: 'x', file: 'x.mp4' })).toEqual([{ title: 'x', file: 'x.mp4' }]);
    expect(() => normalizePlaylist(42)).toThrow(/playlist/);
  });

  it('flattens folders depth-first and skips entries without files', () => {
    const flat = flattenPlaylist(items);
    expect(flat.map((f) => f.item.title)).toEqual(['Intro', 'S1E1', 'S1E2']);
    expect(flat.map((f) => f.index)).toEqual([0, 1, 2]);
    expect(flat[1]!.depth).toBe(1);
  });

  it('finds items by index, numeric string or id', () => {
    const flat = flattenPlaylist(items);
    expect(findIndex(flat, 2)).toBe(2);
    expect(findIndex(flat, '1')).toBe(1);
    expect(findIndex(flat, 's1e1')).toBe(1);
    expect(findIndex(flat, 'missing')).toBe(-1);
    expect(findIndex(flat, 9)).toBe(-1);
    const numericIds = flattenPlaylist([{ file: 'a.mp4', id: '7' }, { file: 'b.mp4', id: '0' }]);
    expect(findIndex(numericIds, '7')).toBe(0);
    expect(findIndex(numericIds, '0')).toBe(1);
    expect(findIndex(numericIds, 1)).toBe(1);
  });

  it('loads JSON strings and urls', async () => {
    expect(await loadPlaylistInput(JSON.stringify(items), fetch)).toEqual(items);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ playlist: items })));
    expect(await loadPlaylistInput('https://a.com/pl.txt', fetchMock as unknown as typeof fetch)).toEqual(items);
    expect(fetchMock).toHaveBeenCalledWith('https://a.com/pl.txt');
    const bad = vi.fn(async () => new Response('not json'));
    await expect(loadPlaylistInput('https://a.com/pl.json', bad as unknown as typeof fetch)).rejects.toThrow();
    const missing = vi.fn(async () => new Response('', { status: 404 }));
    await expect(loadPlaylistInput('https://a.com/pl.json', missing as unknown as typeof fetch)).rejects.toThrow(/404/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/plugins/playlist-model.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/plugins/playlist/model.ts`**

```ts
export interface PlaylistItem {
  title?: string;
  file?: string;
  poster?: string;
  /** `[Label]url,[Label]url` */
  subtitle?: string;
  thumbnails?: string;
  id?: string;
  /** Seconds, or 'continue' to keep the current position (e.g. switching dubs). */
  start?: number | 'continue';
  folder?: PlaylistItem[];
  [key: string]: unknown;
}

export interface FlatItem {
  item: PlaylistItem;
  index: number;
  depth: number;
}

export interface PlaylistState {
  items: PlaylistItem[];
  flat: FlatItem[];
  index: number;
  open: boolean;
}

export function normalizePlaylist(data: unknown): PlaylistItem[] {
  if (Array.isArray(data)) return data as PlaylistItem[];
  if (data && typeof data === 'object') {
    const wrapped = (data as { playlist?: unknown }).playlist;
    if (Array.isArray(wrapped)) return wrapped as PlaylistItem[];
    if ('file' in data || 'folder' in data) return [data as PlaylistItem];
  }
  throw new Error('Invalid playlist: expected an array of items');
}

export function flattenPlaylist(items: PlaylistItem[]): FlatItem[] {
  const flat: FlatItem[] = [];
  const walk = (list: PlaylistItem[], depth: number) => {
    for (const item of list) {
      if (Array.isArray(item.folder)) walk(item.folder, depth + 1);
      else if (item.file) flat.push({ item, index: flat.length, depth });
    }
  };
  walk(items, 0);
  return flat;
}

/** By id first (ids are often numeric strings in CMS data), then by index. */
export function findIndex(flat: FlatItem[], idOrIndex: string | number): number {
  const byId = flat.findIndex((f) => f.item.id !== undefined && String(f.item.id) === String(idOrIndex));
  if (byId >= 0) return byId;
  if (typeof idOrIndex === 'number' || /^\d+$/.test(idOrIndex)) {
    const i = Number(idOrIndex);
    return i >= 0 && i < flat.length ? i : -1;
  }
  return -1;
}

/** A JSON string, or a URL to a JSON (.txt/.json) playlist. */
export async function loadPlaylistInput(input: string, fetchFn: typeof fetch): Promise<PlaylistItem[]> {
  const trimmed = input.trim();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) return normalizePlaylist(JSON.parse(trimmed));
  const response = await fetchFn(trimmed);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return normalizePlaylist(JSON.parse(await response.text()));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/plugins/playlist-model.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/plugins/playlist/model.ts tests/plugins/playlist-model.test.ts
git commit -m "feat(playlist): add playlist model with folders"
```

### Task 7.6: Playlist plugin, panel and buttons

**Files:**
- Create: `src/plugins/playlist/panel.ts`, `src/plugins/playlist/index.ts`
- Modify: `src/ui/i18n.ts` (add `close`)
- Test: `tests/plugins/playlist.test.ts`

- [ ] **Step 1: Write the failing test `tests/plugins/playlist.test.ts`**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { playlistPlugin } from '../../src/plugins/playlist';
import { createTestPlayer } from '../helpers/player-harness';
import { flush } from '../helpers/flush';
import type { PlayerOptions, Plugin, SourceSpec } from '../../src/types';

const ITEMS = [
  { title: 'One', file: 'one.mp4', id: 'a', poster: 'one.jpg', subtitle: '[En]one.vtt', thumbnails: 'one-thumbs.vtt' },
  { title: 'Folder', folder: [{ title: 'Two', file: 'two.mp4', id: 'b' }] },
  { title: 'Three', file: 'three.mp4', id: 'c', start: 'continue' },
];
const JSON_ITEMS = JSON.stringify(ITEMS);
const fetchMock = vi.fn(async (url: string) => (url.endsWith('pl.json') ? new Response(JSON_ITEMS) : new Response('', { status: 404 })));

let specs: SourceSpec[];
let thumbs: string[];
const spy: Plugin = {
  name: 'spy',
  setup(ctx) {
    ctx.events.on('new', ({ spec }) => specs.push(spec));
    ctx.commands.register('setThumbnails', ([url]) => void thumbs.push(url));
  },
};

async function setup(options: Partial<PlayerOptions> = {}) {
  const t = createTestPlayer({ source: JSON_ITEMS, ...options, plugins: [spy, playlistPlugin({ fetch: fetchMock as unknown as typeof fetch })] });
  await flush();
  return t;
}

beforeEach(() => {
  specs = [];
  thumbs = [];
  fetchMock.mockClear();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('playlistPlugin loading', () => {
  it('intercepts playlist input and loads the first item with its metadata', async () => {
    const { player, fp } = await setup();
    expect(fp.loads.map((l) => l.url)).toEqual(['one.mp4']);
    expect(player.state.title).toBe('One');
    expect(player.state.poster).toBe('one.jpg');
    expect(specs[0]!.subtitles).toEqual([{ label: 'En', url: 'one.vtt' }]);
    expect(thumbs).toEqual(['one-thumbs.vtt']);
    expect(player.state.playlist!.flat).toHaveLength(3);
    expect(player.api('playlist')).toEqual(ITEMS);
  });

  it('loads a playlist url and honours plstart', async () => {
    const { fp } = await setup({ source: 'https://a.com/pl.json', plstart: 'b' });
    expect(fetchMock).toHaveBeenCalledWith('https://a.com/pl.json');
    expect(fp.loads.map((l) => l.url)).toEqual(['two.mp4']);
  });

  it('reports a broken playlist url without crashing', async () => {
    const errors: string[] = [];
    const { player } = createTestPlayer({ plugins: [playlistPlugin({ fetch: fetchMock as unknown as typeof fetch })] });
    player.on('loaderror', ({ url }) => errors.push(url));
    player.load('https://a.com/missing.json');
    await flush();
    expect(errors).toEqual(['https://a.com/missing.json']);
    expect(player.state.playlist).toBeUndefined();
  });
});

describe('playlistPlugin navigation', () => {
  it('next/prev/playItem with play-after-load and events', async () => {
    const { player, fp, media } = await setup();
    const events: string[] = [];
    player.on('next', () => events.push('next'));
    player.on('previous', () => events.push('previous'));
    player.command('next');
    await flush();
    expect(fp.loads[fp.loads.length - 1]!.url).toBe('two.mp4');
    expect(media.play).toHaveBeenCalledTimes(1);
    player.command('prev');
    await flush();
    expect(fp.loads[fp.loads.length - 1]!.url).toBe('one.mp4');
    player.api('find', 'c');
    await flush();
    expect(fp.loads[fp.loads.length - 1]!.url).toBe('three.mp4');
    expect(media.play).toHaveBeenCalledTimes(2);
    expect(events).toEqual(['next', 'previous']);
  });

  it('autonext on end, stops at the last item, wraps with playlistLoop', async () => {
    const { player, fp, media } = await setup();
    player.command('playItem', 2, false);
    await flush();
    media.end();
    await flush();
    expect(fp.loads[fp.loads.length - 1]!.url).toBe('three.mp4');
    player.command('setPlaylistLoop', true);
    media.end();
    await flush();
    expect(fp.loads[fp.loads.length - 1]!.url).toBe('one.mp4');
    player.command('setAutonext', false);
    media.end();
    await flush();
    expect(fp.loads[fp.loads.length - 1]!.url).toBe('one.mp4');
  });

  it("start: 'continue' keeps the current position", async () => {
    const { player, fp, media } = await setup();
    media.timeTo(42);
    player.command('playItem', 'c', false);
    await flush();
    expect(fp.loads[fp.loads.length - 1]).toEqual({ url: 'three.mp4', start: 42 });
  });

  it("api('play', playlist) loads the playlist and plays its first item", async () => {
    const { player, fp, media } = createTestPlayer({ plugins: [spy, playlistPlugin({ fetch: fetchMock as unknown as typeof fetch })] });
    player.api('play', JSON_ITEMS);
    await flush();
    expect(fp.loads.map((l) => l.url)).toEqual(['one.mp4']);
    expect(media.play).toHaveBeenCalledTimes(1);
  });

  it('a direct load wins over a playlist that is still loading', async () => {
    const { player, fp } = createTestPlayer({ plugins: [playlistPlugin({ fetch: fetchMock as unknown as typeof fetch })] });
    player.load('https://a.com/pl.json');
    player.load('direct.mp4');
    await flush();
    expect(fp.loads.map((l) => l.url)).toEqual(['direct.mp4']);
  });

  it('push appends and setPlaylist replaces', async () => {
    const { player, fp } = await setup();
    player.command('push', [{ title: 'Four', file: 'four.mp4' }]);
    expect(player.state.playlist!.flat).toHaveLength(4);
    expect(player.state.playlist!.index).toBe(0);
    player.command('setPlaylist', [{ title: 'Solo', file: 'solo.mp4' }]);
    await flush();
    expect(player.state.playlist!.flat).toHaveLength(1);
    expect(fp.loads[fp.loads.length - 1]!.url).toBe('solo.mp4');
  });
});

describe('playlistPlugin UI', () => {
  it('renders prev/next/playlist-button with hide rules', async () => {
    const { player, host } = await setup();
    const prev = host.querySelector('.vp-prev')!;
    const next = host.querySelector('.vp-next')!;
    expect(prev.classList.contains('vp-hidden')).toBe(true);
    expect(next.classList.contains('vp-hidden')).toBe(false);
    expect(host.querySelector('.vp-playlist-button')!.classList.contains('vp-hidden')).toBe(false);
    player.command('playItem', 2, false);
    await flush();
    expect(prev.classList.contains('vp-hidden')).toBe(false);
    expect(next.classList.contains('vp-hidden')).toBe(true);
  });

  it('opens the panel with folders and plays a clicked item', async () => {
    const { player, host, fp, media } = await setup();
    const panel = host.querySelector('.vp-playlist')!;
    expect(panel.classList.contains('vp-hidden')).toBe(true);
    host.querySelector<HTMLButtonElement>('.vp-playlist-button')!.click();
    expect(panel.classList.contains('vp-hidden')).toBe(false);
    expect(panel.querySelector('details summary')!.textContent).toBe('Folder');
    const buttons = [...panel.querySelectorAll<HTMLButtonElement>('.vp-playlist-item')];
    expect(buttons.map((b) => b.textContent)).toEqual(['One', 'Two', 'Three']);
    expect(buttons[0]!.classList.contains('vp-active')).toBe(true);
    buttons[1]!.click();
    await flush();
    expect(fp.loads[fp.loads.length - 1]!.url).toBe('two.mp4');
    expect(media.play).toHaveBeenCalled();
    expect(player.state.playlist!.open).toBe(false);
  });

  it('starts open when hidePlaylist is false', async () => {
    const { player } = await setup({ hidePlaylist: false });
    expect(player.state.playlist!.open).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/plugins/playlist.test.ts`
Expected: FAIL — cannot resolve `../../src/plugins/playlist`.

- [ ] **Step 3: Add the `close` i18n key**

In `src/ui/i18n.ts` add `close: 'Закрыть',` after `retry` in `ru` and `close: 'Close',` after `retry` in `en`.

- [ ] **Step 4: Implement `src/plugins/playlist/panel.ts`**

```ts
import type { ComponentFactory } from '../../types';
import { h } from '../../ui/dom';
import { createIconButton } from '../../ui/button';
import type { PlaylistItem, PlaylistState } from './model';

export function playlistPanelComponent(onSelect: (index: number) => void, onClose: () => void): ComponentFactory {
  return (ctx) => {
    const list = h('div', { class: 'vp-playlist-list' });
    const close = createIconButton(ctx, 'vp-playlist-close', onClose);
    close.setIcon('back');
    close.setLabel('close');
    const el = h(
      'div',
      { class: 'vp-playlist', role: 'dialog', 'aria-label': ctx.t('playlist') },
      h('div', { class: 'vp-playlist-header' }, close.el, h('span', { class: 'vp-playlist-heading' }, ctx.t('playlist'))),
      list,
    );
    ctx.listen(el, 'click', (e) => e.stopPropagation());

    const render = (pl: PlaylistState | undefined) => {
      list.replaceChildren();
      if (!pl) return;
      const indexOf = new Map(pl.flat.map((f) => [f.item, f.index]));
      const build = (items: PlaylistItem[], container: HTMLElement) => {
        for (const item of items) {
          if (Array.isArray(item.folder)) {
            const details = h('details', { class: 'vp-playlist-folder', open: true }, h('summary', {}, String(item.title ?? '')));
            build(item.folder, details);
            container.append(details);
          } else if (item.file) {
            const index = indexOf.get(item)!;
            const button = h(
              'button',
              { class: `vp-playlist-item${index === pl.index ? ' vp-active' : ''}`, type: 'button', 'aria-current': index === pl.index ? 'true' : undefined },
              item.poster ? h('img', { class: 'vp-playlist-poster', src: String(item.poster), alt: '', loading: 'lazy' }) : null,
              h('span', { class: 'vp-playlist-title' }, String(item.title ?? item.file)),
            );
            button.addEventListener('click', (e) => {
              e.stopPropagation();
              onSelect(index);
            });
            container.append(button);
          }
        }
      };
      build(pl.items, list);
    };

    ctx.select((s) => s.playlist, render, {
      immediate: true,
      equals: (a, b) => a?.items === b?.items && a?.index === b?.index,
    });
    return { el };
  };
}
```

- [ ] **Step 5: Implement `src/plugins/playlist/index.ts`**

```ts
import type { Plugin, SourceSpecInput } from '../../types';
import { isPlaylistInput, parseSource, parseSubtitleList } from '../../source/parse';
import { createIconButton } from '../../ui/button';
import { findIndex, flattenPlaylist, loadPlaylistInput, normalizePlaylist, type PlaylistItem, type PlaylistState } from './model';
import { playlistPanelComponent } from './panel';

export type { PlaylistItem, PlaylistState } from './model';

declare module '../../types' {
  interface PlayerState {
    playlist?: PlaylistState;
    autonext?: boolean;
    playlistLoop?: boolean;
  }
  interface PlayerOptions {
    /** Play the next item at the end (default true). */
    autonext?: boolean;
    /** Wrap around at the ends. PlayerJS: playlistloop. */
    playlistLoop?: boolean;
    /** Item id to start with. PlayerJS: plstart. */
    plstart?: string;
    /** Keep the panel closed initially (default true). PlayerJS: hideplaylist. */
    hidePlaylist?: boolean;
  }
  interface PlayerCommands {
    next(): void;
    prev(): void;
    playItem(idOrIndex: string | number, autoplay?: boolean): void;
    push(items: PlaylistItem[]): void;
    setPlaylist(input: string | PlaylistItem[]): void;
    togglePlaylist(): void;
    setAutonext(on: boolean): void;
    setPlaylistLoop(on: boolean): void;
  }
}

export interface PlaylistPluginOptions {
  autonext?: boolean;
  playlistLoop?: boolean;
  plstart?: string;
  hidePlaylist?: boolean;
  fetch?: typeof fetch;
}

export function playlistPlugin(o: PlaylistPluginOptions = {}): Plugin {
  return {
    name: 'playlist',
    setup(ctx) {
      const fetchFn = o.fetch ?? fetch.bind(globalThis);
      const startOpen = (o.hidePlaylist ?? ctx.options.hidePlaylist ?? true) === false;
      let plstart = o.plstart ?? ctx.options.plstart;
      let itemThumbs = false;
      ctx.store.set({ autonext: o.autonext ?? ctx.options.autonext ?? true, playlistLoop: o.playlistLoop ?? ctx.options.playlistLoop ?? false });

      const current = () => ctx.store.get().playlist;
      const setOpen = (open: boolean) => {
        const pl = current();
        if (pl) ctx.store.set({ playlist: { ...pl, open } });
      };

      /** Spec §3.4: play after the provider loaded the item; cancelled by the next load or an error. */
      const playAfterLoad = () => {
        const offs: Array<() => void> = [];
        const cleanup = () => offs.forEach((off) => off());
        offs.push(
          ctx.events.once('metadata', () => {
            cleanup();
            ctx.player.play().catch((e) => ctx.log.warn('playlist play rejected', e));
          }),
          ctx.events.once('new', cleanup),
          ctx.events.once('error', cleanup),
        );
      };

      const playIndex = (index: number, autoplay: boolean) => {
        const pl = current();
        const entry = pl?.flat[index];
        if (!pl || !entry) return;
        const item = entry.item;
        const startTime = item.start === 'continue' ? ctx.store.get().currentTime : typeof item.start === 'number' ? item.start : undefined;
        ctx.store.set({ playlist: { ...pl, index } });
        ctx.commands.run('setTitle', [item.title !== undefined ? String(item.title) : '']);
        ctx.commands.run('setPoster', [item.poster !== undefined ? String(item.poster) : '']);
        if (ctx.commands.has('setThumbnails') && (item.thumbnails || itemThumbs)) {
          itemThumbs = !!item.thumbnails;
          ctx.commands.run('setThumbnails', [item.thumbnails ? String(item.thumbnails) : (ctx.options.thumbnails ?? '')]);
        }
        const spec = parseSource(String(item.file), { qualities: ctx.options.qualities });
        const input: SourceSpecInput = {
          ...spec,
          subtitles: [...spec.subtitles, ...(item.subtitle ? parseSubtitleList(String(item.subtitle)) : [])],
        };
        const start = startTime ?? spec.start;
        if (start !== undefined) input.start = start;
        else delete input.start;
        ctx.commands.run('load', [input]);
        if (autoplay) playAfterLoad();
      };

      const setItems = (items: PlaylistItem[]) => {
        const flat = flattenPlaylist(items);
        const startIndex = plstart !== undefined ? Math.max(0, findIndex(flat, plstart)) : 0;
        plstart = undefined;
        ctx.store.set({ playlist: { items, flat, index: -1, open: current()?.open ?? startOpen } });
        ctx.events.emit('playlist', items);
        if (flat.length) playIndex(startIndex, false);
      };

      let request = 0;
      const open = (input: string | PlaylistItem[]) => {
        const id = ++request;
        const loading = typeof input === 'string' ? loadPlaylistInput(input, fetchFn) : Promise.resolve().then(() => normalizePlaylist(input));
        loading.then((items) => {
          if (id === request) setItems(items);
        }).catch((e: unknown) => {
          ctx.log.warn('playlist failed to load', e);
          ctx.events.emit('loaderror', { url: typeof input === 'string' ? input : '', error: { kind: 'network', message: String(e) } });
        });
      };

      const neighbour = (step: 1 | -1): number | null => {
        const pl = current();
        if (!pl || !pl.flat.length) return null;
        const next = pl.index + step;
        if (next >= 0 && next < pl.flat.length) return next;
        return ctx.store.get().playlistLoop ? (next + pl.flat.length) % pl.flat.length : null;
      };

      // Components
      ctx.registerComponent('prev', (ui) => {
        const b = createIconButton(ui, 'vp-prev', () => ui.user('prev'));
        b.setIcon('prev');
        b.setLabel('prev');
        return { el: b.el };
      });
      ctx.registerComponent('next', (ui) => {
        const b = createIconButton(ui, 'vp-next', () => ui.user('next'));
        b.setIcon('next');
        b.setLabel('next');
        return { el: b.el };
      });
      ctx.registerComponent('playlist-button', (ui) => {
        const b = createIconButton(ui, 'vp-playlist-button', () => ui.user('togglePlaylist'));
        b.setIcon('playlist');
        b.setLabel('playlist');
        ui.select((s) => !!s.playlist?.open, (isOpen) => b.el.setAttribute('aria-expanded', String(isOpen)), { immediate: true });
        return { el: b.el };
      });
      ctx.registerComponent(
        'playlist-panel',
        playlistPanelComponent(
          (index) => {
            setOpen(false);
            playIndex(index, true);
          },
          () => setOpen(false),
        ),
      );

      // Hide rules
      ctx.registerHideRule('first-item', () => ({ test: (s) => !s.playlist || (s.playlist.index <= 0 && !s.playlistLoop) }));
      ctx.registerHideRule('last-item', () => ({ test: (s) => !s.playlist || (s.playlist.index >= s.playlist.flat.length - 1 && !s.playlistLoop) }));
      ctx.registerHideRule('no-playlist', () => ({ test: (s) => !s.playlist || s.playlist.flat.length < 2 }));
      ctx.registerHideRule('playlist-closed', () => ({ test: (s) => !s.playlist?.open }));

      const offs: Array<() => void> = [
        ctx.addLayer({ type: 'playlist-panel', hide: ['playlist-closed'] }, 'above-ui'),

        ctx.commands.before('load', ([input]) => {
          if (!isPlaylistInput(input)) {
            request++; // a direct load supersedes a playlist that is still loading
            return;
          }
          open(input as string);
          return false;
        }),

        ctx.commands.register('setPlaylist', ([input]) => open(input)),
        ctx.commands.register('playItem', ([idOrIndex, autoplay = true]) => {
          const pl = current();
          if (!pl) return;
          const index = findIndex(pl.flat, idOrIndex);
          if (index >= 0) playIndex(index, autoplay);
        }),
        ctx.commands.register('next', () => {
          const index = neighbour(1);
          if (index === null) return;
          playIndex(index, true);
          ctx.events.emit('next');
        }),
        ctx.commands.register('prev', () => {
          const index = neighbour(-1);
          if (index === null) return;
          playIndex(index, true);
          ctx.events.emit('previous');
        }),
        ctx.commands.register('push', ([items]) => {
          const pl = current();
          const added = normalizePlaylist(items);
          if (!pl) {
            setItems(added);
            return;
          }
          const merged = [...pl.items, ...added];
          ctx.store.set({ playlist: { ...pl, items: merged, flat: flattenPlaylist(merged) } });
          ctx.events.emit('playlist', merged);
        }),
        ctx.commands.register('togglePlaylist', () => setOpen(!current()?.open)),
        ctx.commands.register('setAutonext', ([on]) => ctx.store.set({ autonext: on })),
        ctx.commands.register('setPlaylistLoop', ([on]) => ctx.store.set({ playlistLoop: on })),

        ctx.events.on('end', () => {
          if (!ctx.store.get().autonext) return;
          const index = neighbour(1);
          if (index !== null) playIndex(index, true);
        }),
      ];

      return () => offs.forEach((off) => off());
    },
  };
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run tests/plugins/playlist.test.ts`
Expected: PASS. Note the "autonext" test: with `autonext` on and no loop, the end of the last item triggers nothing; after `setPlaylistLoop(true)` the end wraps to `one.mp4`; with `setAutonext(false)` nothing loads.

- [ ] **Step 7: Add playlist styles** — append to `src/theme/player.css`:

```css
/* playlist */
.vp-playlist {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  width: min(320px, 85%);
  background: var(--vp-color-3);
  box-shadow: -6px 0 24px rgba(0, 0, 0, 0.4);
  transition: opacity 0.2s ease, visibility 0.2s ease, translate 0.2s ease;
}
.vp-playlist.vp-hidden {
  translate: 24px 0;
}
.vp-playlist-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
  font-weight: 600;
}
.vp-playlist-list {
  flex: 1;
  overflow-y: auto;
  padding: 6px 0;
}
.vp-playlist-folder > summary {
  padding: 8px 14px;
  cursor: pointer;
  font-weight: 600;
  opacity: 0.85;
}
.vp-playlist-folder .vp-playlist-item {
  padding-left: 26px;
}
.vp-playlist-item {
  all: unset;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 14px;
  cursor: pointer;
}
.vp-playlist-item:hover,
.vp-playlist-item:focus-visible {
  background: rgba(255, 255, 255, 0.1);
}
.vp-playlist-item.vp-active {
  color: var(--vp-color-1);
}
.vp-playlist-poster {
  width: 64px;
  height: 36px;
  flex: none;
  border-radius: 3px;
  object-fit: cover;
}
.vp-playlist-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

- [ ] **Step 8: Commit**

```bash
git add src/plugins/playlist tests/plugins/playlist.test.ts src/ui/i18n.ts src/theme/player.css
git commit -m "feat(plugins): add playlist plugin with folders, panel and navigation"
```

## Chunk 7c: Media session and default plugins

### Task 7.7: Media session plugin

**Files:**
- Create: `src/plugins/mediasession.ts`
- Test: `tests/plugins/mediasession.test.ts`

- [ ] **Step 1: Write the failing test `tests/plugins/mediasession.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mediaSessionPlugin } from '../../src/plugins/mediasession';
import { createTestPlayer } from '../helpers/player-harness';
import { flush } from '../helpers/flush';

let handlers: Record<string, ((details?: { seekTime?: number }) => void) | null>;
let session: { metadata: unknown; playbackState: string; setActionHandler: (name: string, fn: ((d?: { seekTime?: number }) => void) | null) => void };

beforeEach(() => {
  handlers = {};
  session = {
    metadata: null,
    playbackState: 'none',
    setActionHandler: (name, fn) => {
      handlers[name] = fn;
    },
  };
  Object.defineProperty(navigator, 'mediaSession', { configurable: true, value: session });
  vi.stubGlobal(
    'MediaMetadata',
    class {
      constructor(public init: unknown) {}
    },
  );
});
afterEach(() => {
  delete (navigator as unknown as { mediaSession?: unknown }).mediaSession;
  vi.unstubAllGlobals();
});

describe('mediaSessionPlugin', () => {
  it('publishes metadata and playback state', async () => {
    const { player } = createTestPlayer({ plugins: [mediaSessionPlugin()], title: 'Hello', poster: 'p.jpg', source: 'a.mp4' });
    await flush();
    expect((session.metadata as { init: unknown }).init).toEqual({ title: 'Hello', artwork: [{ src: 'p.jpg' }] });
    await player.play();
    expect(session.playbackState).toBe('playing');
    player.pause();
    expect(session.playbackState).toBe('paused');
  });

  it('routes action handlers to commands and clears them on destroy', async () => {
    const { player, media } = createTestPlayer({ plugins: [mediaSessionPlugin()], source: 'a.mp4' });
    await flush();
    media.setDuration(100);
    handlers.play!();
    await flush();
    expect(player.state.status).toBe('playing');
    handlers.seekto!({ seekTime: 30 });
    expect(player.video.currentTime).toBe(30);
    handlers.seekforward!();
    expect(player.video.currentTime).toBe(40);
    handlers.pause!();
    expect(player.state.status).toBe('paused');
    expect(handlers.nexttrack).toBeNull();
    player.destroy();
    expect(handlers.play).toBeNull();
  });

  it('does nothing without the API or when disabled', () => {
    delete (navigator as unknown as { mediaSession?: unknown }).mediaSession;
    expect(() => createTestPlayer({ plugins: [mediaSessionPlugin()] })).not.toThrow();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/plugins/mediasession.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/plugins/mediasession.ts`**

```ts
import type { CommandContext, CommandName, Plugin } from '../types';

declare module '../types' {
  interface PlayerOptions {
    /** `false` disables lock-screen / media keys integration. */
    mediasession?: boolean;
  }
}

type Handler = (details?: { seekTime?: number; seekOffset?: number }) => void;
const USER: CommandContext = { source: 'user' };
const ACTIONS = ['play', 'pause', 'seekto', 'seekbackward', 'seekforward', 'previoustrack', 'nexttrack'] as const;

export function mediaSessionPlugin(): Plugin {
  return {
    name: 'mediasession',
    setup(ctx) {
      if (ctx.options.mediasession === false || typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
      const session = navigator.mediaSession;
      const run = (name: CommandName, ...args: unknown[]) => {
        const result = (ctx.commands.run as unknown as (n: string, a: unknown[], c: CommandContext) => unknown)(name, args, USER);
        if (result instanceof Promise) result.catch((e) => ctx.log.warn('media session action rejected', e));
      };
      const handlers: Record<(typeof ACTIONS)[number], Handler | null> = {
        play: () => run('play'),
        pause: () => run('pause'),
        seekto: (d) => {
          if (typeof d?.seekTime === 'number') run('seek', d.seekTime);
        },
        seekbackward: (d) => run('seek', `-${d?.seekOffset ?? 10}`),
        seekforward: (d) => run('seek', `+${d?.seekOffset ?? 10}`),
        previoustrack: ctx.commands.has('prev') ? () => run('prev' as CommandName) : null,
        nexttrack: ctx.commands.has('next') ? () => run('next' as CommandName) : null,
      };
      const setHandler = (name: string, fn: Handler | null) => {
        try {
          session.setActionHandler(name as MediaSessionAction, fn as MediaSessionActionHandler | null);
        } catch {
          /* action not supported by this browser */
        }
      };
      for (const name of ACTIONS) setHandler(name, handlers[name]);

      const offs = [
        ctx.store.select(
          (s) => `${s.title}\n${s.poster}`,
          () => {
            const s = ctx.store.get();
            try {
              session.metadata = new MediaMetadata({ title: s.title, artwork: s.poster ? [{ src: s.poster }] : [] });
            } catch {
              /* MediaMetadata missing */
            }
          },
          { immediate: true },
        ),
        ctx.store.select(
          (s) => s.status,
          (status) => {
            session.playbackState = status === 'playing' ? 'playing' : status === 'paused' || status === 'ended' ? 'paused' : 'none';
          },
          { immediate: true },
        ),
      ];
      return () => {
        offs.forEach((off) => off());
        for (const name of ACTIONS) setHandler(name, null);
      };
    },
  };
}
```

Note: this plugin must come after `playlist` in `defaultPlugins()` so `commands.has('prev'/'next')` is true at setup time.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/plugins/mediasession.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/plugins/mediasession.ts tests/plugins/mediasession.test.ts
git commit -m "feat(plugins): add media session plugin"
```

### Task 7.8: Default plugins and wiring

**Files:**
- Create: `src/plugins/index.ts`
- Modify: `src/player.ts` (default `plugins`), `src/index.ts` (exports)
- Test: `tests/plugins/defaults.test.ts`

- [ ] **Step 1: Write the failing test `tests/plugins/defaults.test.ts`**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultPlugins } from '../../src/plugins';
import { createPlayer } from '../../src/player';
import * as vp from '../../src/index';
import { createTestPlayer } from '../helpers/player-harness';
import { flush } from '../helpers/flush';

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('defaultPlugins', () => {
  it('returns all v1 plugins in dependency order', () => {
    expect(defaultPlugins().map((p) => p.name)).toEqual([
      'quality', 'speed', 'audiotracks', 'subtitles', 'thumbnails', 'playlist', 'hotkeys', 'memory', 'autoplay', 'mediasession',
    ]);
  });

  it('is the default for createPlayer', () => {
    document.body.replaceChildren();
    const host = document.body.appendChild(document.createElement('div'));
    const player = createPlayer({ container: host });
    expect(host.querySelector('.vp-subtitles')).not.toBeNull();
    expect(host.querySelector('.vp-thumb')).not.toBeNull();
    expect(host.querySelector('.vp-playlist')).not.toBeNull();
    player.destroy();
  });

  it('works together end to end', async () => {
    const { player, host, fp } = createTestPlayer({ plugins: defaultPlugins(), source: '[360p]a.mp4,[720p]b.mp4', speeds: [1, 2] });
    await flush();
    expect(fp.loads[0]!.url).toBe('b.mp4');
    host.querySelector<HTMLButtonElement>('.vp-settings')!.click();
    const labels = [...host.querySelectorAll('.vp-menu-item .vp-menu-label')].map((e) => e.textContent);
    expect(labels).toEqual(['Качество', 'Скорость']);
    player.root.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyM', bubbles: true, cancelable: true }));
    expect(player.state.muted).toBe(true);
    expect(localStorage.getItem('vp:muted')).toBe('1');
  });

  it('exports plugin factories from the public entry', () => {
    expect(typeof vp.defaultPlugins).toBe('function');
    expect(typeof vp.playlistPlugin).toBe('function');
    expect(typeof vp.subtitlesPlugin).toBe('function');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/plugins/defaults.test.ts`
Expected: FAIL — cannot resolve `../../src/plugins`.

- [ ] **Step 3: Implement `src/plugins/index.ts`**

```ts
import type { Plugin } from '../types';
import { qualityPlugin } from './quality';
import { speedPlugin } from './speed';
import { audioTracksPlugin } from './audiotracks';
import { subtitlesPlugin } from './subtitles';
import { thumbnailsPlugin } from './thumbnails';
import { playlistPlugin } from './playlist';
import { hotkeysPlugin } from './hotkeys';
import { autoplayPlugin } from './autoplay';
import { memoryPlugin } from './memory';
import { mediaSessionPlugin } from './mediasession';

/**
 * All v1 plugins. Order matters:
 * - memory after quality/speed/subtitles/audiotracks (its transforms and init run later, so saved values win);
 * - mediasession after playlist (prev/next commands must exist at setup).
 */
export function defaultPlugins(): Plugin[] {
  return [
    qualityPlugin(),
    speedPlugin(),
    audioTracksPlugin(),
    subtitlesPlugin(),
    thumbnailsPlugin(),
    playlistPlugin(),
    hotkeysPlugin(),
    memoryPlugin(),
    autoplayPlugin(),
    mediaSessionPlugin(),
  ];
}

export { qualityPlugin, pickQuality } from './quality';
export { speedPlugin, DEFAULT_SPEEDS } from './speed';
export { audioTracksPlugin } from './audiotracks';
export { subtitlesPlugin } from './subtitles';
export { thumbnailsPlugin } from './thumbnails';
export { playlistPlugin, type PlaylistItem, type PlaylistState } from './playlist';
export { hotkeysPlugin, type HotkeysOptions } from './hotkeys';
export { autoplayPlugin } from './autoplay';
export { memoryPlugin, shouldRestorePosition } from './memory';
export { mediaSessionPlugin } from './mediasession';
```

- [ ] **Step 4: Use the defaults in `src/player.ts`**

Add the import `import { defaultPlugins } from './plugins';` and change

```ts
  pluginHost.setupAll(options.plugins ?? [], pluginContext);
```

to

```ts
  pluginHost.setupAll(options.plugins ?? defaultPlugins(), pluginContext);
```

- [ ] **Step 5: Export plugins from `src/index.ts`** — append:

```ts
export * from './plugins';
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run tests/plugins/defaults.test.ts`
Expected: PASS.

- [ ] **Step 7: Run the whole suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: all pass (the chunk 5 `tests/player.test.ts` now runs with default plugins where it passes none; it should still pass); typecheck exits 0.

- [ ] **Step 8: Commit**

```bash
git add src/plugins/index.ts src/player.ts src/index.ts tests/plugins/defaults.test.ts
git commit -m "feat(plugins): add defaultPlugins and use them by default"
```
