import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createUIHarness } from '../helpers/ui-harness';
import { h } from '../../src/ui/dom';
import type { ComponentFactory } from '../../src/types';

let ui: ReturnType<typeof createUIHarness>;

const box: ComponentFactory = () => ({ el: h('div', { class: 'box' }) });
const container: ComponentFactory = () => {
  const el = h('div', { class: 'container' });
  const slot = h('div', { class: 'slot' });
  el.append(slot);
  return { el, slot };
};

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  ui = createUIHarness();
  ui.components.register('box', box);
  ui.components.register('container', container);
});

describe('LayoutEngine', () => {
  it('builds a tree into slots and the parent', () => {
    const mounted = ui.engine.build({ type: 'container', children: [{ type: 'box' }, { type: 'box' }] }, ui.root)!;
    expect(ui.root.contains(mounted.el)).toBe(true);
    expect(mounted.el.querySelectorAll('.slot > .box')).toHaveLength(2);
  });

  it('applies base props', () => {
    const m = ui.engine.build(
      { type: 'box', id: 'logo', hint: 'quality', scale: 1.2, margin: '0 15 0 20', opacity: 0.5, bg: 'red', color: 'blue', flex: 1, anchor: 'top-left', className: 'x y' },
      ui.root,
    )!;
    expect(m.el.id).toBe('p_control_logo');
    expect(m.el.title).toBe('Качество');
    expect(m.el.getAttribute('aria-label')).toBe('Качество');
    expect(m.el.style.getPropertyValue('scale')).toBe('1.2');
    expect(m.el.style.margin).toBe('0px 15px 0px 20px');
    expect(m.el.style.opacity).toBe('0.5');
    expect(m.el.style.flexGrow).toBe('1');
    expect(m.el.classList.contains('vp-anchor-top-left')).toBe(true);
    expect(m.el.classList.contains('y')).toBe(true);
  });

  it('skips unknown types with a warning, or silently when optional', () => {
    expect(ui.engine.build({ type: 'nope' }, ui.root)).toBeNull();
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(ui.engine.build({ type: 'nope', optional: true }, ui.root)).toBeNull();
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it('toggles vp-hidden from hide rules reactively', () => {
    const m = ui.engine.build({ type: 'box', hide: ['paused'] }, ui.root)!;
    expect(m.el.classList.contains('vp-hidden')).toBe(false);
    ui.store.set({ status: 'paused' });
    expect(m.el.classList.contains('vp-hidden')).toBe(true);
  });

  it('runs actions on click instead of component handlers', () => {
    const inner = vi.fn();
    ui.components.register('btn', () => {
      const el = h('button');
      el.addEventListener('click', inner);
      return { el };
    });
    const m = ui.engine.build({ type: 'btn', action: 'api:seek,10' }, ui.root)!;
    m.el.click();
    expect(ui.api).toHaveBeenCalledWith('seek', '10');
    expect(inner).not.toHaveBeenCalled();
  });

  it('disposes subscriptions, listeners and children', () => {
    const cb = vi.fn();
    const disposeChild = vi.fn();
    ui.components.register('sub', (ctx) => {
      const el = h('div');
      ctx.select((s) => s.volume, cb);
      ctx.listen(window, 'resize', cb);
      return { el, dispose: disposeChild };
    });
    const m = ui.engine.build({ type: 'container', children: [{ type: 'sub' }] }, ui.root)!;
    m.dispose();
    ui.store.set({ volume: 0.3 });
    window.dispatchEvent(new Event('resize'));
    expect(cb).not.toHaveBeenCalled();
    expect(disposeChild).toHaveBeenCalled();
    expect(ui.root.contains(m.el)).toBe(false);
  });

  it('ctx.user runs commands with user source and swallows rejections', async () => {
    const handler = vi.fn(() => Promise.reject(new Error('blocked')));
    ui.commands.register('play', handler);
    ui.components.register('u', (ctx) => {
      const el = h('button');
      el.addEventListener('click', () => ctx.user('play'));
      return { el };
    });
    ui.engine.build({ type: 'u' }, ui.root)!.el.click();
    await Promise.resolve();
    expect(handler).toHaveBeenCalledWith([], { source: 'user' });
  });

  it('isolates a throwing component', () => {
    ui.components.register('bad', () => {
      throw new Error('x');
    });
    const m = ui.engine.build({ type: 'container', children: [{ type: 'bad' }, { type: 'box' }] }, ui.root)!;
    expect(m.el.querySelectorAll('.box')).toHaveLength(1);
    expect(console.error).toHaveBeenCalled();
  });
});
