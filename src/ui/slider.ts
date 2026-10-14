import type { UIContext } from '../types';
import { h } from './dom';
import { clamp } from '../shared/clamp';

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

  ctx.listen(el, 'pointerdown', (e) => {
    const pe = e as PointerEvent;
    e.stopPropagation();
    dragging = true;
    ctx.events.emit('ui:drag', { active: true });
    try {
      el.setPointerCapture?.(pe.pointerId);
    } catch {
      /* jsdom / synthetic events have no active pointer */
    }
    o.onInput(valueAt(pe.clientX), false);
  });
  ctx.listen(el, 'pointermove', (e) => {
    if (dragging) o.onInput(valueAt((e as PointerEvent).clientX), false);
  });
  ctx.listen(el, 'pointerup', (e) => {
    if (!dragging) return;
    dragging = false;
    ctx.events.emit('ui:drag', { active: false });
    o.onInput(valueAt((e as PointerEvent).clientX), true);
  });
  ctx.listen(el, 'pointercancel', () => {
    if (!dragging) return;
    dragging = false;
    ctx.events.emit('ui:drag', { active: false });
  });
  ctx.listen(el, 'click', (e) => e.stopPropagation());
  ctx.listen(el, 'keydown', (e) => {
    const key = (e as KeyboardEvent).key;
    const delta = key === 'ArrowRight' || key === 'ArrowUp' ? step : key === 'ArrowLeft' || key === 'ArrowDown' ? -step : 0;
    if (!delta) return;
    e.preventDefault();
    e.stopPropagation();
    o.onInput(round(clamp(value + delta, 0, 1)), true);
  });

  return { el, set };
}
