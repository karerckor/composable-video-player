import type { CommandContext, CommandRegistry, EventBus, Logger, Player, PlayerOptions, PlayerState, Store } from '../types.js';

export interface ApiContext {
  player: Player;
  store: Store<PlayerState>;
  commands: CommandRegistry;
  events: EventBus;
  options: PlayerOptions;
  log: Logger;
}

type ApiHandler = (arg: unknown) => unknown;
const API: CommandContext = { source: 'api' };
const NONE = Symbol('none');

const isRelative = (v: unknown) => typeof v === 'string' && /^[+-]/.test(v.trim());
const toNumber = (v: unknown) => (typeof v === 'number' ? v : Number(v));
const flag = (v: unknown) => v === true || v === 1 || v === '1' || v === 'true' || v === 'on';
const bit = (v: unknown) => (v ? 1 : 0);
const SUBTITLE_RE = /^\[([^\]]*)\](.+)$/;

export function createApi(ctx: ApiContext): (cmd: string, arg?: unknown) => unknown {
  const { store, commands, events, log, player } = ctx;
  const state = () => store.get() as PlayerState & Record<string, unknown>;

  /** Runs any command by name (plugin commands are not known to the type system here). */
  const run = (name: string, ...args: unknown[]): unknown => {
    if (!commands.has(name)) {
      log.warn(`api: command "${name}" is not available`);
      return undefined;
    }
    const result = (commands.run as unknown as (n: string, a: unknown[], c: CommandContext) => unknown)(name, args, API);
    if (result instanceof Promise) result.catch((e) => log.warn(`api: "${name}" rejected`, e));
    return undefined;
  };

  /**
   * Spec §3.4: run `load`, then play on the first `metadata` that follows the load's own `new`.
   * Listeners are registered *before* loading and count `new` events, so a load that a before-hook
   * intercepts (the playlist plugin loads its first item asynchronously) still plays. Cancelled by a
   * second `new` (another load), an `error`, or a `loaderror` before any `new` (e.g. a broken playlist).
   */
  const loadThenPlay = (load: () => void) => {
    let loads = 0;
    const offs: Array<() => void> = [];
    const cleanup = () => offs.forEach((off) => off());
    offs.push(
      events.on('new', () => {
        if (++loads > 1) cleanup();
      }),
      events.on('metadata', () => {
        if (loads === 0) return;
        cleanup();
        run('play');
      }),
      events.on('error', cleanup),
      events.on('loaderror', () => {
        if (loads === 0) cleanup();
      }),
    );
    load();
  };

  // getter when arg is NONE, setter/action otherwise
  const table: Record<string, (arg: unknown) => unknown> = {
    play: (arg) => {
      if (arg === NONE) return run('play');
      if (typeof arg === 'string' && arg.startsWith('id:')) return run('playItem', arg.slice(3), true);
      loadThenPlay(() => run('load', arg));
      return undefined;
    },
    pause: () => run('pause'),
    toggle: () => run('toggle'),
    stop: () => run('stop'),
    seek: (arg) => (arg === NONE ? undefined : run('seek', isRelative(arg) ? String(arg).trim() : toNumber(arg))),
    time: () => state().currentTime,
    duration: () => state().duration,
    buffered: () => state().buffered,
    playing: () => state().status === 'playing',
    started: () => state().started,
    live: () => state().live,
    muted: () => state().muted,
    isfullscreen: () => state().fullscreen,
    volume: (arg) => (arg === NONE ? state().volume : run('setVolume', isRelative(arg) ? String(arg).trim() : toNumber(arg))),
    mute: () => run('mute'),
    unmute: () => run('unmute'),
    fullscreen: () => run('fullscreen'),
    exitfullscreen: () => run('exitFullscreen'),
    quality: (arg) => (arg === NONE ? state().qualities[state().quality]?.label : run('setQuality', toNumber(arg))),
    qualities: () => state().qualities.map((q) => q.label),
    audiotrack: (arg) => {
      if (arg === NONE) return state().audioTracks[state().audioTrack]?.label;
      const byLabel = state().audioTracks.findIndex((t) => t.label === arg);
      return run('setAudioTrack', byLabel >= 0 ? byLabel : toNumber(arg));
    },
    audiotracks: () => state().audioTracks.map((t) => t.label),
    speed: (arg) => (arg === NONE ? state().rate : run('setSpeedIndex', toNumber(arg))),
    subtitle: (arg) => {
      if (arg === NONE) return state().textTracks[state().textTrack]?.label ?? 'off';
      const m = typeof arg === 'string' ? arg.match(SUBTITLE_RE) : null;
      if (m) return run('addSubtitle', m[1], m[2], true);
      if (arg === 'off') return run('setTextTrack', -1);
      const byLabel = state().textTracks.findIndex((t) => t.label === arg);
      return run('setTextTrack', byLabel >= 0 ? byLabel : toNumber(arg));
    },
    subtitles: () => state().textTracks.map((t) => t.label),
    '+subtitle': (arg) => {
      const m = typeof arg === 'string' ? arg.match(SUBTITLE_RE) : null;
      return m ? run('addSubtitle', m[1], m[2], false) : undefined;
    },
    togglesubs: () => run('toggleSubtitles'),
    file: (arg) => (arg === NONE ? state().url : run('load', arg)),
    preload: (arg) => {
      if (arg === NONE) return undefined;
      player.video.preload = 'auto';
      return run('load', arg);
    },
    playlist: (arg) => (arg === NONE ? (state().playlist as { items?: unknown } | undefined)?.items : run('setPlaylist', arg)),
    next: () => run('next'),
    prev: () => run('prev'),
    find: (arg) => (arg === NONE ? undefined : run('playItem', String(arg), false)),
    push: (arg) => (arg === NONE ? undefined : run('push', arg)),
    autonext: (arg) => (arg === NONE ? bit(state().autonext) : run('setAutonext', flag(arg))),
    playlistloop: (arg) => (arg === NONE ? bit(state().playlistLoop) : run('setPlaylistLoop', flag(arg))),
    loop: (arg) => (arg === NONE ? bit(state().loop) : run('setLoop', flag(arg))),
    title: (arg) => (arg === NONE ? state().title : run('setTitle', String(arg))),
    poster: (arg) => (arg === NONE ? state().poster : run('setPoster', String(arg))),
    thumbnails: (arg) => (arg === NONE ? undefined : run('setThumbnails', String(arg))),
    toolbar: (arg) => (arg === NONE ? run('showControls') : run('setControlsLocked', arg === 'on' || arg === 1 || arg === true)),
    menu: () => run('toggleMenu'),
    cuid: (arg) => (arg === NONE ? state().cuid : run('setCuid', String(arg))),
    id: () => player.id,
    destroy: () => run('destroy'),
  };

  return (cmd, arg = NONE) => {
    const handler: ApiHandler | undefined = Object.prototype.hasOwnProperty.call(table, cmd) ? table[cmd] : undefined;
    if (!handler) {
      log.warn(`api: unknown command "${cmd}"`);
      return undefined;
    }
    return handler(arg);
  };
}
