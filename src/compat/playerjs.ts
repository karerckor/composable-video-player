import type { Player, Plugin } from '../types.js';
import { createPlayerCore } from '../player.js';
import { createLogger } from '../core/logger.js';
import { defaultPlugins } from '../plugins/index.js';
import { bridgeEvents } from './events.js';
import { bridgePostMessage } from './postmessage.js';
import { flag, mapPlayerjsOptions, type PlayerjsOptions } from './options.js';

export type { PlayerjsOptions } from './options.js';

/** Drop-in style facade: `new Playerjs({ id, file, ... })` + `player.api(cmd, arg)`. */
export class Playerjs {
  readonly player: Player;

  constructor(opts: PlayerjsOptions) {
    const log = createLogger(flag(opts.log));
    const options = mapPlayerjsOptions(opts, log);

    // Installed as the first plugin so the bridges see `init`.
    const compat: Plugin = {
      name: 'playerjs-compat',
      setup(ctx) {
        const offs: Array<() => void> = [bridgeEvents(ctx.events, ctx.player.container, ctx.player.id)];
        if (flag(opts.postmessage)) {
          if (!opts.postmessageOrigin) {
            ctx.log.warn('Playerjs: postmessage is enabled without postmessageOrigin, so any embedding page can control the player; set postmessageOrigin to restrict it');
          }
          offs.push(bridgePostMessage({ api: (cmd, arg) => ctx.player.api(cmd, arg), events: ctx.events, id: ctx.player.id, origin: opts.postmessageOrigin }));
        }
        if (typeof opts.ready === 'string') {
          const name = opts.ready;
          let active = true;
          offs.push(() => {
            active = false;
          });
          offs.push(
            ctx.events.once('init', () => {
              // After the constructor returned, so `ready` can use `var player = new Playerjs(...)`.
              queueMicrotask(() => {
                if (!active) return;
                const fn = (window as unknown as Record<string, unknown>)[name];
                if (typeof fn === 'function') {
                  try {
                    fn(ctx.player.id);
                  } catch (e) {
                    console.error('[vp] ready callback failed', e);
                  }
                } else ctx.log.warn(`Playerjs: ready function "${name}" not found`);
              });
            }),
          );
        }
        return () => offs.forEach((off) => off());
      },
    };

    if (flag(opts.nocontrols)) options.layout = { type: 'root', children: [{ type: 'media-click-layer' }] };
    this.player = createPlayerCore({ lang: 'ru', ...options, plugins: [compat, ...defaultPlugins()] });
  }

  api(cmd: string, arg?: unknown): unknown {
    return this.player.api(cmd, arg);
  }
}
