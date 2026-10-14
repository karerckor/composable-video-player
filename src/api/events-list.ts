import type { EventName } from '../types';

/** Events forwarded to PlayerJS-style listeners (internal `ui:*` events are excluded). */
export const PLAYERJS_EVENTS: readonly EventName[] = [
  'init', 'start', 'new', 'metadata', 'play', 'userplay', 'pause', 'userpause', 'stop', 'end', 'finish',
  'time', 'quartile', 'duration', 'seek', 'userseek', 'mute', 'unmute', 'volume', 'quality', 'audiotrack',
  'subtitle', 'speed', 'fullscreen', 'exitfullscreen', 'resize', 'ui', 'buffering', 'buffered', 'loaderror',
  'error', 'playlist', 'next', 'previous', 'line', 'destroy',
];
