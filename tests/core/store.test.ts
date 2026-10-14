import { describe, expect, it, vi } from 'vitest';
import { createStore } from '../../src/core/store';
import { createLogger } from '../../src/core/logger';

interface S { a: number; b: string; list: number[] }
const initial = (): S => ({ a: 1, b: 'x', list: [] });

describe('createStore', () => {
  it('returns state and merges patches', () => {
    const store = createStore(initial());
    store.set({ a: 2 });
    expect(store.get()).toEqual({ a: 2, b: 'x', list: [] });
  });

  it('notifies selectors only when the selected value changes', () => {
    const store = createStore(initial());
    const cb = vi.fn();
    store.select((s) => s.a, cb);
    store.set({ b: 'y' });
    expect(cb).not.toHaveBeenCalled();
    store.set({ a: 5 });
    expect(cb).toHaveBeenCalledWith(5, 1);
  });

  it('supports immediate and custom equality', () => {
    const store = createStore(initial());
    const cb = vi.fn();
    store.select((s) => ({ a: s.a }), cb, { immediate: true, equals: (x, y) => x.a === y.a });
    expect(cb).toHaveBeenCalledTimes(1);
    store.set({ b: 'z' });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('skips notification when the patch changes nothing', () => {
    const store = createStore(initial());
    const cb = vi.fn();
    store.select((s) => s, cb);
    store.set({ a: 1 });
    expect(cb).not.toHaveBeenCalled();
  });

  it('unsubscribes', () => {
    const store = createStore(initial());
    const cb = vi.fn();
    const off = store.select((s) => s.a, cb);
    off();
    store.set({ a: 3 });
    expect(cb).not.toHaveBeenCalled();
  });

  it('isolates throwing subscribers', () => {
    const log = createLogger(false);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const store = createStore(initial(), log);
    const good = vi.fn();
    store.select((s) => s.a, () => { throw new Error('bad'); });
    store.select((s) => s.a, good);
    store.set({ a: 9 });
    expect(good).toHaveBeenCalledWith(9, 1);
    expect(err).toHaveBeenCalled();
  });

  it('handles nested set inside a subscriber', () => {
    const store = createStore(initial());
    const seen: number[] = [];
    store.select((s) => s.a, (a) => { if (a === 2) store.set({ a: 3 }); });
    store.select((s) => s.a, (a) => seen.push(a));
    store.set({ a: 2 });
    expect(store.get().a).toBe(3);
    expect(seen[seen.length - 1]).toBe(3);
  });
});

describe('createLogger', () => {
  it('prints debug only when enabled', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    createLogger(false).debug('hidden');
    expect(spy).not.toHaveBeenCalled();
    createLogger(true).debug('shown');
    expect(spy).toHaveBeenCalledWith('[vp]', 'shown');
  });
});
