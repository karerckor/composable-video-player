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
            if (id !== request) return;
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
