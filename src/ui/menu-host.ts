import type { EventBus, IconName, Logger, MenuDefinition, MenuHost, PlayerState, Store } from '../types';
import { h, iconEl } from './dom';

export interface MenuHostDeps {
  layer: HTMLElement;
  store: Store<PlayerState>;
  events: EventBus;
  t: (key: string) => string;
  icon: (name: IconName) => string;
  log: Logger;
}

type OpenOptions = { only?: string[]; align?: 'left' | 'center' | 'right' };

export function createMenuHost(d: MenuHostDeps): MenuHost {
  const defs: MenuDefinition[] = [];
  let panel: HTMLElement | null = null;
  let opts: OpenOptions = {};
  let view: string | null = null;
  let unsubscribe: (() => void) | null = null;

  const visibleDefs = (s: PlayerState) =>
    defs
      .filter((def) => (!opts.only || opts.only.includes(def.id)) && def.visible(s))
      .sort((a, b) => (a.order ?? 100) - (b.order ?? 100));

  const currentLabel = (def: MenuDefinition, s: PlayerState) => {
    const cur = def.current(s);
    return def.options(s).find((o) => Object.is(o.value, cur))?.label ?? '';
  };

  const signature = (s: PlayerState) =>
    visibleDefs(s)
      .map((def) => `${def.id}:${currentLabel(def, s)}:${def.options(s).map((o) => o.label).join(',')}`)
      .join('|');

  const focusFirst = () => panel?.querySelector<HTMLButtonElement>('button')?.focus();

  const button = (cls: string, onClick: () => void, ...children: Array<Node | string>) => {
    const b = h('button', { class: cls, type: 'button' }, ...children);
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
    return b;
  };

  const render = () => {
    if (!panel) return;
    const s = d.store.get();
    const list = visibleDefs(s);
    if (!list.length) {
      host.close();
      return;
    }
    if (view === null && list.length === 1) view = list[0]!.id;
    const def = view ? list.find((x) => x.id === view) : undefined;
    if (view && !def) view = null;

    panel.replaceChildren();
    if (def) {
      if (list.length > 1) {
        panel.append(
          button(
            'vp-menu-back',
            () => {
              view = null;
              render();
              focusFirst();
            },
            iconEl(d.icon('back')),
            h('span', {}, d.t(def.label)),
          ),
        );
      } else {
        panel.append(h('div', { class: 'vp-menu-title' }, d.t(def.label)));
      }
      const cur = def.current(s);
      for (const option of def.options(s)) {
        const active = Object.is(option.value, cur);
        const item = button(
          `vp-menu-item${active ? ' vp-active' : ''}`,
          () => {
            def.select(option.value);
            host.close();
          },
          h('span', { class: 'vp-menu-check' }, active ? iconEl(d.icon('check')) : ''),
          h('span', { class: 'vp-menu-label' }, option.label),
        );
        item.setAttribute('role', 'menuitemradio');
        item.setAttribute('aria-checked', String(active));
        panel.append(item);
      }
    } else {
      for (const x of list) {
        const item = button(
          'vp-menu-item vp-menu-main',
          () => {
            view = x.id;
            render();
            focusFirst();
          },
          h('span', { class: 'vp-menu-label' }, d.t(x.label)),
          h('span', { class: 'vp-menu-value' }, currentLabel(x, s)),
        );
        item.setAttribute('role', 'menuitem');
        panel.append(item);
      }
    }
  };

  const onOutside = (e: Event) => {
    const target = e.target as Element | null;
    if (!panel || (target && (panel.contains(target) || target.closest?.('[data-vp-menu-toggle]')))) return;
    host.close();
  };

  const onKey = (e: KeyboardEvent) => {
    if (!panel) return;
    const buttons = [...panel.querySelectorAll<HTMLButtonElement>('button')];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') {
      host.close();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const step = e.key === 'ArrowDown' ? 1 : -1;
      buttons[(index + step + buttons.length) % buttons.length]?.focus();
    } else if (e.key === 'ArrowLeft') {
      panel.querySelector<HTMLButtonElement>('.vp-menu-back')?.click();
    } else if (e.key !== 'ArrowRight') {
      return;
    }
    // Handled (ArrowRight is swallowed): keep player hotkeys from also seeking/changing volume.
    e.preventDefault();
    e.stopPropagation();
  };

  const host: MenuHost = {
    register(def) {
      defs.push(def);
      if (panel) render();
      return () => {
        const i = defs.indexOf(def);
        if (i >= 0) defs.splice(i, 1);
        if (panel) render();
      };
    },

    open(o = {}) {
      if (panel) host.close();
      opts = o;
      if (!visibleDefs(d.store.get()).length) return;
      view = null;
      panel = h('div', { class: `vp-menu vp-menu-${o.align ?? 'right'}`, role: 'menu' });
      d.layer.append(panel);
      render();
      if (!panel) return;
      unsubscribe = d.store.select(signature, render);
      document.addEventListener('pointerdown', onOutside, true);
      panel.addEventListener('keydown', onKey);
      d.events.emit('ui:menu', { open: true });
      focusFirst();
    },

    close() {
      if (!panel) return;
      panel.removeEventListener('keydown', onKey);
      panel.remove();
      panel = null;
      unsubscribe?.();
      unsubscribe = null;
      document.removeEventListener('pointerdown', onOutside, true);
      d.events.emit('ui:menu', { open: false });
    },

    toggle() {
      if (panel) host.close();
      else host.open();
    },

    get isOpen() {
      return panel !== null;
    },

    hasVisible: (s) => defs.some((def) => def.visible(s)),

    dispose() {
      host.close();
      defs.length = 0;
    },
  };
  return host;
}
