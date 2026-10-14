import type { EventBus, EventName } from '../types.js';
import { PLAYERJS_EVENTS } from '../api/events-list.js';

const PUBLIC = new Set<EventName>(PLAYERJS_EVENTS);

export interface PostMessageBridgeOptions {
  api: (cmd: string, arg?: unknown) => unknown;
  events: EventBus;
  id: string;
  /** Accept commands only from this origin and post events only to it. */
  origin?: string;
  win?: Window;
}

/** Iframe embedding: `{ api, set }` commands from the parent, `{ event, id, data }` events to the parent. */
export function bridgePostMessage(o: PostMessageBridgeOptions): () => void {
  const win = o.win ?? window;
  const parent = win.parent;

  const onMessage = (e: MessageEvent) => {
    if (e.source !== parent) return;
    if (o.origin && e.origin !== o.origin) return;
    const data = e.data as { api?: unknown; set?: unknown; id?: unknown } | null;
    if (!data || typeof data !== 'object' || typeof data.api !== 'string') return;
    if (typeof data.id === 'string' && data.id !== o.id) return;
    try {
      const answer = 'set' in data ? o.api(data.api, data.set) : o.api(data.api);
      if (answer !== undefined && !(answer instanceof Promise)) {
        (e.source as Window).postMessage({ event: data.api, answer, id: o.id }, !e.origin || e.origin === 'null' ? '*' : e.origin);
      }
    } catch (err) {
      console.warn('[vp]', `postMessage command "${data.api}" failed`, err);
    }
  };
  win.addEventListener('message', onMessage as EventListener);

  const offEvents =
    parent && parent !== win
      ? o.events.onAny((name, data) => {
          if (!PUBLIC.has(name)) return;
          try {
            parent.postMessage({ event: name, id: o.id, data }, o.origin ?? '*');
          } catch {
            /* non-cloneable payload */
          }
        })
      : () => {};

  return () => {
    win.removeEventListener('message', onMessage as EventListener);
    offEvents();
  };
}
