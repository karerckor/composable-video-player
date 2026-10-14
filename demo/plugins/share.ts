import { createIconButton, formatTime, type Plugin } from '../../src/index.js';

/**
 * Example plugin: "Share" with a timestamp, YouTube-style.
 * - a `share` toolbar button opens a panel with the link, a "start at 1:23" checkbox and Copy;
 * - on page load `?t=83` / `?t=1m23s` / `?t=1:23` starts the first source at that time
 *   (registered after the default plugins, so it wins over the memory plugin's saved position).
 */

/** Seconds from "83", "83s", "1m23s", "1h2m3s", "1:23" or "1:02:03"; null when unparseable. */
export function parseStartTime(value: string | null | undefined): number | null {
  const v = (value ?? '').trim().toLowerCase();
  if (/^\d+(\.\d+)?s?$/.test(v)) return parseFloat(v);
  const hms = v.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (hms && v) return Number(hms[1] ?? 0) * 3600 + Number(hms[2] ?? 0) * 60 + Number(hms[3] ?? 0);
  if (/^\d{1,2}(:\d{1,2}){1,2}$/.test(v)) return v.split(':').reduce((sum, part) => sum * 60 + Number(part), 0);
  return null;
}

/** `base` with `param` set to whole seconds, or removed when `time` is null. */
export function buildShareUrl(base: string, param: string, time: number | null): string {
  const url = new URL(base);
  if (time !== null && time >= 1) url.searchParams.set(param, String(Math.floor(time)));
  else url.searchParams.delete(param);
  return url.toString();
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Icons outside the built-in IconName set are built with DOM APIs (never innerHTML). */
function shareIcon(): HTMLSpanElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'currentColor');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', 'M14 5v4C7 10 4 15 3 20c2.5-3.5 6-5.1 11-5.1V19l7-7-7-7z');
  svg.append(path);
  const wrap = document.createElement('span');
  wrap.className = 'vp-icon';
  wrap.append(svg);
  return wrap;
}

export interface SharePluginOptions {
  /** Query parameter with the start time. Default: "t". */
  param?: string;
  /** Link to share. Default: the current page. */
  url?: () => string;
}

export function sharePlugin(o: SharePluginOptions = {}): Plugin {
  const param = o.param ?? 't';
  const pageUrl = o.url ?? (() => location.href);
  return {
    name: 'share',
    setup(ctx) {
      let panel: { toggle(): void } | null = null;

      ctx.registerComponent('share', (ui) => {
        const button = createIconButton(ui, 'demo-share', () => panel?.toggle());
        button.setLabel('Поделиться');
        button.el.replaceChildren(shareIcon());
        return { el: button.el };
      });

      ctx.registerComponent('share-panel', (ui) => {
        const el = document.createElement('div');
        el.className = 'demo-share-panel vp-hidden';
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-label', 'Поделиться');

        const title = document.createElement('div');
        title.className = 'demo-share-title';
        title.textContent = 'Поделиться';
        const close = document.createElement('button');
        close.className = 'vp-button demo-share-close';
        close.type = 'button';
        close.textContent = '✕';
        close.setAttribute('aria-label', 'Закрыть');
        title.append(close);

        const input = document.createElement('input');
        input.readOnly = true;
        input.className = 'demo-share-url';
        const atLabel = document.createElement('label');
        const at = document.createElement('input');
        at.type = 'checkbox';
        const atText = document.createElement('span');
        atLabel.append(at, atText);
        const copy = document.createElement('button');
        copy.className = 'vp-button demo-share-copy';
        copy.type = 'button';
        copy.textContent = 'Копировать';
        el.append(title, input, atLabel, copy);

        let time = 0;
        const render = () => {
          input.value = buildShareUrl(pageUrl(), param, at.checked ? time : null);
          atText.textContent = `Начать с ${formatTime(time)}`;
          copy.textContent = 'Копировать';
        };
        const open = () => {
          time = ui.store.get().currentTime;
          at.checked = time >= 1;
          render();
          el.classList.remove('vp-hidden');
          ui.store.set({ controlsLocked: true });
          input.focus();
          input.select();
        };
        const hide = () => {
          el.classList.add('vp-hidden');
          ui.store.set({ controlsLocked: false });
        };
        panel = { toggle: () => (el.classList.contains('vp-hidden') ? open() : hide()) };

        ui.listen(at, 'change', render);
        ui.listen(close, 'click', hide);
        ui.listen(el, 'keydown', (e) => {
          if ((e as KeyboardEvent).key === 'Escape') hide();
        });
        ui.listen(copy, 'click', () => {
          const done = (text: string) => (copy.textContent = text);
          if (!navigator.clipboard) return void (input.select(), done('Нажмите ⌘C / Ctrl+C'));
          navigator.clipboard.writeText(input.value).then(
            () => done('Скопировано ✓'),
            () => (input.select(), done('Нажмите ⌘C / Ctrl+C')),
          );
        });
        return {
          el,
          dispose() {
            panel = null;
          },
        };
      });

      // Start time from the page URL applies to the first load only.
      let pending = parseStartTime(new URLSearchParams(location.search).get(param));
      const offs = [
        ctx.addLayer({ type: 'share-panel' }, 'above-ui'),
        ctx.addSourceTransform((_spec, sel) => {
          if (pending === null) return sel;
          const start = pending;
          pending = null;
          return { ...sel, start };
        }),
      ];
      return () => offs.forEach((off) => off());
    },
  };
}
