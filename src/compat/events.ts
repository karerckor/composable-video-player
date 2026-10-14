import type { EventBus, EventName } from '../types';
import { PLAYERJS_EVENTS } from '../api/events-list';

const PUBLIC = new Set<EventName>(PLAYERJS_EVENTS);

/**
 * PlayerJS-style events: global `PlayerjsEvents(event, id, data)` and DOM CustomEvents on the container.
 * `init` is delivered in a microtask so handlers can already use the `new Playerjs(...)` result.
 */
export function bridgeEvents(events: EventBus, container: HTMLElement, id: string): () => void {
  let active = true;
  const deliver = (name: EventName, data: unknown) => {
    const handler = (window as unknown as { PlayerjsEvents?: unknown }).PlayerjsEvents;
    if (typeof handler === 'function') {
      try {
        handler(name, id, data);
      } catch (e) {
        console.error('[vp] PlayerjsEvents handler failed', e);
      }
    }
    container.dispatchEvent(new CustomEvent(name, { detail: data }));
  };
  let pending: Array<[EventName, unknown]> | null = null;
  const offAny = events.onAny((name, data) => {
    if (!PUBLIC.has(name)) return;
    if (pending) {
      pending.push([name, data]);
    } else if (name === 'init') {
      const buffer: Array<[EventName, unknown]> = (pending = [[name, data]]);
      queueMicrotask(() => {
        if (!active) return;
        pending = null;
        for (const [n, d] of buffer) deliver(n, d);
      });
    } else {
      deliver(name, data);
    }
  });
  return () => {
    active = false;
    pending = null;
    offAny();
  };
}
