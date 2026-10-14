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
  const offAny = events.onAny((name, data) => {
    if (!PUBLIC.has(name)) return;
    if (name === 'init') {
      queueMicrotask(() => {
        if (active) deliver(name, data);
      });
    } else {
      deliver(name, data);
    }
  });
  return () => {
    active = false;
    offAny();
  };
}
