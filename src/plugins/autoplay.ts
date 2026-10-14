import type { Plugin } from '../types';

declare module '../types' {
  interface PlayerOptions {
    /** Retry muted when the browser blocks autoplay with sound (default true). */
    autoplayMuteFallback?: boolean;
  }
}

export interface AutoplayPluginOptions {
  muteFallback?: boolean;
}

const isNotAllowed = (e: unknown) => (e as { name?: string } | null)?.name === 'NotAllowedError';

export function autoplayPlugin(o: AutoplayPluginOptions = {}): Plugin {
  return {
    name: 'autoplay',
    setup(ctx) {
      if (!ctx.options.autoplay) return;
      const muteFallback = o.muteFallback ?? ctx.options.autoplayMuteFallback ?? true;
      let armed = false;
      let firstSource = true;
      let mutedByAutoplay = false;

      const attempt = () => {
        ctx.player.play().catch((err) => {
          if (muteFallback && isNotAllowed(err) && !ctx.store.get().muted) {
            mutedByAutoplay = true;
            ctx.commands.run('mute', []);
            ctx.player.play().catch((e) => ctx.log.warn('muted autoplay failed', e));
          } else {
            ctx.log.warn('autoplay failed', err);
          }
        });
      };

      const offs = [
        ctx.events.on('new', () => {
          armed = firstSource;
          firstSource = false;
        }),
        ctx.events.on('metadata', () => {
          if (!armed) return;
          armed = false;
          attempt();
        }),
        ctx.events.on('unmute', () => {
          mutedByAutoplay = false;
        }),
        ctx.commands.before('toggle', (_args, c) => {
          if (!mutedByAutoplay || c.source !== 'user') return;
          mutedByAutoplay = false;
          const status = ctx.store.get().status;
          if (status !== 'playing' && status !== 'loading') return; // e.g. paused: a plain toggle
          ctx.commands.run('unmute', []);
          return false;
        }),
      ];
      return () => offs.forEach((off) => off());
    },
  };
}
