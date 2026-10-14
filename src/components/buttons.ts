import type { ComponentFactory, IconName } from '../types.js';
import { createIconButton } from '../ui/button.js';
import { bindWheelVolume } from '../ui/wheel.js';

export const playComponent: ComponentFactory = (ctx) => {
  const b = createIconButton(ctx, 'vp-play', () => ctx.user('toggle'));
  ctx.select(
    (s) => s.status,
    (status) => {
      const key = status === 'playing' ? 'pause' : status === 'ended' ? 'replay' : 'play';
      b.setIcon(key);
      b.setLabel(key);
    },
    { immediate: true },
  );
  return { el: b.el };
};

export const bigPlayComponent: ComponentFactory = (ctx) => {
  const b = createIconButton(ctx, 'vp-big-play', () => ctx.user('play'));
  b.setIcon('play');
  b.setLabel('play');
  return { el: b.el };
};

export const muteComponent: ComponentFactory = (ctx) => {
  const b = createIconButton(ctx, 'vp-mute', () => ctx.user('toggleMute'));
  ctx.select(
    (s): IconName => (s.muted || s.volume === 0 ? 'volume-mute' : s.volume < 0.5 ? 'volume-low' : 'volume-high'),
    (icon) => b.setIcon(icon),
    { immediate: true },
  );
  // The label describes what a click does (toggleMute), so it follows `muted`, not the level.
  ctx.select((s) => s.muted, (muted) => b.setLabel(muted ? 'unmute' : 'mute'), { immediate: true });
  bindWheelVolume(ctx, b.el);
  return { el: b.el };
};

export const fullscreenComponent: ComponentFactory = (ctx) => {
  const b = createIconButton(ctx, 'vp-fullscreen', () => ctx.user('toggleFullscreen'));
  ctx.select(
    (s) => s.fullscreen,
    (fs) => {
      b.setIcon(fs ? 'fullscreen-exit' : 'fullscreen');
      b.setLabel(fs ? 'exitFullscreen' : 'fullscreen');
    },
    { immediate: true },
  );
  return { el: b.el };
};

export const settingsComponent: ComponentFactory = (ctx) => {
  const b = createIconButton(ctx, 'vp-settings', () => ctx.menus.toggle());
  b.setIcon('settings');
  b.setLabel('settings');
  b.el.dataset.vpMenuToggle = '';
  b.el.setAttribute('aria-haspopup', 'menu');
  b.el.setAttribute('aria-expanded', 'false');
  ctx.on('ui:menu', ({ open }) => b.el.setAttribute('aria-expanded', String(open)));
  return { el: b.el };
};
