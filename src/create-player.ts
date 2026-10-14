import type { Player, PlayerOptions } from './types';
import { createPlayerCore } from './player';
import { defaultPlugins } from './plugins';

/** Creates a player with all v1 plugins unless `options.plugins` is given. */
export function createPlayer(options: PlayerOptions): Player {
  return createPlayerCore({ ...options, plugins: options.plugins ?? defaultPlugins() });
}
