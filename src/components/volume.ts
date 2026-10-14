import type { ComponentFactory } from '../types';
import { createSlider } from '../ui/slider';

export const volumeComponent: ComponentFactory = (ctx) => {
  const slider = createSlider(ctx, {
    className: 'vp-volume',
    label: ctx.t('volume'),
    onInput: (value) => ctx.user('setVolume', value),
  });
  ctx.select((s) => (s.muted ? 0 : s.volume), (v) => slider.set(v, `${Math.round(v * 100)}%`), { immediate: true });
  ctx.listen(
    slider.el,
    'wheel',
    (e) => {
      e.preventDefault();
      ctx.user('setVolume', (e as WheelEvent).deltaY < 0 ? '+0.05' : '-0.05');
    },
    { passive: false },
  );
  return { el: slider.el, dispose: slider.dispose };
};
