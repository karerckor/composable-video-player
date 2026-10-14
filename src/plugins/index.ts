import type { Plugin } from '../types.js';
import { qualityPlugin } from './quality.js';
import { speedPlugin } from './speed.js';
import { audioTracksPlugin } from './audiotracks.js';
import { subtitlesPlugin } from './subtitles/index.js';
import { thumbnailsPlugin } from './thumbnails/index.js';
import { playlistPlugin } from './playlist/index.js';
import { hotkeysPlugin } from './hotkeys.js';
import { autoplayPlugin } from './autoplay.js';
import { memoryPlugin } from './memory.js';
import { mediaSessionPlugin } from './mediasession.js';

/**
 * All v1 plugins. Order matters:
 * - memory after quality/speed/subtitles/audiotracks (its transforms and init run later, so saved values win);
 * - memory precedes autoplay so saved mute/position are restored before autoplay plays;
 * - mediasession after playlist (prev/next commands must exist at setup).
 */
export function defaultPlugins(): Plugin[] {
  return [
    qualityPlugin(),
    speedPlugin(),
    audioTracksPlugin(),
    subtitlesPlugin(),
    thumbnailsPlugin(),
    playlistPlugin(),
    hotkeysPlugin(),
    memoryPlugin(),
    autoplayPlugin(),
    mediaSessionPlugin(),
  ];
}

export { qualityPlugin, pickQuality } from './quality.js';
export { speedPlugin, DEFAULT_SPEEDS } from './speed.js';
export { audioTracksPlugin } from './audiotracks.js';
export { subtitlesPlugin } from './subtitles/index.js';
export { thumbnailsPlugin } from './thumbnails/index.js';
export { playlistPlugin, type PlaylistItem, type PlaylistState } from './playlist/index.js';
export { hotkeysPlugin, type HotkeysOptions } from './hotkeys.js';
export { autoplayPlugin } from './autoplay.js';
export { memoryPlugin, shouldRestorePosition } from './memory.js';
export { mediaSessionPlugin } from './mediasession.js';
