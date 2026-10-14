import type { UIContext } from '../types.js';
import { h } from './dom.js';
import { clamp } from '../shared/clamp.js';

export interface SliderOptions {
  className: string;
  label: string;
  /** Called with a 0..1 value; `final` is true on release and keyboard steps. */
  onInput(value: number, final: boolean): void;
  step?: number;
}

export interface Slider {
  el: HTMLDivElement;
  set(value: number, text?: string): void;
  /** Ends an active drag (emits `ui:drag` inactive) without calling `onInput`. */
  dispose(): void;
}

const round = (v: number) => Math.round(v * 1000) / 1000;

export function createSlider(ctx: UIContext, o: SliderOptions): Slider {
  const step = o.step ?? 0.05;
  const fill = h('div', { class: 'vp-slider-fill' });
  const el = h(
    'div',
    { class: `vp-slider ${o.className}`, role: 'slider', tabindex: 0, 'aria-label': o.label, 'aria-valuemin': 0, 'aria-valuemax': 1 },
    h('div', { class: 'vp-slider-track' }, fill),
  );
  let value = 0;
  let dragging = false;
  let activePointerId: number | null = null;
  let lastValue = 0;

  const valueAt = (clientX: number) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 ? round(clamp((clientX - r.left) / r.width, 0, 1)) : value;
  };

  const set = (v: number, text?: string) => {
    value = clamp(v, 0, 1);
    fill.style.width = `${value * 100}%`;
    el.setAttribute('aria-valuenow', String(round(value)));
    el.setAttribute('aria-valuetext', text ?? `${Math.round(value * 100)}%`);
  };

  const pointerOf = (e: Event) => (e as PointerEvent).pointerId ?? 1;
  const endDrag = () => {
    dragging = false;
    activePointerId = null;
    ctx.events.emit('ui:drag', { active: false });
  };

  ctx.listen(el, 'pointerdown', (e) => {
    const pe = e as PointerEvent;
    if (dragging || (pe.button !== undefined && pe.button !== 0)) return;
    e.stopPropagation();
    dragging = true;
    activePointerId = pointerOf(e);
    ctx.events.emit('ui:drag', { active: true });
    try {
      el.setPointerCapture?.(pe.pointerId);
    } catch {
      /* jsdom / synthetic events have no active pointer */
    }
    lastValue = valueAt(pe.clientX);
    o.onInput(lastValue, false);
  });
  ctx.listen(el, 'pointermove', (e) => {
    if (!dragging || pointerOf(e) !== activePointerId) return;
    lastValue = valueAt((e as PointerEvent).clientX);
    o.onInput(lastValue, false);
  });
  ctx.listen(el, 'pointerup', (e) => {
    if (!dragging || pointerOf(e) !== activePointerId) return;
    endDrag();
    o.onInput(valueAt((e as PointerEvent).clientX), true);
  });
  ctx.listen(el, 'pointercancel', (e) => {
    if (!dragging || pointerOf(e) !== activePointerId) return;
    endDrag();
  });
  ctx.listen(el, 'lostpointercapture', (e) => {
    if (!dragging || pointerOf(e) !== activePointerId) return;
    endDrag();
    o.onInput(lastValue, true);
  });
  ctx.listen(el, 'click', (e) => e.stopPropagation());
  ctx.listen(el, 'keydown', (e) => {
    const key = (e as KeyboardEvent).key;
    const delta = key === 'ArrowRight' || key === 'ArrowUp' ? step : key === 'ArrowLeft' || key === 'ArrowDown' ? -step : 0;
    if (!delta) return;
    // No stopPropagation: the root activity tracker must still see the key; hotkeys skip defaultPrevented events.
    e.preventDefault();
    o.onInput(round(clamp(value + delta, 0, 1)), true);
  });

  set(0);

  return {
    el,
    set,
    dispose() {
      if (dragging) endDrag();
    },
  };
}
