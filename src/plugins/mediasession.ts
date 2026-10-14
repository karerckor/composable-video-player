import type { CommandContext, CommandName, Plugin } from '../types.js';

declare module '../types.js' {
  interface PlayerOptions {
    /** `false` disables lock-screen / media keys integration. */
    mediasession?: boolean;
  }
}

type Handler = (details?: { seekTime?: number; seekOffset?: number }) => void;
const USER: CommandContext = { source: 'user' };
const ACTIONS = ['play', 'pause', 'seekto', 'seekbackward', 'seekforward', 'previoustrack', 'nexttrack'] as const;

/** The plugin instance (player) that currently controls the page-wide media session. */
let owner: object | null = null;

export function mediaSessionPlugin(): Plugin {
  return {
    name: 'mediasession',
    setup(ctx) {
      if (ctx.options.mediasession === false || typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
      const session = navigator.mediaSession;
      const run = (name: CommandName, ...args: unknown[]) => {
        const result = (ctx.commands.run as unknown as (n: string, a: unknown[], c: CommandContext) => unknown)(name, args, USER);
        if (result instanceof Promise) result.catch((e) => ctx.log.warn('media session action rejected', e));
      };
      const handlers: Record<(typeof ACTIONS)[number], Handler | null> = {
        play: () => run('play'),
        pause: () => run('pause'),
        seekto: (d) => {
          if (typeof d?.seekTime === 'number') run('seek', d.seekTime);
        },
        seekbackward: (d) => run('seek', `-${d?.seekOffset ?? 10}`),
        seekforward: (d) => run('seek', `+${d?.seekOffset ?? 10}`),
        previoustrack: ctx.commands.has('prev') ? () => run('prev' as CommandName) : null,
        nexttrack: ctx.commands.has('next') ? () => run('next' as CommandName) : null,
      };
      const setHandler = (name: string, fn: Handler | null) => {
        try {
          session.setActionHandler(name as MediaSessionAction, fn as MediaSessionActionHandler | null);
        } catch {
          /* action not supported by this browser */
        }
      };
      const token = {};
      let lastState: MediaSessionPlaybackState = 'none';

      const publishMetadata = () => {
        if (owner !== token) return;
        const s = ctx.store.get();
        try {
          session.metadata = new MediaMetadata({ title: s.title, artwork: s.poster ? [{ src: s.poster }] : [] });
        } catch {
          /* MediaMetadata missing */
        }
      };
      const publishState = () => {
        if (owner === token) session.playbackState = lastState;
      };
      const claim = () => {
        if (owner === token) return;
        owner = token;
        for (const name of ACTIONS) setHandler(name, handlers[name]);
        publishMetadata();
        publishState();
      };
      if (owner === null) claim();

      const offs = [
        ctx.events.on('play', claim),
        ctx.store.select((s) => `${s.title}\n${s.poster}`, publishMetadata, { immediate: true }),
        ctx.store.select(
          (s) => s.status,
          (status) => {
            // 'loading' (buffering, source switch) keeps the previous state so the lock screen doesn't flicker.
            if (status === 'playing') lastState = 'playing';
            else if (status === 'paused' || status === 'ended') lastState = 'paused';
            else if (status !== 'loading') lastState = 'none';
            publishState();
          },
          { immediate: true },
        ),
      ];
      return () => {
        offs.forEach((off) => off());
        if (owner !== token) return;
        for (const name of ACTIONS) setHandler(name, null);
        try {
          session.metadata = null;
        } catch {
          /* ignore */
        }
        session.playbackState = 'none';
        owner = null;
      };
    },
  };
}
