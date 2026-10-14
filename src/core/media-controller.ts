import type { MediaProvider, PlayerError, ProviderContext, Selection, SourceInput, SourceSpec } from '../types';
import type { MediaDeps } from './media-deps';
import { isPlaylistInput, isSourceSpecInput, normalizeSpec, parseSource } from '../source/parse';
import { toPlayerError } from '../shared/errors';
import { clamp } from '../shared/clamp';
import { bindMediaEvents } from './media-events';
import { registerMediaCommands } from './media-commands';

export interface MediaController {
  readonly provider: MediaProvider | null;
  destroy(): void;
}

export function createMediaController(d: MediaDeps): MediaController {
  const { video, store, events, commands, log, options } = d;

  let spec: SourceSpec | null = null;
  let selection: Selection = { quality: 0, audio: 0, start: 0 };
  let lastInput: SourceInput | null = null;
  let provider: MediaProvider | null = null;
  let providerQualities = false;
  let providerAudio = false;
  let token = 0;
  let attempt = 0;
  let chain: string[] = [];
  let chainIndex = 0;
  let retriesUsed = 0;
  let pending = false;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let reloadStart: number | undefined;

  // Sync initial options/state onto the element.
  const initial = store.get();
  video.volume = initial.volume;
  video.muted = initial.muted;
  video.loop = initial.loop;
  video.defaultPlaybackRate = initial.rate;
  video.playbackRate = initial.rate;
  if (initial.poster) video.poster = initial.poster;

  const currentTracks = () => spec?.qualities[selection.quality]?.tracks ?? [];

  const reloadOptions = () => options.reload ?? { retries: store.get().live ? 3 : 0, delay: 2000 };

  const playSafe = () => {
    const p = commands.run('play', []);
    if (p) p.catch((e) => log.warn('play() was rejected', e));
  };

  const contextFor = (owner: MediaProvider): ProviderContext => ({
    setQualities(list, current) {
      if (provider !== owner || (spec && spec.qualities.length > 1)) return;
      providerQualities = true;
      store.set({ qualities: list, quality: clamp(current, 0, Math.max(0, list.length - 1)) });
    },
    setAudioTracks(list, current) {
      if (provider !== owner || currentTracks().length > 1) return;
      providerAudio = true;
      store.set({ audioTracks: list, audioTrack: clamp(current, 0, Math.max(0, list.length - 1)) });
    },
    error(err) {
      if (provider === owner) fail(token, attempt, store.get().url, err, video.currentTime, !video.paused);
    },
    log,
    options,
  });

  const pickProvider = (url: string, s: SourceSpec): MediaProvider | null => {
    let best: MediaProvider | null = null;
    let score = 0;
    for (const p of d.providers) {
      const value = p.canPlay(url, s);
      if (value > score) {
        best = p;
        score = value;
      }
    }
    return best;
  };

  const setError = (error: PlayerError) => {
    store.set({ status: 'error', error });
    events.emit('error', error);
  };

  const fail = (t: number, a: number, url: string, error: PlayerError, time: number, resume: boolean) => {
    if (t !== token || a !== attempt) return;
    attempt++;
    pending = false;
    events.emit('loaderror', { url, error });
    if (chainIndex < chain.length - 1) {
      chainIndex++;
      tryUrl(t, time, resume);
      return;
    }
    const { retries, delay } = reloadOptions();
    if (retriesUsed < retries) {
      retriesUsed++;
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => {
        if (t === token) tryUrl(t, time, resume);
      }, delay);
      return;
    }
    setError(error);
  };

  const tryUrl = (t: number, time: number, resume: boolean) => {
    const url = chain[chainIndex]!;
    const next = spec ? pickProvider(url, spec) : null;
    if (!next) {
      fail(t, attempt, url, { kind: 'unsupported', message: `No provider can play ${url}` }, time, resume);
      return;
    }
    if (next !== provider) {
      provider?.detach();
      provider = next;
      providerQualities = false;
      providerAudio = false;
      next.attach(video, contextFor(next));
    }
    store.set({ url });
    pending = true;
    const a = ++attempt;
    let loading: Promise<void>;
    try {
      loading = next.load(url, time);
    } catch (e) {
      loading = Promise.reject(e);
    }
    loading.then(
      () => {
        if (t !== token || a !== attempt) return;
        pending = false;
        retriesUsed = 0;
        if (store.get().status === 'loading') store.set({ status: 'ready' });
        events.emit('metadata', { duration: video.duration });
        if (resume) playSafe();
      },
      (err) => fail(t, a, url, toPlayerError(err), time, resume),
    );
  };

  const startChain = (time: number, resume: boolean) => {
    clearTimeout(retryTimer);
    token++;
    chain = currentTracks()[selection.audio]?.urls ?? [];
    chainIndex = 0;
    retriesUsed = 0;
    if (!chain.length) {
      setError({ kind: 'unsupported', message: 'Source has no urls' });
      return;
    }
    tryUrl(token, time, resume);
  };

  const switchSource = () => {
    const time = pending ? selection.start : video.currentTime;
    store.set({ status: 'loading', error: null });
    startChain(time, !video.paused);
  };

  const rejectInput = (input: SourceInput, message: string) => {
    token++;
    const error: PlayerError = { kind: 'unsupported', message };
    log.error(message);
    events.emit('loaderror', { url: typeof input === 'string' ? input : '', error });
    setError(error);
  };

  const offs: Array<() => void> = [
    bindMediaEvents(d, {
      onMediaError(err) {
        if (pending || !chain.length || store.get().status === 'error') return;
        fail(token, attempt, store.get().url, err, video.currentTime, !video.paused);
      },
    }),
    registerMediaCommands(d),

    commands.register('load', ([input]) => {
      // Rejected input must not replace `lastInput`: reload keeps replaying the last good source.
      if (isPlaylistInput(input)) {
        rejectInput(input, 'Playlist input requires the playlist plugin');
        return;
      }
      if (typeof input !== 'string' && !isSourceSpecInput(input)) {
        rejectInput(input, 'Invalid source: expected a string or an object with a qualities array');
        return;
      }
      const parsed =
        typeof input === 'string'
          ? { ...parseSource(input, { qualities: options.qualities, random: d.random }), ...(options.forceType ? { forceType: options.forceType } : {}) }
          : normalizeSpec(input, options.forceType);
      if (!parsed.qualities.length) {
        rejectInput(input, 'Source is empty');
        return;
      }
      lastInput = input;

      let sel: Selection = { quality: parsed.qualities.length - 1, audio: 0, start: parsed.start ?? options.start ?? 0 };
      for (const transform of [...d.transforms]) {
        try {
          sel = { ...transform(parsed, sel) };
        } catch (e) {
          log.error('source transform failed', e);
        }
      }
      if (reloadStart !== undefined) {
        sel.start = reloadStart;
        reloadStart = undefined;
      }
      sel.quality = clamp(Math.round(sel.quality) || 0, 0, parsed.qualities.length - 1);
      const tracks = parsed.qualities[sel.quality]!.tracks;
      sel.audio = clamp(Math.round(sel.audio) || 0, 0, tracks.length - 1);
      sel.start = Math.max(0, Number(sel.start) || 0);

      spec = parsed;
      selection = sel;
      providerQualities = false;
      providerAudio = false;
      store.set({
        status: 'loading',
        started: false,
        currentTime: 0,
        duration: 0,
        buffered: 0,
        live: false,
        waiting: false,
        error: null,
        url: '',
        qualities: parsed.qualities.map((q) => ({ label: q.label })),
        quality: sel.quality,
        audioTracks: tracks.map((t) => ({ label: t.label })),
        audioTrack: sel.audio,
      });
      events.emit('new', { spec: parsed, selection: sel });
      startChain(sel.start, false);
    }),

    commands.register('reload', () => {
      if (lastInput === null) return;
      reloadStart = store.get().currentTime || video.currentTime || 0;
      commands.run('load', [lastInput]);
      reloadStart = undefined; // consumed by load, or discarded if a before-hook cancelled it
    }),

    commands.register('setQuality', ([i]) => {
      const s = store.get();
      if (!Number.isInteger(i) || i < 0 || i >= s.qualities.length || i === s.quality) return;
      const label = s.qualities[i]!.label;
      if (providerQualities) {
        provider?.setQuality?.(i);
        store.set({ quality: i });
        events.emit('quality', label);
        return;
      }
      if (!spec) return;
      const currentAudio = s.audioTracks[s.audioTrack]?.label;
      const tracks = spec.qualities[i]!.tracks;
      const audio = Math.max(0, tracks.findIndex((t) => t.label === currentAudio));
      selection = { ...selection, quality: i, audio };
      providerAudio = false;
      store.set({ quality: i, audioTracks: tracks.map((t) => ({ label: t.label })), audioTrack: audio });
      switchSource();
      events.emit('quality', label);
    }),

    commands.register('setAudioTrack', ([i]) => {
      const s = store.get();
      if (!Number.isInteger(i) || i < 0 || i >= s.audioTracks.length || i === s.audioTrack) return;
      const label = s.audioTracks[i]!.label;
      if (providerAudio) {
        provider?.setAudioTrack?.(i);
        store.set({ audioTrack: i });
        events.emit('audiotrack', label);
        return;
      }
      if (!spec) return;
      selection = { ...selection, audio: i };
      store.set({ audioTrack: i });
      switchSource();
      events.emit('audiotrack', label);
    }),
  ];

  return {
    get provider() {
      return provider;
    },
    destroy() {
      clearTimeout(retryTimer);
      token++;
      offs.forEach((off) => off());
      provider?.detach();
      provider = null;
    },
  };
}
