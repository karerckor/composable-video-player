import type { CommandContext, Plugin } from '../types';
import { sourceKey } from '../source/parse';

export interface MemoryOptions {
  position?: boolean;
  volume?: boolean;
  quality?: boolean;
  speed?: boolean;
  subtitle?: boolean;
  audio?: boolean;
  /** Defaults to window.localStorage; `null` disables persistence. */
  storage?: Storage | null;
}

declare module '../types' {
  interface PlayerOptions {
    memory?: Omit<MemoryOptions, 'storage'> | false;
    /** Stable id for remembering the position. PlayerJS: cuid. */
    cuid?: string;
  }
  interface PlayerState {
    cuid?: string;
  }
  interface PlayerCommands {
    setCuid(id: string): void;
  }
}

const KEYS = {
  volume: 'vp:volume',
  muted: 'vp:muted',
  speed: 'vp:speed',
  quality: 'vp:quality',
  audio: 'vp:audio',
  subtitle: 'vp:subtitle',
} as const;
const SAVE_EVERY_SECONDS = 5;

/**
 * Whether to resume from a saved position.
 * @param saved    saved playback position, seconds
 * @param duration duration recorded with the position (NaN when unknown)
 */
export function shouldRestorePosition(saved: number, duration: number): boolean {
  // Reference rule chosen by the project owner.
  return saved > 5 && (!(duration > 0) || saved < duration - 10);
}

const explicit = (c: CommandContext) => c.source !== 'internal';

/** Reading `localStorage` itself throws SecurityError in opaque origins (sandboxed iframes, blocked storage). */
function defaultStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function memoryPlugin(o: MemoryOptions = {}): Plugin {
  return {
    name: 'memory',
    setup(ctx) {
      if (ctx.options.memory === false) return;
      const cfg = { position: true, volume: true, quality: true, speed: true, subtitle: true, audio: true, ...(ctx.options.memory || {}), ...o };
      const storage = o.storage !== undefined ? o.storage : defaultStorage();

      const get = (key: string): string | null => {
        try {
          return storage?.getItem(key) ?? null;
        } catch {
          return null;
        }
      };
      const set = (key: string, value: string) => {
        try {
          storage?.setItem(key, value);
        } catch {
          /* private mode or quota exceeded */
        }
      };
      const remove = (key: string) => {
        try {
          storage?.removeItem(key);
        } catch {
          /* ignore */
        }
      };
      const num = (value: string | null) => {
        if (value === null) return null;
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
      };
      const readPosition = (key: string): { t: number; d: number } | null => {
        try {
          const value = JSON.parse(get(key) ?? 'null') as { t?: unknown; d?: unknown } | null;
          return value && typeof value.t === 'number' ? { t: value.t, d: typeof value.d === 'number' ? value.d : NaN } : null;
        } catch {
          return null;
        }
      };

      ctx.store.set({ cuid: ctx.options.cuid });
      const saved = {
        volume: num(get(KEYS.volume)),
        muted: get(KEYS.muted),
        speed: num(get(KEYS.speed)),
        subtitle: get(KEYS.subtitle),
      };
      let positionKey: string | null = null;
      let lastSaved = -Infinity;

      const savePosition = () => {
        const s = ctx.store.get();
        if (!positionKey || s.live || !(s.currentTime > 0)) return;
        lastSaved = s.currentTime;
        set(positionKey, JSON.stringify({ t: s.currentTime, d: s.duration }));
      };

      const offs: Array<() => void> = [
        ctx.commands.register('setCuid', ([id]) => ctx.store.set({ cuid: id })),

        ctx.events.on('init', () => {
          // Apply the snapshot taken in setup: other plugins' init handlers (e.g. speed's defaultSpeed)
          // may already have fired change events that this plugin persisted.
          if (cfg.volume) {
            if (saved.volume !== null) ctx.commands.run('setVolume', [saved.volume]);
            if (saved.muted === '1') ctx.commands.run('mute', []);
          }
          if (cfg.speed && saved.speed !== null && saved.speed > 0) ctx.commands.run('setRate', [saved.speed]);
          if (cfg.subtitle && saved.subtitle !== null) ctx.store.set({ preferredSubtitle: saved.subtitle });
        }),

        ctx.addSourceTransform((spec, sel) => {
          let next = sel;
          const id = ctx.store.get().cuid ?? `${location.pathname}#${ctx.player.id}#${sourceKey(spec)}`;
          positionKey = cfg.position ? `vp:t:${id}` : null;
          lastSaved = -Infinity;
          if (positionKey) {
            const saved = readPosition(positionKey);
            if (saved && shouldRestorePosition(saved.t, saved.d)) next = { ...next, start: saved.t };
          }
          if (cfg.quality) {
            const label = get(KEYS.quality);
            const index = label === null ? -1 : spec.qualities.findIndex((q) => q.label === label);
            if (index >= 0) next = { ...next, quality: index };
          }
          if (cfg.audio) {
            const label = get(KEYS.audio);
            const tracks = spec.qualities[next.quality]?.tracks ?? [];
            const index = label === null ? -1 : tracks.findIndex((t) => t.label === label);
            if (index >= 0) next = { ...next, audio: index };
          }
          return next;
        }),

        ctx.events.on('time', (t) => {
          if (Math.abs(t - lastSaved) >= SAVE_EVERY_SECONDS) savePosition();
        }),
        ctx.events.on('pause', savePosition),
        ctx.events.on('end', () => {
          if (positionKey) remove(positionKey);
        }),

        ctx.events.on('volume', (v) => {
          if (cfg.volume) set(KEYS.volume, String(v));
        }),
        ctx.commands.before('mute', (_args, c) => {
          if (cfg.volume && explicit(c)) set(KEYS.muted, '1');
        }),
        ctx.commands.before('toggleMute', (_args, c) => {
          if (cfg.volume && explicit(c)) set(KEYS.muted, ctx.store.get().muted ? '0' : '1');
        }),
        ctx.events.on('unmute', () => {
          if (cfg.volume) set(KEYS.muted, '0');
        }),
        ctx.events.on('speed', (rate) => {
          if (cfg.speed) set(KEYS.speed, String(rate));
        }),
        ctx.events.on('quality', (label) => {
          if (cfg.quality) set(KEYS.quality, label);
        }),
        ctx.events.on('audiotrack', (label) => {
          if (cfg.audio) set(KEYS.audio, label);
        }),
        ctx.events.on('subtitle', (label) => {
          if (cfg.subtitle) set(KEYS.subtitle, label);
        }),
      ];
      return () => offs.forEach((off) => off());
    },
  };
}
