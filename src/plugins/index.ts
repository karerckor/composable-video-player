import type { Plugin } from '../types';
import { qualityPlugin } from './quality';
import { speedPlugin } from './speed';
import { audioTracksPlugin } from './audiotracks';
import { subtitlesPlugin } from './subtitles';
import { thumbnailsPlugin } from './thumbnails';
import { playlistPlugin } from './playlist';
import { hotkeysPlugin } from './hotkeys';
import { autoplayPlugin } from './autoplay';
import { memoryPlugin } from './memory';
import { mediaSessionPlugin } from './mediasession';

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

export { qualityPlugin, pickQuality } from './quality';
export { speedPlugin, DEFAULT_SPEEDS } from './speed';
export { audioTracksPlugin } from './audiotracks';
export { subtitlesPlugin } from './subtitles';
export { thumbnailsPlugin } from './thumbnails';
export { playlistPlugin, type PlaylistItem, type PlaylistState } from './playlist';
export { hotkeysPlugin, type HotkeysOptions } from './hotkeys';
export { autoplayPlugin } from './autoplay';
export { memoryPlugin, shouldRestorePosition } from './memory';
export { mediaSessionPlugin } from './mediasession';
