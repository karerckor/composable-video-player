import type { Logger } from '../types';

export interface Registry<T> {
  register(name: string, item: T): void;
  get(name: string): T | undefined;
  has(name: string): boolean;
}

export function createRegistry<T>(kind: string, log: Logger): Registry<T> {
  const items = new Map<string, T>();
  return {
    register(name, item) {
      if (items.has(name)) log.warn(`${kind} "${name}" replaced`);
      items.set(name, item);
    },
    get: (name) => items.get(name),
    has: (name) => items.has(name),
  };
}
