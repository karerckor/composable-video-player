import type { BaseProps } from '../types';

const toCssLength = (v: string) => (/^-?\d+(\.\d+)?$/.test(v) ? `${v}px` : v);

export function applyBaseProps(el: HTMLElement, props: BaseProps, playerId: string, t: (key: string) => string): void {
  if (props.id) el.id = `${playerId}_control_${props.id}`;
  if (props.hint) {
    const text = t(props.hint);
    el.title = text;
    el.setAttribute('aria-label', text);
    el.dataset.vpHint = '';
  }
  if (props.scale !== undefined) el.style.setProperty('scale', String(props.scale));
  if (props.margin) el.style.margin = props.margin.trim().split(/\s+/).map(toCssLength).join(' ');
  if (props.opacity !== undefined) el.style.opacity = String(props.opacity);
  if (props.bg) el.style.background = props.bg;
  if (props.color) el.style.color = props.color;
  if (props.flex !== undefined) el.style.flexGrow = String(props.flex);
  if (props.anchor) el.classList.add('vp-anchor', `vp-anchor-${props.anchor}`);
  if (props.className) el.classList.add(...props.className.split(/\s+/).filter(Boolean));
}
