import type { Player, PlayerOptions } from './types.js';
import { createPlayerCore } from './player.js';
import { defaultPlugins } from './plugins/index.js';

/** Creates a player with all v1 plugins unless `options.plugins` is given. */
export function createPlayer(options: PlayerOptions): Player {
  return createPlayerCore({ ...options, plugins: options.plugins ?? defaultPlugins() });
}
