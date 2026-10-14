import type { ComponentFactory } from '../types.js';
import { h } from '../ui/dom.js';
import { clamp } from '../shared/clamp.js';
import { formatTime } from '../shared/time.js';

export const timelineComponent: ComponentFactory = (ctx) => {
  const buffered = h('div', { class: 'vp-timeline-buffered' });
  const progress = h('div', { class: 'vp-timeline-progress' });
  const thumb = h('div', { class: 'vp-timeline-thumb' });
  const markers = h('div', { class: 'vp-timeline-markers' });
  const el = h(
    'div',
    { class: 'vp-timeline', role: 'slider', tabindex: 0, 'aria-label': ctx.t('timeline'), 'aria-valuemin': 0 },
    h('div', { class: 'vp-timeline-track' }, buffered, progress, markers, thumb),
  );
  let dragging = false;
  let activePointerId: number | null = null;
  let dragTime = 0;

  const paint = (time: number, duration: number, bufferedEnd: number) => {
    const pct = duration > 0 ? clamp(time / duration, 0, 1) * 100 : 0;
    progress.style.width = `${pct}%`;
    thumb.style.left = `${pct}%`;
    buffered.style.width = duration > 0 ? `${clamp(bufferedEnd / duration, 0, 1) * 100}%` : '0%';
    el.setAttribute('aria-valuemax', String(Math.floor(duration)));
    el.setAttribute('aria-valuenow', String(Math.floor(time)));
    el.setAttribute('aria-valuetext', `${formatTime(time, duration)} / ${formatTime(duration, duration)}`);
  };

  const position = (clientX: number) => {
    const r = el.getBoundingClientRect();
    const x = clamp(clientX - r.left, 0, r.width);
    const duration = ctx.store.get().duration;
    const rootX = r.left - ctx.root.getBoundingClientRect().left + x;
    return { time: r.width > 0 ? (x / r.width) * duration : 0, x, rootX, width: r.width };
  };

  // No seeking on live streams, regardless of the layout's hide rules.
  ctx.select((s) => s.live, (live) => el.classList.toggle('vp-timeline-live', live), { immediate: true });

  ctx.select(
    (s) => [s.currentTime, s.duration, s.buffered] as const,
    ([t, d, b]) => {
      if (!dragging) paint(t, d, b);
    },
    { immediate: true, equals: (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2] },
  );

  ctx.select(
    (s) => [s.markers, s.duration] as const,
    ([list, duration]) => {
      const inside = duration > 0 ? list.filter((m) => m.time > 0 && m.time < duration) : [];
      markers.replaceChildren(
        ...inside.map((m) => {
          const tick = h('div', { class: 'vp-timeline-marker' });
          tick.style.left = `${(m.time / duration) * 100}%`;
          return tick;
        }),
      );
    },
    { immediate: true, equals: (a, b) => a[0] === b[0] && a[1] === b[1] },
  );

  const pointerOf = (e: Event) => (e as PointerEvent).pointerId ?? 1;
  const endDrag = () => {
    dragging = false;
    activePointerId = null;
    el.classList.remove('vp-dragging');
    ctx.events.emit('ui:drag', { active: false });
  };
  const commit = () => {
    ctx.events.emit('line', dragTime);
    ctx.user('seek', dragTime);
  };

  ctx.listen(el, 'pointerdown', (e) => {
    const pe = e as PointerEvent;
    if (dragging || (pe.button !== undefined && pe.button !== 0)) return;
    e.stopPropagation();
    const s = ctx.store.get();
    if (!(s.duration > 0)) return;
    dragging = true;
    activePointerId = pointerOf(e);
    el.classList.add('vp-dragging');
    ctx.events.emit('ui:drag', { active: true });
    try {
      el.setPointerCapture?.(pe.pointerId);
    } catch {
      /* synthetic events have no active pointer */
    }
    dragTime = position(pe.clientX).time;
    paint(dragTime, s.duration, s.buffered);
  });

  ctx.listen(el, 'pointermove', (e) => {
    const pos = position((e as PointerEvent).clientX);
    ctx.events.emit('ui:timeline-hover', pos);
    if (dragging && pointerOf(e) === activePointerId) {
      dragTime = pos.time;
      const s = ctx.store.get();
      paint(dragTime, s.duration, s.buffered);
    }
  });

  ctx.listen(el, 'pointerup', (e) => {
    if (!dragging || pointerOf(e) !== activePointerId) return;
    dragTime = position((e as PointerEvent).clientX).time;
    endDrag();
    commit();
  });

  ctx.listen(el, 'pointercancel', (e) => {
    if (!dragging || pointerOf(e) !== activePointerId) return;
    endDrag();
    const s = ctx.store.get();
    paint(s.currentTime, s.duration, s.buffered);
  });

  ctx.listen(el, 'lostpointercapture', (e) => {
    if (!dragging || pointerOf(e) !== activePointerId) return;
    endDrag();
    commit();
  });

  ctx.listen(el, 'pointerleave', () => {
    if (!dragging) ctx.events.emit('ui:timeline-leave');
  });

  ctx.listen(el, 'click', (e) => e.stopPropagation());

  ctx.listen(el, 'keydown', (e) => {
    const key = (e as KeyboardEvent).key;
    const target = key === 'ArrowRight' ? '+5' : key === 'ArrowLeft' ? '-5' : key === 'Home' ? 0 : key === 'End' ? ctx.store.get().duration : null;
    if (target === null) return;
    // No stopPropagation: the root activity tracker must still see the key; hotkeys skip defaultPrevented events.
    e.preventDefault();
    ctx.user('seek', target);
  });

  return {
    el,
    dispose() {
      if (dragging) endDrag();
    },
  };
};
