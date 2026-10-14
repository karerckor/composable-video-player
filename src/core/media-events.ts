import type { PlayerError } from '../types';
import type { MediaDeps } from './media-deps';
import { mediaErrorToPlayerError } from '../shared/errors';

export interface MediaEventHooks {
  onMediaError(err: PlayerError): void;
}

const QUARTILES = [25, 50, 75] as const;

function bufferedEnd(video: HTMLVideoElement): number {
  const ranges = video.buffered;
  const t = video.currentTime;
  for (let i = 0; i < ranges.length; i++) {
    if (ranges.start(i) <= t + 0.5 && t <= ranges.end(i)) return ranges.end(i);
  }
  return 0;
}

export function bindMediaEvents(d: MediaDeps, hooks: MediaEventHooks): () => void {
  const { video, store, events, options } = d;
  const offs: Array<() => void> = [];
  const quartiles = new Set<number>();
  /** The `end` option fired for this source; re-armed by `new` or a seek before the end point. */
  let endReached = false;
  /** Swallow the `pause` event caused by our own pause() at the end point. */
  let suppressPause = false;

  const endAt = () => {
    const duration = video.duration;
    if (options.end === undefined || !Number.isFinite(duration) || duration <= 0) return Infinity;
    return options.end > 0 ? options.end : duration + options.end;
  };

  const on = (type: string, fn: () => void) => {
    video.addEventListener(type, fn);
    offs.push(() => video.removeEventListener(type, fn));
  };

  const finish = () => {
    if (!quartiles.has(100)) {
      quartiles.add(100);
      events.emit('quartile', 100);
    }
    store.set({ status: 'ended' });
    events.emit('end');
    events.emit('finish');
  };

  const unwait = () => {
    if (!store.get().waiting) return;
    store.set({ waiting: false });
    events.emit('buffered');
  };

  offs.push(
    events.on('new', () => {
      quartiles.clear();
      endReached = false;
      suppressPause = false;
    }),
  );

  on('durationchange', () => {
    const duration = video.duration;
    store.set({ duration: Number.isFinite(duration) ? duration : 0, live: duration === Infinity });
    if (Number.isFinite(duration)) events.emit('duration', duration);
  });

  on('play', () => {
    store.set({ status: 'playing' });
    events.emit('play');
  });

  on('playing', () => {
    store.set({ status: 'playing' });
    unwait();
    if (!store.get().started) {
      store.set({ started: true });
      events.emit('start');
    }
  });

  on('pause', () => {
    if (suppressPause) {
      suppressPause = false;
      return;
    }
    const status = store.get().status;
    if (video.ended || status === 'error' || status === 'loading') return;
    store.set({ status: 'paused' });
    events.emit('pause');
  });

  on('waiting', () => {
    if (store.get().waiting) return;
    store.set({ waiting: true });
    events.emit('buffering');
  });

  on('canplay', unwait);

  on('seeked', () => {
    unwait();
    const t = video.currentTime;
    if (t < endAt()) endReached = false;
    const duration = video.duration;
    if (store.get().status === 'ended' && t < Math.min(endAt(), Number.isFinite(duration) ? duration : Infinity)) {
      store.set({ status: 'paused' });
    }
    events.emit('seek', video.currentTime);
  });

  on('timeupdate', () => {
    const t = video.currentTime;
    store.set({ currentTime: t, buffered: bufferedEnd(video) });
    events.emit('time', t);

    const duration = video.duration;
    if (Number.isFinite(duration) && duration > 0) {
      const pct = (t / duration) * 100;
      for (const q of QUARTILES) {
        if (pct >= q && !quartiles.has(q)) {
          quartiles.add(q);
          events.emit('quartile', q);
        }
      }
      if (!endReached && t >= endAt()) {
        endReached = true;
        if (!video.paused) {
          suppressPause = true;
          video.pause();
        }
        finish();
      }
    }
  });

  on('progress', () => store.set({ buffered: bufferedEnd(video) }));

  on('volumechange', () => {
    const prev = store.get();
    store.set({ volume: video.volume, muted: video.muted });
    if (prev.volume !== video.volume) events.emit('volume', video.volume);
    if (prev.muted !== video.muted) events.emit(video.muted ? 'mute' : 'unmute');
  });

  on('ratechange', () => {
    if (store.get().rate === video.playbackRate) return;
    store.set({ rate: video.playbackRate });
    events.emit('speed', video.playbackRate);
  });

  on('ended', () => {
    if (!endReached) finish();
    else store.set({ status: 'ended' });
  });

  on('error', () => hooks.onMediaError(mediaErrorToPlayerError(video.error)));

  return () => offs.forEach((off) => off());
}
