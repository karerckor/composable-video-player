import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMenuHost } from '../../src/ui/menu-host.js';
import { createStore } from '../../src/core/store.js';
import { createEventBus } from '../../src/core/events.js';
import { createLogger } from '../../src/core/logger.js';
import { createInitialState } from '../../src/core/initial-state.js';
import { createTranslator } from '../../src/ui/i18n.js';
import { createIconSet } from '../../src/ui/icons.js';
import type { MenuDefinition, MenuHost, PlayerState, Store } from '../../src/types.js';

let store: Store<PlayerState>;
let layer: HTMLElement;
let menus: MenuHost;
let menuEvents: boolean[];

const speedMenu = (): MenuDefinition => ({
  id: 'speed',
  label: 'speed',
  order: 20,
  visible: () => true,
  options: () => [0.5, 1, 2].map((v) => ({ label: v === 1 ? 'Обычная' : String(v), value: v })),
  current: (s) => s.rate,
  select: (v) => store.set({ rate: v as number }),
});
const qualityMenu = (): MenuDefinition => ({
  id: 'quality',
  label: 'quality',
  order: 10,
  visible: (s) => s.qualities.length > 1,
  options: (s) => s.qualities.map((q, i) => ({ label: q.label, value: i })),
  current: (s) => s.quality,
  select: (v) => store.set({ quality: v as number }),
});

const items = () => [...layer.querySelectorAll<HTMLButtonElement>('.vp-menu-item')];
const texts = () => items().map((b) => b.textContent);

beforeEach(() => {
  document.body.replaceChildren();
  store = createStore(createInitialState({ container: 'x' }));
  layer = document.createElement('div');
  document.body.append(layer);
  const events = createEventBus();
  menuEvents = [];
  events.on('ui:menu', ({ open }) => menuEvents.push(open));
  menus = createMenuHost({ layer, store, events, t: createTranslator('ru'), icon: createIconSet(), log: createLogger(false) });
});

describe('MenuHost', () => {
  it('knows whether any menu is visible', () => {
    menus.register(qualityMenu());
    expect(menus.hasVisible(store.get())).toBe(false);
    store.set({ qualities: [{ label: '360p' }, { label: '720p' }] });
    expect(menus.hasVisible(store.get())).toBe(true);
  });

  it('opens a main list sorted by order with current values', () => {
    menus.register(speedMenu());
    menus.register(qualityMenu());
    store.set({ qualities: [{ label: '360p' }, { label: '720p' }], quality: 1 });
    menus.open();
    expect(menus.isOpen).toBe(true);
    expect(texts()).toEqual(['Качество720p', 'СкоростьОбычная']);
    expect(menuEvents).toEqual([true]);
  });

  it('navigates into a submenu, selects and closes', () => {
    menus.register(speedMenu());
    menus.register(qualityMenu());
    store.set({ qualities: [{ label: '360p' }, { label: '720p' }] });
    menus.open();
    items()[1]!.click();
    expect(texts()).toEqual(['0.5', 'Обычная', '2']);
    expect(items()[1]!.getAttribute('aria-checked')).toBe('true');
    items()[2]!.click();
    expect(store.get().rate).toBe(2);
    expect(menus.isOpen).toBe(false);
    expect(menuEvents).toEqual([true, false]);
  });

  it('opens a single visible menu directly as a submenu', () => {
    menus.register(speedMenu());
    menus.open();
    expect(texts()).toEqual(['0.5', 'Обычная', '2']);
    expect(layer.querySelector('.vp-menu-back')).toBeNull();
  });

  it('filters by only and goes back', () => {
    menus.register(speedMenu());
    menus.register(qualityMenu());
    store.set({ qualities: [{ label: '360p' }, { label: '720p' }], quality: 1 });
    menus.open({ only: ['quality'] });
    expect(texts()).toEqual(['360p', '720p']);
    menus.close();
    menus.open();
    items()[0]!.click();
    layer.querySelector<HTMLButtonElement>('.vp-menu-back')!.click();
    expect(texts()).toEqual(['Качество720p', 'СкоростьОбычная']);
  });

  it('closes on outside pointerdown and Escape but not on the toggle button', () => {
    menus.register(speedMenu());
    const toggle = document.createElement('button');
    toggle.dataset.vpMenuToggle = '';
    document.body.append(toggle);
    menus.open();
    toggle.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(menus.isOpen).toBe(true);
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(menus.isOpen).toBe(false);
    menus.open();
    layer.querySelector('.vp-menu')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(menus.isOpen).toBe(false);
  });

  it('does not open without visible menus', () => {
    menus.register(qualityMenu());
    menus.open();
    expect(menus.isOpen).toBe(false);
    expect(menuEvents).toEqual([]);
  });

  it('toggle and dispose', () => {
    menus.register(speedMenu());
    menus.toggle();
    expect(menus.isOpen).toBe(true);
    menus.toggle();
    expect(menus.isOpen).toBe(false);
    menus.open();
    menus.dispose();
    expect(layer.children).toHaveLength(0);
  });

  it('does not rebuild on unrelated state changes', () => {
    menus.register(speedMenu());
    menus.open();
    const first = items()[0];
    store.set({ currentTime: 5 });
    expect(items()[0]).toBe(first);
    store.set({ rate: 2 });
    expect(items()[0]).not.toBe(first);
  });

  it('unregister removes a menu', () => {
    const off = menus.register(speedMenu());
    off();
    expect(menus.hasVisible(store.get())).toBe(false);
  });

  it('keeps focus inside the panel when it re-renders', () => {
    menus.register(speedMenu());
    menus.open();
    items()[1]!.focus();
    store.set({ rate: 2 });
    const active = document.activeElement as HTMLElement;
    expect(active.tagName).toBe('BUTTON');
    expect(active.closest('.vp-menu')).not.toBeNull();
    expect(items().indexOf(active as HTMLButtonElement)).toBe(1);
  });

  it('restores focus to the previously focused element on close', () => {
    menus.register(speedMenu());
    const toggle = document.createElement('button');
    document.body.append(toggle);
    toggle.focus();
    menus.open();
    expect(document.activeElement).not.toBe(toggle);
    layer.querySelector('.vp-menu')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.activeElement).toBe(toggle);
  });

  it('ArrowUp/ArrowDown without a focused item go to the last/first item', () => {
    menus.register(speedMenu());
    menus.open();
    const key = (k: string) =>
      layer.querySelector('.vp-menu')!.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    (document.activeElement as HTMLElement).blur();
    key('ArrowUp');
    expect(document.activeElement).toBe(items()[2]);
    (document.activeElement as HTMLElement).blur();
    key('ArrowDown');
    expect(document.activeElement).toBe(items()[0]);
  });
});

describe('MenuHost outside-click dismissal', () => {
  let root: HTMLElement;
  let clickLayer: HTMLElement;
  let outside: HTMLElement;
  let clicks: string[];

  const press = (el: Element) => el.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  const click = (el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.replaceChildren();
    root = document.createElement('div');
    root.className = 'vp-root';
    layer = document.createElement('div');
    clickLayer = document.createElement('div');
    root.append(clickLayer, layer);
    outside = document.createElement('div');
    document.body.append(root, outside);
    clicks = [];
    clickLayer.addEventListener('click', () => clicks.push('layer'));
    outside.addEventListener('click', () => clicks.push('outside'));
    const events = createEventBus();
    menus = createMenuHost({ layer, store, events, t: createTranslator('ru'), icon: createIconSet(), log: createLogger(false) });
    menus.register(speedMenu());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('swallows the click that follows a dismissal inside the same player', () => {
    menus.open();
    press(clickLayer);
    click(clickLayer);
    expect(menus.isOpen).toBe(false);
    expect(clicks).toEqual([]);
  });

  it('does not swallow clicks outside the player', () => {
    menus.open();
    press(outside);
    click(outside);
    expect(menus.isOpen).toBe(false);
    expect(clicks).toEqual(['outside']);
  });

  it('lets a later click inside the player through after a swallowed dismissal', () => {
    menus.open();
    press(clickLayer);
    click(clickLayer);
    press(clickLayer);
    click(clickLayer);
    expect(clicks).toEqual(['layer']);
  });

  it('stops swallowing after a timeout and on dispose', () => {
    menus.open();
    press(clickLayer);
    vi.advanceTimersByTime(700);
    click(clickLayer);
    expect(clicks).toEqual(['layer']);

    menus.open();
    press(clickLayer);
    menus.dispose();
    click(clickLayer);
    expect(clicks).toEqual(['layer', 'layer']);
  });
});
