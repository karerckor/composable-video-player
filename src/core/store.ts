import type { Logger, SelectOptions, Store } from '../types';

interface Subscription<S, T> {
  selector: (s: S) => T;
  cb: (value: T, prev: T) => void;
  equals: (a: T, b: T) => boolean;
  last: T;
}

export function createStore<S extends object>(initial: S, log?: Logger): Store<S> {
  let state: S = { ...initial };
  const subs = new Set<Subscription<S, any>>();

  const call = <T>(sub: Subscription<S, T>, value: T, prev: T) => {
    try {
      sub.cb(value, prev);
    } catch (e) {
      log?.error('store subscriber failed', e);
    }
  };

  return {
    get: () => state,

    set(patch) {
      const changed = (Object.keys(patch) as Array<keyof S>).some((k) => !Object.is(state[k], patch[k]));
      if (!changed) return;
      state = { ...state, ...patch };
      for (const sub of [...subs]) {
        if (!subs.has(sub)) continue;
        const value = sub.selector(state);
        if (sub.equals(value, sub.last)) continue;
        const prev = sub.last;
        sub.last = value;
        call(sub, value, prev);
      }
    },

    select<T>(selector: (s: S) => T, cb: (value: T, prev: T) => void, opts: SelectOptions<T> = {}) {
      const sub: Subscription<S, T> = { selector, cb, equals: opts.equals ?? Object.is, last: selector(state) };
      subs.add(sub);
      if (opts.immediate) call(sub, sub.last, sub.last);
      return () => {
        subs.delete(sub);
      };
    },
  };
}
