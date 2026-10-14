import { vi } from 'vitest';

export interface FakeMedia {
  fire(type: string): void;
  setDuration(d: number): void;
  /** Sets currentTime without seeking and fires timeupdate (normal playback progress). */
  timeTo(t: number): void;
  end(): void;
  setBuffered(end: number): void;
  rejectNextPlay(err: unknown): void;
  setError(code: number): void;
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
}

export function installFakeMedia(video: HTMLVideoElement): FakeMedia {
  let paused = true;
  let ended = false;
  let currentTime = 0;
  let duration = NaN;
  // Start from the element's current values (the player may have synced options onto it already).
  let volume = typeof video.volume === 'number' ? video.volume : 1;
  let muted = video.muted === true;
  let rate = video.playbackRate || 1;
  let defaultRate = video.defaultPlaybackRate || 1;
  let bufferedEnd = 0;
  let error: MediaError | null = null;
  let nextPlayError: unknown = null;

  const fire = (type: string) => video.dispatchEvent(new Event(type));
  const def = (name: string, get: () => unknown, set?: (v: any) => void) =>
    Object.defineProperty(video, name, { configurable: true, get, set });

  def('paused', () => paused);
  def('ended', () => ended);
  def('currentTime', () => currentTime, (v: number) => {
    currentTime = v;
    if (v < duration) ended = false;
    fire('seeking');
    fire('seeked');
    fire('timeupdate');
  });
  def('duration', () => duration);
  def('volume', () => volume, (v: number) => {
    volume = v;
    fire('volumechange');
  });
  def('muted', () => muted, (v: boolean) => {
    muted = !!v;
    fire('volumechange');
  });
  def('playbackRate', () => rate, (v: number) => {
    rate = v;
    fire('ratechange');
  });
  def('defaultPlaybackRate', () => defaultRate, (v: number) => {
    defaultRate = v;
  });
  def('buffered', () => ({ length: bufferedEnd > 0 ? 1 : 0, start: () => 0, end: () => bufferedEnd }));
  def('error', () => error);

  const play = vi.fn(() => {
    if (nextPlayError) {
      const e = nextPlayError;
      nextPlayError = null;
      return Promise.reject(e);
    }
    paused = false;
    ended = false;
    fire('play');
    fire('playing');
    return Promise.resolve();
  });
  const pause = vi.fn(() => {
    if (paused) return;
    paused = true;
    fire('pause');
  });
  video.play = play as unknown as HTMLVideoElement['play'];
  video.pause = pause as unknown as HTMLVideoElement['pause'];
  video.load = vi.fn() as unknown as HTMLVideoElement['load'];

  return {
    fire,
    setDuration(d) {
      duration = d;
      fire('durationchange');
    },
    timeTo(t) {
      currentTime = t;
      fire('timeupdate');
    },
    end() {
      paused = true;
      ended = true;
      fire('pause');
      fire('ended');
    },
    setBuffered(end) {
      bufferedEnd = end;
      fire('progress');
    },
    rejectNextPlay(err) {
      nextPlayError = err;
    },
    setError(code) {
      error = { code, message: 'fake' } as MediaError;
      fire('error');
    },
    play,
    pause,
  };
}
