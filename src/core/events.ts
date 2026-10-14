import type { EventBus, EventHandler, EventName, Logger } from '../types';

type AnyHandler = (name: EventName, data: unknown) => void;

export function createEventBus(log?: Logger): EventBus {
  const handlers = new Map<EventName, Set<(data: unknown) => void>>();
  const anyHandlers = new Set<AnyHandler>();
  const onceWrappers = new Map<unknown, (data: unknown) => void>();

  const safe = (fn: () => void, name: EventName) => {
    try {
      fn();
    } catch (e) {
      log?.error(`event handler for "${String(name)}" failed`, e);
    }
  };

  const bus: EventBus = {
    on(name, cb) {
      let set = handlers.get(name);
      if (!set) handlers.set(name, (set = new Set()));
      set.add(cb as (data: unknown) => void);
      return () => bus.off(name, cb);
    },

    once(name, cb) {
      const wrapper = ((data: unknown) => {
        off();
        onceWrappers.delete(cb);
        (cb as (data: unknown) => void)(data);
      }) as EventHandler<typeof name>;
      const off = bus.on(name, wrapper);
      onceWrappers.set(cb, wrapper as (data: unknown) => void);
      return () => {
        off();
        if (onceWrappers.get(cb) === wrapper) onceWrappers.delete(cb);
      };
    },

    off(name, cb) {
      const set = handlers.get(name);
      set?.delete(cb as (data: unknown) => void);
      const wrapper = onceWrappers.get(cb);
      if (wrapper && set?.delete(wrapper)) onceWrappers.delete(cb);
    },

    emit(name, ...args) {
      const data = args[0];
      const set = handlers.get(name);
      if (set) for (const cb of [...set]) safe(() => cb(data), name);
      for (const cb of [...anyHandlers]) safe(() => cb(name, data), name);
    },

    onAny(cb) {
      anyHandlers.add(cb);
      return () => {
        anyHandlers.delete(cb);
      };
    },
  };
  return bus;
}
