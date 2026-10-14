import type { ComponentFactory, PlayerState } from '../types.js';
import { h } from '../ui/dom.js';
import { formatTime } from '../shared/time.js';

export const rootComponent: ComponentFactory = () => ({ el: h('div', { class: 'vp-layout-root' }) });
export const overlayComponent: ComponentFactory = () => ({ el: h('div', { class: 'vp-overlay' }) });
export const toolbarComponent: ComponentFactory = () => ({ el: h('div', { class: 'vp-toolbar' }) });
export const spacerComponent: ComponentFactory = () => ({ el: h('div', { class: 'vp-spacer' }) });

export const groupComponent: ComponentFactory<{ direction?: 'row' | 'column' }> = (_ctx, props) => ({
  el: h('div', { class: `vp-group vp-group-${props.direction === 'column' ? 'column' : 'row'}` }),
});

const PLACEHOLDER_RE = /\{(time|duration|title)\}/g;

export function fillTemplate(template: string, s: PlayerState): string {
  return template.replace(PLACEHOLDER_RE, (_m, key: string) => {
    if (key === 'time') return formatTime(s.currentTime, s.duration);
    if (key === 'duration') return formatTime(s.duration, s.duration);
    return s.title;
  });
}

export const textComponent: ComponentFactory<{ text?: string }> = (ctx, props) => {
  const el = h('span', { class: 'vp-text' });
  const template = String(props.text ?? '');
  if (!/\{(time|duration|title)\}/.test(template)) {
    el.textContent = ctx.t(template);
  } else {
    ctx.select((s) => fillTemplate(template, s), (text) => (el.textContent = text), { immediate: true });
  }
  return { el };
};
