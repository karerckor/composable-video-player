import type { EventBus, EventHandler, EventName, Logger } from '../types';

type AnyHandler = (name: EventName, data: unknown) => void;

export function createEventBus(log?: Logger): EventBus {
  const handlers = new Map<EventName, Set<(data: unknown) => void>>();
  const anyHandlers = new Set<AnyHandler>();

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
        (cb as (data: unknown) => void)(data);
      }) as EventHandler<typeof name>;
      const off = bus.on(name, wrapper);
      return off;
    },

    off(name, cb) {
      handlers.get(name)?.delete(cb as (data: unknown) => void);
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
