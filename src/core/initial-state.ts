import type { PlayerOptions, PlayerState } from '../types.js';
import { clamp } from '../shared/clamp.js';

export function createInitialState(o: PlayerOptions): PlayerState {
  return {
    status: 'idle',
    started: false,
    currentTime: 0,
    duration: 0,
    buffered: 0,
    live: false,
    waiting: false,
    volume: clamp(o.volume ?? 1, 0, 1),
    muted: !!o.muted,
    rate: o.rate ?? 1,
    fullscreen: false,
    userActive: false,
    controlsLocked: false,
    width: 0,
    height: 0,
    url: '',
    qualities: [],
    quality: 0,
    audioTracks: [],
    audioTrack: 0,
    textTracks: [],
    textTrack: -1,
    preferredSubtitle: null,
    title: o.title ?? '',
    poster: o.poster ?? '',
    loop: !!o.loop,
    error: null,
  };
}
