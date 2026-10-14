import type { Logger, MenuHost, Player, PlayerState, Store } from '../types';

export type Align = 'left' | 'center' | 'right';
export type Action =
  | { type: 'api'; name: string; args: string[] }
  | { type: 'js'; fn: string; args: string[] }
  | { type: 'event'; name: string }
  | { type: 'settings'; only: string[]; align: Align | undefined }
  | { type: 'url'; url: string };

const ALIGNS: readonly string[] = ['left', 'center', 'right'];
const PATH_RE = /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/;
const BLOCKED_SEGMENTS = new Set(['eval', 'Function', 'setTimeout', 'setInterval', 'execScript', 'constructor', '__proto__', 'prototype']);
const trimAll = (parts: string[]) => parts.map((p) => p.trim());

export function parseAction(input: string): Action[] {
  const s = input.trim();
  if (s.startsWith('api:')) {
    return s
      .slice(4)
      .split(';')
      .map((p) => p.trim())
      .filter(Boolean)
      .map((part) => {
        const [name = '', ...args] = trimAll(part.split(','));
        return { type: 'api' as const, name, args };
      });
  }
  if (s.startsWith('js:')) {
    const [fn = '', ...args] = trimAll(s.slice(3).split(','));
    return [{ type: 'js', fn, args }];
  }
  if (s.startsWith('event:')) return [{ type: 'event', name: s.slice(6).trim() }];
  if (s === 'settings' || s.startsWith('settings:')) {
    const parts = trimAll(s.slice(9).split(',')).filter(Boolean);
    const align = parts.find((p) => ALIGNS.includes(p)) as Align | undefined;
    return [{ type: 'settings', only: parts.filter((p) => p !== align), align }];
  }
  if (/^(https?:)?\/\//.test(s)) return [{ type: 'url', url: s }];
  return [];
}

export interface ActionRunnerDeps {
  player: Player;
  store: Store<PlayerState>;
  menus: MenuHost;
  log: Logger;
}

function resolveGlobal(path: string): { fn: unknown; self: unknown } {
  let self: unknown = window;
  let value: unknown = window;
  for (const key of path.split('.')) {
    self = value;
    value = value == null ? undefined : (value as Record<string, unknown>)[key];
  }
  return { fn: value, self };
}

export function createActionRunner(d: ActionRunnerDeps): (action: string) => void {
  const whole = (n: number) => String(Number.isFinite(n) ? Math.floor(n) : 0);
  const fill = (value: string, encode = false) => {
    const s = d.store.get();
    return value.replace(/\{(time|duration|title|file)\}/g, (_m, key: string) => {
      const raw = key === 'time' ? whole(s.currentTime) : key === 'duration' ? whole(s.duration) : key === 'title' ? s.title : s.url;
      return encode ? encodeURIComponent(raw) : raw;
    });
  };

  const execute = (action: Action) => {
    switch (action.type) {
      case 'api': {
        const result = d.player.api(action.name, action.args[0] !== undefined ? fill(action.args[0]) : undefined);
        if (result instanceof Promise) result.catch((e) => d.log.warn(`action api:${action.name} rejected`, e));
        break;
      }
      case 'js': {
        // `js:` actions are author-controlled code, equivalent to the page calling the function itself.
        if (!PATH_RE.test(action.fn) || action.fn.split('.').some((segment) => BLOCKED_SEGMENTS.has(segment))) {
          d.log.warn(`invalid js action "${action.fn}"`);
          break;
        }
        const { fn, self } = resolveGlobal(action.fn);
        if (typeof fn !== 'function') {
          d.log.warn(`js action "${action.fn}" is not a function`);
          break;
        }
        fn.apply(self, action.args.map((arg) => fill(arg)));
        break;
      }
      case 'event':
        d.player.container.dispatchEvent(new CustomEvent(action.name, { detail: d.store.get(), bubbles: true }));
        break;
      case 'settings':
        d.menus.open({ only: action.only.length ? action.only : undefined, align: action.align });
        break;
      case 'url':
        window.open(fill(action.url, true), '_blank', 'noopener');
        break;
    }
  };

  return (input) => {
    for (const action of parseAction(input)) {
      try {
        execute(action);
      } catch (e) {
        d.log.error(`action "${input}" failed`, e);
      }
    }
  };
}
