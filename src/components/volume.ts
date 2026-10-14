import type { ComponentFactory } from '../types.js';
import { createSlider } from '../ui/slider.js';
import { bindWheelVolume } from '../ui/wheel.js';

export const volumeComponent: ComponentFactory = (ctx) => {
  const slider = createSlider(ctx, {
    className: 'vp-volume',
    label: ctx.t('volume'),
    onInput: (value) => ctx.user('setVolume', value),
  });
  ctx.select((s) => (s.muted ? 0 : s.volume), (v) => slider.set(v, `${Math.round(v * 100)}%`), { immediate: true });
  bindWheelVolume(ctx, slider.el);
  return { el: slider.el, dispose: slider.dispose };
};
