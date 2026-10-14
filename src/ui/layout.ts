import type { ComponentFactory, ComponentInstance, HideRuleFactory, LayoutNode, Logger, UIContext } from '../types';
import type { Registry } from './registry';
import { applyBaseProps } from './base-props';
import { compileHide } from './hide-rules';

export type UIBase = Pick<UIContext, 'player' | 'store' | 'events' | 'commands' | 'options' | 'root' | 'log' | 't' | 'icon' | 'menus' | 'run'>;

export interface LayoutEngineDeps {
  components: Registry<ComponentFactory<any>>;
  hideRules: Registry<HideRuleFactory>;
  base: UIBase;
  playerId: string;
  log: Logger;
}

export interface Mounted {
  el: HTMLElement;
  dispose(): void;
}

export interface LayoutEngine {
  build(node: LayoutNode, parent: HTMLElement | null): Mounted | null;
}

export function createLayoutEngine(d: LayoutEngineDeps): LayoutEngine {
  const build = (node: LayoutNode, parent: HTMLElement | null): (Mounted & { instance: ComponentInstance }) | null => {
    const factory = d.components.get(node.type);
    if (!factory) {
      if (!node.optional) d.log.warn(`unknown component "${node.type}"`);
      return null;
    }

    const disposers: Array<() => void> = [];
    const ctx: UIContext = {
      ...d.base,
      build(child) {
        const mounted = build(child, null);
        if (!mounted) return null;
        disposers.push(mounted.dispose);
        return mounted.instance;
      },
      select(selector, cb, opts) {
        const off = d.base.store.select(selector, cb, opts);
        disposers.push(off);
        return off;
      },
      on(name, cb) {
        const off = d.base.events.on(name, cb);
        disposers.push(off);
        return off;
      },
      listen(target, type, fn, opts) {
        target.addEventListener(type, fn, opts);
        disposers.push(() => target.removeEventListener(type, fn, opts));
      },
      user(name, ...args) {
        const result = d.base.commands.run(name, args, { source: 'user' });
        if (result instanceof Promise) result.catch((e) => d.log.warn(`command "${name}" rejected`, e));
      },
    };

    const cleanup = () => {
      for (const off of disposers.reverse()) off();
      disposers.length = 0;
    };

    let instance: ComponentInstance;
    try {
      instance = factory(ctx, node);
    } catch (e) {
      d.log.error(`component "${node.type}" failed to build`, e);
      cleanup();
      return null;
    }

    applyBaseProps(instance.el, node, d.playerId, d.base.t);

    if (node.hide?.length) {
      const hidden = compileHide(node.hide, d.hideRules, ctx, d.log);
      ctx.select((s) => hidden(s), (isHidden) => instance.el.classList.toggle('vp-hidden', isHidden), { immediate: true });
    }

    if (node.action) {
      // Capture on the root ancestor: fires before any listener on the element itself,
      // and stopPropagation keeps the click from reaching the component's own handler.
      const action = node.action;
      instance.el.dataset.vpAction = '';
      ctx.listen(
        d.base.root,
        'click',
        (e) => {
          // Only the innermost element with an action handles the click (nested actions).
          if ((e.target as Element | null)?.closest?.('[data-vp-action]') !== instance.el) return;
          e.stopPropagation();
          e.preventDefault();
          d.base.run(action);
        },
        { capture: true },
      );
    }

    for (const child of node.children ?? []) {
      const built = ctx.build(child);
      if (built) (instance.slot ?? instance.el).append(built.el);
    }

    if (parent) parent.append(instance.el);

    let disposed = false;
    return {
      el: instance.el,
      instance,
      dispose() {
        if (disposed) return;
        disposed = true;
        try {
          instance.dispose?.();
        } catch (e) {
          d.log.error(`component "${node.type}" failed to dispose`, e);
        }
        cleanup();
        instance.el.remove();
      },
    };
  };

  return {
    build(node, parent) {
      const mounted = build(node, parent);
      return mounted ? { el: mounted.el, dispose: mounted.dispose } : null;
    },
  };
}
