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

  // Selectors run plugin code (menus, hide rules): a throw must not escape into whoever called `set`.
  const evaluate = <T>(selector: (s: S) => T): { ok: true; value: T } | { ok: false } => {
    try {
      return { ok: true, value: selector(state) };
    } catch (e) {
      log?.error('store selector failed', e);
      return { ok: false };
    }
  };

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
        const result = evaluate(sub.selector);
        if (!result.ok) continue;
        const value = result.value;
        if (sub.equals(value, sub.last)) continue;
        const prev = sub.last;
        sub.last = value;
        call(sub, value, prev);
      }
    },

    select<T>(selector: (s: S) => T, cb: (value: T, prev: T) => void, opts: SelectOptions<T> = {}) {
      const initial = evaluate(selector);
      // A selector that throws up front starts from `undefined` and has nothing to report immediately.
      const sub: Subscription<S, T> = { selector, cb, equals: opts.equals ?? Object.is, last: initial.ok ? initial.value : (undefined as T) };
      subs.add(sub);
      if (opts.immediate && initial.ok) call(sub, sub.last, sub.last);
      return () => {
        subs.delete(sub);
      };
    },
  };
}
