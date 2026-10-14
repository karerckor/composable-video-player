import type { IconName, UIContext } from '../types';
import { h, iconEl } from './dom';

export interface IconButton {
  el: HTMLButtonElement;
  setIcon(name: IconName): void;
  /** i18n key; ignored when the layout node set a `hint`. */
  setLabel(key: string): void;
}

export function createIconButton(ctx: UIContext, className: string, onClick: () => void): IconButton {
  const el = h('button', { class: `vp-button ${className}`, type: 'button' });
  let current: IconName | null = null;
  ctx.listen(el, 'click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return {
    el,
    setIcon(name) {
      if (name === current) return;
      current = name;
      el.replaceChildren(iconEl(ctx.icon(name)));
    },
    setLabel(key) {
      if (el.dataset.vpHint !== undefined) return;
      const text = ctx.t(key);
      el.setAttribute('aria-label', text);
      el.title = text;
    },
  };
}
