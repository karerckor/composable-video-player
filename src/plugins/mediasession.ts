import type { CommandContext, CommandName, Plugin } from '../types';

declare module '../types' {
  interface PlayerOptions {
    /** `false` disables lock-screen / media keys integration. */
    mediasession?: boolean;
  }
}

type Handler = (details?: { seekTime?: number; seekOffset?: number }) => void;
const USER: CommandContext = { source: 'user' };
const ACTIONS = ['play', 'pause', 'seekto', 'seekbackward', 'seekforward', 'previoustrack', 'nexttrack'] as const;

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
      for (const name of ACTIONS) setHandler(name, handlers[name]);

      const offs = [
        ctx.store.select(
          (s) => `${s.title}\n${s.poster}`,
          () => {
            const s = ctx.store.get();
            try {
              session.metadata = new MediaMetadata({ title: s.title, artwork: s.poster ? [{ src: s.poster }] : [] });
            } catch {
              /* MediaMetadata missing */
            }
          },
          { immediate: true },
        ),
        ctx.store.select(
          (s) => s.status,
          (status) => {
            session.playbackState = status === 'playing' ? 'playing' : status === 'paused' || status === 'ended' ? 'paused' : 'none';
          },
          { immediate: true },
        ),
      ];
      return () => {
        offs.forEach((off) => off());
        for (const name of ACTIONS) setHandler(name, null);
      };
    },
  };
}
