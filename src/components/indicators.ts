import type { ComponentFactory } from '../types';
import { h } from '../ui/dom';
import { formatTime } from '../shared/time';

export const timeComponent: ComponentFactory = (ctx) => {
  const el = h('span', { class: 'vp-time' });
  ctx.select((s) => formatTime(s.currentTime, s.duration), (text) => (el.textContent = text), { immediate: true });
  return { el };
};

export const durationComponent: ComponentFactory = (ctx) => {
  const el = h('span', { class: 'vp-duration' });
  ctx.select((s) => formatTime(s.duration, s.duration), (text) => (el.textContent = text), { immediate: true });
  return { el };
};

export const titleComponent: ComponentFactory = (ctx) => {
  const el = h('div', { class: 'vp-title' });
  ctx.select((s) => s.title, (title) => (el.textContent = title), { immediate: true });
  return { el };
};

export const bufferingComponent: ComponentFactory = (ctx) => ({
  el: h('div', { class: 'vp-buffering', role: 'status', 'aria-label': ctx.t('buffering') }),
});

export const liveComponent: ComponentFactory = (ctx) => ({
  el: h('span', { class: 'vp-live' }, h('span', { class: 'vp-live-dot', 'aria-hidden': 'true' }, '●'), ` ${ctx.t('live')}`),
});

export const errorOverlayComponent: ComponentFactory = (ctx) => {
  const message = h('div', { class: 'vp-error-message' });
  const retry = h('button', { class: 'vp-button vp-error-retry', type: 'button' }, ctx.t('retry'));
  const el = h('div', { class: 'vp-error', role: 'alert' }, message, retry);
  ctx.listen(retry, 'click', (e) => {
    e.stopPropagation();
    ctx.user('reload');
  });
  ctx.select((s) => s.error?.kind ?? null, (kind) => (message.textContent = kind ? ctx.t(`error.${kind}`) : ''), { immediate: true });
  return { el };
};

/**
 * Full-size layer over the video: click toggles playback, double click toggles fullscreen.
 * Accepted trade-off (same as YouTube/PlayerJS): a double click also delivers two clicks,
 * so playback toggles twice (net unchanged) before fullscreen; no single-click delay.
 */
export const mediaClickLayerComponent: ComponentFactory = (ctx) => {
  const el = h('div', { class: 'vp-click-layer' });
  let revealOnly = false;
  ctx.listen(el, 'pointerdown', (e) => {
    const s = ctx.store.get();
    revealOnly = (e as PointerEvent).pointerType === 'touch' && s.status === 'playing' && !s.userActive;
  });
  ctx.listen(el, 'click', () => {
    if (revealOnly) {
      revealOnly = false;
      return;
    }
    ctx.user('toggle');
  });
  ctx.listen(el, 'dblclick', () => ctx.user('toggleFullscreen'));
  return { el };
};
