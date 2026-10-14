import { formatTime, type Plugin, type TimelineMarker } from '../../src/index.js';

/**
 * Example plugin: YouTube-style timecodes ("chapters").
 * - `timecodes` option in description format: one "0:00 Title" per line;
 * - ticks on the timeline (via state.markers), a "Главы" settings submenu,
 *   the chapter name on timeline hover and a `chapter-title` component for layouts.
 */

declare module '../../src/types.js' {
  interface PlayerOptions {
    /** Lines like "1:23 Title", "[01:02:03] Title" or "- 0:05 — Title". */
    timecodes?: string;
  }
  interface PlayerCommands {
    /** Replace the chapters; an empty string clears them. */
    setTimecodes(text: string): void;
  }
}

const LINE_RE = /^\s*[-–•*]?\s*\[?((?:\d{1,2}:)?\d{1,2}:\d{2})\]?\s*[-–—:|]?\s*(.+?)\s*$/;

export function parseTimecodes(text: string): TimelineMarker[] {
  const byTime = new Map<number, string>();
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(LINE_RE);
    if (!m) continue;
    const time = m[1]!.split(':').reduce((sum, part) => sum * 60 + Number(part), 0);
    if (!byTime.has(time)) byTime.set(time, m[2]!);
  }
  return [...byTime].sort((a, b) => a[0] - b[0]).map(([time, label]) => ({ time, label }));
}

/** The chapter playing at `time`: the last one that started at or before it. */
export function chapterAt(chapters: readonly TimelineMarker[], time: number): TimelineMarker | undefined {
  let found: TimelineMarker | undefined;
  for (const c of chapters) if (c.time <= time + 0.001) found = c;
  return found;
}

const USER = { source: 'user' } as const;
const labelled = (markers: readonly TimelineMarker[]) => markers.filter((m) => m.label);

export function timecodesPlugin(o: { timecodes?: string } = {}): Plugin {
  return {
    name: 'timecodes',
    setup(ctx) {
      const set = (text: string) => ctx.store.set({ markers: parseTimecodes(text) });

      ctx.registerComponent('chapter-title', (ui) => {
        const el = document.createElement('span');
        el.className = 'vp-text demo-chapter-title';
        ui.select(
          (s) => chapterAt(labelled(s.markers), s.currentTime)?.label ?? '',
          (label) => (el.textContent = label ? `· ${label}` : ''),
          { immediate: true },
        );
        return { el };
      });

      // Reuses the thumbnail bubble styles and stacks above the thumbnails plugin's preview when it is shown.
      ctx.registerComponent('chapter-hover', (ui) => {
        const el = document.createElement('div');
        el.className = 'vp-thumb vp-hidden demo-chapter-hover';
        el.setAttribute('aria-hidden', 'true');
        const text = document.createElement('div');
        text.className = 'vp-thumb-time';
        el.append(text);
        ui.on('ui:timeline-hover', ({ time, rootX }) => {
          const label = chapterAt(labelled(ui.store.get().markers), time)?.label;
          if (!label) return el.classList.add('vp-hidden');
          text.textContent = label;
          el.classList.remove('vp-hidden');
          // The preview's listener ran first (default plugins register earlier), so its box is current.
          const preview = ui.root.querySelector<HTMLElement>('.vp-thumb:not(.demo-chapter-hover):not(.vp-hidden)');
          el.style.bottom = preview ? `${ui.root.getBoundingClientRect().bottom - preview.getBoundingClientRect().top + 4}px` : '';
          const width = el.offsetWidth;
          el.style.left = `${Math.min(Math.max(rootX - width / 2, 4), ui.store.get().width - width - 4)}px`;
        });
        ui.on('ui:timeline-leave', () => el.classList.add('vp-hidden'));
        return { el };
      });

      const offs = [
        ctx.addLayer({ type: 'chapter-hover' }, 'above-ui'),
        ctx.commands.register('setTimecodes', ([text]) => set(text)),
        ctx.registerMenu({
          id: 'chapters',
          label: 'Главы',
          order: 5,
          visible: (s) => labelled(s.markers).length > 0,
          options: (s) => labelled(s.markers).map((c) => ({ label: `${formatTime(c.time)}  ${c.label}`, value: c.time })),
          current: (s) => chapterAt(labelled(s.markers), s.currentTime)?.time,
          select: (time) => ctx.commands.run('seek', [time as number], USER),
        }),
      ];

      const initial = o.timecodes ?? ctx.options.timecodes;
      if (initial) set(initial);
      return () => {
        offs.forEach((off) => off());
        ctx.store.set({ markers: [] });
      };
    },
  };
}
