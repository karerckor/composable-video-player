import { describe, expect, it, vi } from 'vitest';
import { createStore } from '../../src/core/store.js';
import { createLogger } from '../../src/core/logger.js';

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

  it('isolates throwing selectors: the set lands, other subscribers run, the failed one keeps its last value', () => {
    const log = createLogger(false);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const store = createStore(initial(), log);
    const bad = vi.fn();
    const good = vi.fn();
    store.select((s) => { if (s.a === 9) throw new Error('boom'); return s.a; }, bad);
    store.select((s) => s.a, good);
    expect(() => store.set({ a: 9 })).not.toThrow();
    expect(store.get().a).toBe(9);
    expect(good).toHaveBeenCalledWith(9, 1);
    expect(bad).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalledWith('[vp]', 'store selector failed', expect.any(Error));
    // `last` stayed at 1, so the next successful evaluation reports the change from 1.
    store.set({ a: 10 });
    expect(bad).toHaveBeenCalledWith(10, 1);
  });

  it('a selector throwing on subscribe is logged, starts from undefined and skips the immediate call', () => {
    const log = createLogger(false);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const store = createStore(initial(), log);
    const cb = vi.fn();
    expect(() =>
      store.select((s) => { if (s.a === 1) throw new Error('boom'); return s.a; }, cb, { immediate: true }),
    ).not.toThrow();
    expect(err).toHaveBeenCalledWith('[vp]', 'store selector failed', expect.any(Error));
    // No value could be computed, so there is nothing to report immediately.
    expect(cb).not.toHaveBeenCalled();
    store.set({ a: 2 });
    expect(cb).toHaveBeenCalledWith(2, undefined);
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
