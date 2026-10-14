import type { ComponentFactory } from '../types';
import { createSlider } from '../ui/slider';
import { bindWheelVolume } from '../ui/wheel';

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
