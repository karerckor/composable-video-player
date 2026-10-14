import type { Player, Plugin } from '../types';
import { createPlayerCore } from '../player';
import { createLogger } from '../core/logger';
import { defaultPlugins } from '../plugins';
import { bridgeEvents } from './events';
import { bridgePostMessage } from './postmessage';
import { flag, mapPlayerjsOptions, type PlayerjsOptions } from './options';

export type { PlayerjsOptions } from './options';

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
          offs.push(bridgePostMessage({ api: (cmd, arg) => ctx.player.api(cmd, arg), events: ctx.events, id: ctx.player.id, origin: opts.postmessageOrigin }));
        }
        if (typeof opts.ready === 'string') {
          const name = opts.ready;
          offs.push(
            ctx.events.once('init', () => {
              const fn = (window as unknown as Record<string, unknown>)[name];
              if (typeof fn === 'function') fn(ctx.player.id);
              else ctx.log.warn(`Playerjs: ready function "${name}" not found`);
            }),
          );
        }
        return () => offs.forEach((off) => off());
      },
    };

    if (flag(opts.nocontrols)) options.layout = { type: 'root', children: [{ type: 'media-click-layer' }] };
    this.player = createPlayerCore({ ...options, plugins: [compat, ...defaultPlugins()] });
  }

  api(cmd: string, arg?: unknown): unknown {
    return this.player.api(cmd, arg);
  }
}
