## Chunk 5: API map, composition root and first demo

Delivers: `PLAYERJS_EVENTS`, the PlayerJS command table `createApi` (used by `player.api()` and `api:` actions), the composition root `createPlayer`, the public `index.ts`, and a first runnable demo page.

Spec references: §2.1, §3.6, §6.2 (layers), §6.8 (theme, ratio), §8.2, §8.3 (events list).

Deviation: `ApiContext` also carries `events` (for the "play after load" rule, spec §3.4) and `log` (for warnings), in addition to `player, store, commands, options`.

### Task 5.1: PlayerJS events list and API map

**Files:**
- Create: `src/api/events-list.ts`, `src/api/api-map.ts`
- Test: `tests/api/api-map.test.ts`

`createApi` calls only commands (through `commands.run(name, args, { source: 'api' })`) and reads only state. Commands owned by plugins (`playItem`, `addSubtitle`, `setSpeedIndex`, …) are looked up by name at call time; when absent, the call warns and returns `undefined`.

- [ ] **Step 1: Write the failing test `tests/api/api-map.test.ts`**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApi } from '../../src/api/api-map';
import { PLAYERJS_EVENTS } from '../../src/api/events-list';
import { createStore } from '../../src/core/store';
import { createEventBus } from '../../src/core/events';
import { createCommandRegistry } from '../../src/core/commands';
import { createLogger } from '../../src/core/logger';
import { createInitialState } from '../../src/core/initial-state';
import type { CommandRegistry, EventBus, Player, PlayerState, Store } from '../../src/types';

let store: Store<PlayerState>;
let commands: CommandRegistry;
let events: EventBus;
let calls: Array<[string, unknown[], string]>;
let api: (cmd: string, arg?: unknown) => unknown;
const video = document.createElement('video');

const register = (...names: string[]) => {
  for (const name of names) {
    (commands.register as (n: string, h: (a: unknown[], c: { source: string }) => unknown) => void)(name, (args, ctx) => {
      calls.push([name, args, ctx.source]);
      return name === 'play' ? Promise.resolve() : undefined;
    });
  }
};

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const log = createLogger(false);
  store = createStore({
    ...createInitialState({ container: 'x' }),
    currentTime: 12,
    duration: 60,
    qualities: [{ label: '360p' }, { label: '720p' }],
    quality: 1,
    audioTracks: [{ label: 'En' }, { label: 'Ru' }],
    textTracks: [{ label: 'English' }],
    textTrack: -1,
    url: 'v.mp4',
  });
  events = createEventBus(log);
  commands = createCommandRegistry(log);
  calls = [];
  const player = { id: 'pl', video } as unknown as Player;
  api = createApi({ player, store, commands, events, options: { container: 'x' }, log });
});

describe('createApi getters', () => {
  it('reads state', () => {
    store.set({ status: 'playing', started: true, muted: true, fullscreen: true, volume: 0.4 });
    expect(api('time')).toBe(12);
    expect(api('duration')).toBe(60);
    expect(api('playing')).toBe(true);
    expect(api('started')).toBe(true);
    expect(api('muted')).toBe(true);
    expect(api('isfullscreen')).toBe(true);
    expect(api('volume')).toBe(0.4);
    expect(api('quality')).toBe('720p');
    expect(api('qualities')).toEqual(['360p', '720p']);
    expect(api('audiotrack')).toBe('En');
    expect(api('audiotracks')).toEqual(['En', 'Ru']);
    expect(api('subtitle')).toBe('off');
    expect(api('subtitles')).toEqual(['English']);
    expect(api('file')).toBe('v.mp4');
    expect(api('id')).toBe('pl');
    expect(api('loop')).toBe(0);
  });
});

describe('createApi commands', () => {
  it('maps playback commands with api source', () => {
    register('play', 'pause', 'toggle', 'stop', 'seek', 'setVolume', 'mute', 'unmute', 'fullscreen', 'exitFullscreen', 'destroy');
    api('play');
    api('pause');
    api('toggle');
    api('stop');
    api('seek', '+10');
    api('seek', '30');
    api('volume', '0.5');
    api('volume', '-0.1');
    api('mute');
    api('unmute');
    api('fullscreen');
    api('exitfullscreen');
    api('destroy');
    expect(calls).toEqual([
      ['play', [], 'api'],
      ['pause', [], 'api'],
      ['toggle', [], 'api'],
      ['stop', [], 'api'],
      ['seek', ['+10'], 'api'],
      ['seek', [30], 'api'],
      ['setVolume', [0.5], 'api'],
      ['setVolume', ['-0.1'], 'api'],
      ['mute', [], 'api'],
      ['unmute', [], 'api'],
      ['fullscreen', [], 'api'],
      ['exitFullscreen', [], 'api'],
      ['destroy', [], 'api'],
    ]);
  });

  const NEW = { spec: { qualities: [], subtitles: [] }, selection: { quality: 0, audio: 0, start: 0 } };

  it('play with a url loads, then plays on the first metadata after its new', () => {
    register('load', 'play');
    api('play', 'other.mp4');
    expect(calls).toEqual([['load', ['other.mp4'], 'api']]);
    events.emit('metadata', { duration: 10 }); // stale metadata before the load's `new`: ignored
    expect(calls).toHaveLength(1);
    events.emit('new', NEW);
    events.emit('metadata', { duration: 10 });
    expect(calls[1]).toEqual(['play', [], 'api']);
    events.emit('new', NEW);
    events.emit('metadata', { duration: 10 });
    expect(calls).toHaveLength(2);
  });

  it('cancels a pending play on another load, an error, or a loaderror before any new', () => {
    register('load', 'play');
    api('play', 'a.mp4');
    events.emit('new', NEW);
    events.emit('new', NEW); // a different load started
    events.emit('metadata', { duration: 10 });
    api('play', 'b.mp4');
    events.emit('error', { kind: 'network', message: 'x' });
    events.emit('new', NEW);
    events.emit('metadata', { duration: 10 });
    api('play', 'broken.json');
    events.emit('loaderror', { url: 'broken.json', error: { kind: 'network', message: 'x' } });
    events.emit('new', NEW);
    events.emit('metadata', { duration: 10 });
    expect(calls.map(([n]) => n)).toEqual(['load', 'load', 'load']);
  });

  it('play with id: and find use playItem', () => {
    register('playItem');
    api('play', 'id:s2');
    api('find', 's3');
    expect(calls).toEqual([
      ['playItem', ['s2', true], 'api'],
      ['playItem', ['s3', false], 'api'],
    ]);
  });

  it('maps tracks, speed and subtitles', () => {
    register('setQuality', 'setAudioTrack', 'setSpeedIndex', 'setTextTrack', 'addSubtitle', 'toggleSubtitles');
    api('quality', '0');
    api('audiotrack', 'Ru');
    api('audiotrack', 0);
    api('speed', 2);
    api('subtitle', -1);
    api('subtitle', 'off');
    api('subtitle', 'English');
    api('subtitle', '0');
    api('subtitle', '[Es]es.vtt');
    api('+subtitle', '[De]de.vtt');
    api('togglesubs');
    expect(calls).toEqual([
      ['setQuality', [0], 'api'],
      ['setAudioTrack', [1], 'api'],
      ['setAudioTrack', [0], 'api'],
      ['setSpeedIndex', [2], 'api'],
      ['setTextTrack', [-1], 'api'],
      ['setTextTrack', [-1], 'api'],
      ['setTextTrack', [0], 'api'],
      ['setTextTrack', [0], 'api'],
      ['addSubtitle', ['Es', 'es.vtt', true], 'api'],
      ['addSubtitle', ['De', 'de.vtt', false], 'api'],
      ['toggleSubtitles', [], 'api'],
    ]);
  });

  it('maps playlist, display and misc commands', () => {
    register('load', 'setPlaylist', 'next', 'prev', 'push', 'setAutonext', 'setPlaylistLoop', 'setLoop', 'setTitle', 'setPoster', 'setThumbnails', 'showControls', 'setControlsLocked', 'toggleMenu', 'setCuid');
    api('file', 'a.mp4');
    api('playlist', '[{"title":"a","file":"a.mp4"}]');
    api('next');
    api('prev');
    api('push', [{ title: 'b', file: 'b.mp4' }]);
    api('autonext', 0);
    api('playlistloop', '1');
    api('loop', 1);
    api('title', 'T');
    api('poster', 'p.jpg');
    api('thumbnails', 't.vtt');
    api('toolbar');
    api('toolbar', 'on');
    api('toolbar', 'off');
    api('menu');
    api('cuid', 'v1');
    expect(calls.map(([n, a]) => [n, a])).toEqual([
      ['load', ['a.mp4']],
      ['setPlaylist', ['[{"title":"a","file":"a.mp4"}]']],
      ['next', []],
      ['prev', []],
      ['push', [[{ title: 'b', file: 'b.mp4' }]]],
      ['setAutonext', [false]],
      ['setPlaylistLoop', [true]],
      ['setLoop', [true]],
      ['setTitle', ['T']],
      ['setPoster', ['p.jpg']],
      ['setThumbnails', ['t.vtt']],
      ['showControls', []],
      ['setControlsLocked', [true]],
      ['setControlsLocked', [false]],
      ['toggleMenu', []],
      ['setCuid', ['v1']],
    ]);
  });

  it('preload loads and sets preload=auto', () => {
    register('load');
    api('preload', 'a.mp4');
    expect(video.preload).toBe('auto');
    expect(calls).toEqual([['load', ['a.mp4'], 'api']]);
  });

  it('warns on unknown commands and missing plugin commands', () => {
    expect(api('nope')).toBeUndefined();
    expect(api('next')).toBeUndefined();
    expect(console.warn).toHaveBeenCalledTimes(2);
  });

  it('swallows play rejections from the api', async () => {
    (commands.register as any)('play', () => Promise.reject(new Error('blocked')));
    api('play');
    await Promise.resolve();
    await Promise.resolve();
    expect(console.warn).toHaveBeenCalled();
  });
});

describe('PLAYERJS_EVENTS', () => {
  it('contains public events only', () => {
    expect(PLAYERJS_EVENTS).toContain('time');
    expect(PLAYERJS_EVENTS).toContain('userseek');
    expect(PLAYERJS_EVENTS.some((e) => e.startsWith('ui:'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/api/api-map.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `src/api/events-list.ts`**

```ts
import type { EventName } from '../types';

/** Events forwarded to PlayerJS-style listeners (internal `ui:*` events are excluded). */
export const PLAYERJS_EVENTS: readonly EventName[] = [
  'init', 'start', 'new', 'metadata', 'play', 'userplay', 'pause', 'userpause', 'stop', 'end', 'finish',
  'time', 'quartile', 'duration', 'seek', 'userseek', 'mute', 'unmute', 'volume', 'quality', 'audiotrack',
  'subtitle', 'speed', 'fullscreen', 'exitfullscreen', 'resize', 'ui', 'buffering', 'buffered', 'loaderror',
  'error', 'playlist', 'next', 'previous', 'line', 'destroy',
];
```

- [ ] **Step 4: Implement `src/api/api-map.ts`**

```ts
import type { CommandContext, CommandRegistry, EventBus, Logger, Player, PlayerOptions, PlayerState, Store } from '../types';

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
      const value = String(arg);
      if (value.startsWith('id:')) return run('playItem', value.slice(3), true);
      loadThenPlay(() => run('load', value));
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
```

Note: `api(cmd)` and `api(cmd, undefined)` are both getters (default parameter replaces `undefined` with `NONE`).

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/api/api-map.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/api tests/api
git commit -m "feat(api): add PlayerJS command map and public events list"
```

### Task 5.2: Composition root `createPlayer`

**Files:**
- Create: `src/player.ts`
- Test: `tests/player.test.ts`

Implements spec §2.1 steps 1–9 and §3.6 `destroy`. Until chunk 7 adds `defaultPlugins()`, `plugins` defaults to `[]`; until chunk 8 adds the hls provider, only `html5Provider` is built in.

- [ ] **Step 1: Write the failing test `tests/player.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPlayer } from '../src/player';
import { installFakeMedia } from './helpers/fake-media';
import { fakeProvider } from './helpers/fake-provider';
import { flush } from './helpers/flush';
import { h } from '../src/ui/dom';
import type { EventName, Player, Plugin } from '../src/types';

let host: HTMLElement;
let player: Player | null;

const fakeProviderPlugin = (fp = fakeProvider()): Plugin => ({ name: 'fake-provider', setup: (ctx) => ctx.registerProvider(fp.provider) });

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  document.head.querySelector('#vp-styles')?.remove();
  document.body.replaceChildren();
  host = document.createElement('div');
  host.id = 'player';
  document.body.append(host);
  player = null;
});
afterEach(() => player?.destroy());

describe('createPlayer', () => {
  it('builds the DOM skeleton and injects styles once', () => {
    player = createPlayer({ container: 'player' });
    const second = createPlayer({ container: document.body.appendChild(document.createElement('div')) });
    expect(player.id).toBe('player');
    expect(second.id).toMatch(/^vp\d+$/);
    expect(player.container).toBe(host);
    expect(player.root.className).toBe('vp-root');
    expect(host.querySelector('.vp-media > video')).toBe(player.video);
    expect(host.querySelectorAll('.vp-ui > .vp-layer-below, .vp-ui > .vp-layout, .vp-ui > .vp-layer-above')).toHaveLength(3);
    expect(document.querySelectorAll('#vp-styles')).toHaveLength(1);
    expect(player.video.hasAttribute('playsinline')).toBe(true);
    second.destroy();
  });

  it('throws for a missing container', () => {
    expect(() => createPlayer({ container: 'missing' })).toThrow(/container/);
  });

  it('applies ratio and theme', () => {
    player = createPlayer({ container: host, ratio: '4:3', theme: { color1: '#f00', toolbarBg: 'red' } });
    expect(player.root.style.aspectRatio).toBe('4 / 3');
    expect(player.root.style.getPropertyValue('--vp-color-1')).toBe('#f00');
    expect(player.root.style.getPropertyValue('--vp-toolbar-bg')).toBe('red');
  });

  it('builds the default layout', () => {
    player = createPlayer({ container: host });
    expect(host.querySelector('.vp-layout .vp-toolbar .vp-play')).not.toBeNull();
  });

  it('emits init before new and plays through the UI', async () => {
    const events: EventName[] = [];
    const plugins: Plugin[] = [fakeProviderPlugin(), { name: 'spy', setup: (ctx) => void ctx.events.onAny((n) => events.push(n)) }];
    player = createPlayer({ container: host, plugins });
    const media = installFakeMedia(player.video);
    player.load('movie.mp4');
    await flush();
    expect(events.indexOf('init')).toBeLessThan(events.indexOf('new'));
    expect(player.state.status).toBe('ready');
    host.querySelector<HTMLButtonElement>('.vp-play')!.click();
    await flush();
    expect(media.play).toHaveBeenCalled();
    expect(player.state.status).toBe('playing');
    expect(events).toContain('userplay');
  });

  it('loads options.source after init', async () => {
    const fp = fakeProvider();
    player = createPlayer({ container: host, plugins: [fakeProviderPlugin(fp)], source: '[360p]a.mp4,[720p]b.mp4' });
    await flush();
    expect(fp.loads[0]!.url).toBe('b.mp4');
  });

  it('gives plugins components, menus, hide rules, layers and transforms', async () => {
    const fp = fakeProvider();
    const dispose = vi.fn();
    const plugin: Plugin = {
      name: 'demo',
      setup(ctx) {
        ctx.registerProvider(fp.provider);
        ctx.registerComponent('badge', () => ({ el: h('span', { class: 'badge' }, 'B') }));
        ctx.registerHideRule('never', () => ({ test: () => false }));
        ctx.registerMenu({ id: 'demo', label: 'Demo', visible: () => true, options: () => [{ label: 'x', value: 1 }], current: () => 1, select: () => {} });
        ctx.addLayer({ type: 'badge', className: 'below' }, 'below-ui');
        ctx.addLayer({ type: 'badge', className: 'above', hide: ['never'] }, 'above-ui');
        ctx.addSourceTransform((_s, sel) => ({ ...sel, start: 7 }));
        return dispose;
      },
    };
    player = createPlayer({ container: host, plugins: [plugin] });
    expect(host.querySelector('.vp-layer-below > .below')).not.toBeNull();
    expect(host.querySelector('.vp-layer-above > .above')).not.toBeNull();
    expect(host.querySelector('.vp-settings')!.classList.contains('vp-hidden')).toBe(false);
    player.load('a.mp4');
    await flush();
    expect(fp.loads[0]!.start).toBe(7);
    player.destroy();
    expect(dispose).toHaveBeenCalled();
  });

  it('rebuilds the layout with the layout command and supports layout:false', () => {
    player = createPlayer({ container: host });
    player.command('layout', { type: 'root', children: [{ type: 'play' }] });
    expect(host.querySelector('.vp-toolbar')).toBeNull();
    expect(host.querySelector('.vp-layout .vp-play')).not.toBeNull();
    const bare = createPlayer({ container: document.body.appendChild(document.createElement('div')), layout: false });
    expect(bare.root.querySelector('.vp-layout')!.childElementCount).toBe(0);
    bare.destroy();
  });

  it('exposes api(), commands and state', () => {
    player = createPlayer({ container: host, title: 'Hello' });
    installFakeMedia(player.video);
    expect(player.api('title')).toBe('Hello');
    player.api('volume', 0.3);
    expect(player.state.volume).toBe(0.3);
    player.command('setTitle', 'World');
    expect(player.api('title')).toBe('World');
    expect(player.api('id')).toBe('player');
  });

  it('toolbar on/off locks controls; showControls pokes activity', () => {
    player = createPlayer({ container: host });
    player.api('toolbar', 'on');
    expect(player.state.controlsLocked).toBe(true);
    player.api('toolbar');
    expect(player.state.userActive).toBe(true);
  });

  it('destroy cleans up and is idempotent', () => {
    const onDestroy = vi.fn();
    player = createPlayer({ container: host });
    player.on('destroy', onDestroy);
    player.destroy();
    player.destroy();
    expect(onDestroy).toHaveBeenCalledTimes(1);
    expect(host.childElementCount).toBe(0);
    expect(player.command('play')).toBeUndefined();
    expect(console.warn).toHaveBeenCalled();
    player = null;
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/player.test.ts`
Expected: FAIL — cannot resolve `../src/player`.

- [ ] **Step 3: Implement `src/player.ts`**

```ts
import type {
  CommandContext,
  ComponentFactory,
  HideRuleFactory,
  LayoutNode,
  MediaProvider,
  Player,
  PlayerOptions,
  PluginContext,
  SourceTransform,
  ThemeVars,
} from './types';
import css from './theme/player.css?inline';
import { createLogger } from './core/logger';
import { createStore } from './core/store';
import { createEventBus } from './core/events';
import { createCommandRegistry } from './core/commands';
import { createPluginHost } from './core/plugin-host';
import { createInitialState } from './core/initial-state';
import { createMediaController } from './core/media-controller';
import { html5Provider } from './providers/html5';
import { createApi } from './api/api-map';
import { h } from './ui/dom';
import { createRegistry } from './ui/registry';
import { registerBuiltinHideRules } from './ui/hide-rules';
import { createTranslator } from './ui/i18n';
import { createIconSet } from './ui/icons';
import { createMenuHost } from './ui/menu-host';
import { createActionRunner } from './ui/actions';
import { createLayoutEngine, type Mounted } from './ui/layout';
import { controlsVisible, createUserActivity } from './ui/activity';
import { defaultLayout } from './ui/default-layout';
import { registerBuiltinComponents } from './components';

const API: CommandContext = { source: 'api' };
let counter = 0;

function resolveContainer(container: HTMLElement | string): HTMLElement {
  const el = typeof container === 'string' ? document.getElementById(container) : container;
  if (!el) throw new Error(`[vp] container "${String(container)}" not found`);
  return el;
}

function injectStyles(): void {
  if (document.getElementById('vp-styles')) return;
  const style = document.createElement('style');
  style.id = 'vp-styles';
  style.textContent = css;
  document.head.append(style);
}

function parseRatio(ratio: string | undefined): string | null {
  const match = (ratio ?? '16:9').match(/^\s*(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)\s*$/);
  return match ? `${match[1]} / ${match[2]}` : null;
}

function applyTheme(root: HTMLElement, theme: Partial<ThemeVars> = {}): void {
  for (const [key, value] of Object.entries(theme)) {
    if (value === undefined) continue;
    const name = key.replace(/([A-Z])/g, '-$1').replace(/(\d+)/g, '-$1').toLowerCase();
    root.style.setProperty(`--vp-${name}`, value);
  }
}

export function createPlayer(options: PlayerOptions): Player {
  // 1. DOM skeleton
  const container = resolveContainer(options.container);
  if (!container.id) container.id = `vp${++counter}`;
  const id = container.id;
  const log = createLogger(!!options.log);
  injectStyles();

  const video = h('video', { playsinline: true, 'webkit-playsinline': true, preload: 'metadata' });
  const layerBelow = h('div', { class: 'vp-layer-below' });
  const layoutLayer = h('div', { class: 'vp-layout' });
  const layerAbove = h('div', { class: 'vp-layer-above' });
  const root = h('div', { class: 'vp-root', tabindex: 0 }, h('div', { class: 'vp-media' }, video), h('div', { class: 'vp-ui' }, layerBelow, layoutLayer, layerAbove));
  const ratio = options.ratio === 'auto' ? parseRatio('16:9') : parseRatio(options.ratio);
  if (ratio) root.style.aspectRatio = ratio;
  applyTheme(root, options.theme);
  container.replaceChildren(root);

  // 2–3. Core, media, UI registries
  const store = createStore(createInitialState(options), log);
  const events = createEventBus(log);
  const commands = createCommandRegistry(log);
  const providers: MediaProvider[] = [html5Provider()];
  const transforms: SourceTransform[] = [];
  const controller = createMediaController({ video, root, store, events, commands, log, options, providers, transforms });

  const components = createRegistry<ComponentFactory<any>>('component', log);
  registerBuiltinComponents(components);
  const hideRules = createRegistry<HideRuleFactory>('hide rule', log);
  registerBuiltinHideRules(hideRules);
  const t = createTranslator(options.lang ?? 'ru', options.i18n);
  const icon = createIconSet(options.icons);
  const menus = createMenuHost({ layer: layerAbove, store, events, t, icon, log });
  const activity = createUserActivity({ root, store, events, timeout: options.idleTimeout ?? 3000 });

  let destroyed = false;
  const alive = () => {
    if (destroyed) log.warn('player is destroyed');
    return !destroyed;
  };

  // 4. Player facade
  const player: Player = {
    id,
    container,
    root,
    video,
    get state() {
      return store.get();
    },
    play: () => (alive() ? (commands.run('play', [], API) ?? Promise.resolve()) : Promise.resolve()),
    pause: () => {
      if (alive()) commands.run('pause', [], API);
    },
    seek: (time) => {
      if (alive()) commands.run('seek', [time], API);
    },
    load: (source) => {
      if (alive()) commands.run('load', [source], API);
    },
    on: events.on,
    once: events.once,
    off: events.off,
    select: store.select,
    command: (name, ...args) => (alive() ? commands.run(name, args, API) : undefined),
    api: (cmd, arg) => (alive() ? api(cmd, arg) : undefined),
    destroy,
  };
  const api = createApi({ player, store, commands, events, options, log });
  const run = createActionRunner({ player, store, menus, log });
  const engine = createLayoutEngine({ components, hideRules, playerId: id, log, base: { player, store, events, commands, options, root, log, t, icon, menus, run } });

  // 5. Plugin context
  const layers = new Set<Mounted>();
  const pluginContext: PluginContext = {
    player,
    store,
    events,
    commands,
    options,
    video,
    root,
    log,
    t,
    registerProvider: (p) => void providers.push(p),
    addSourceTransform(fn) {
      transforms.push(fn);
      return () => {
        const i = transforms.indexOf(fn);
        if (i >= 0) transforms.splice(i, 1);
      };
    },
    registerComponent: (type, factory) => components.register(type, factory),
    registerMenu: (menu) => menus.register(menu),
    registerHideRule: (name, rule) => hideRules.register(name, rule),
    addLayer(node, position) {
      const mounted = engine.build(node, position === 'below-ui' ? layerBelow : layerAbove);
      if (!mounted) return () => {};
      layers.add(mounted);
      return () => {
        layers.delete(mounted);
        mounted.dispose();
      };
    },
  };

  const offs: Array<() => void> = [
    commands.register('showControls', () => activity.poke()),
    commands.register('toggleMenu', () => menus.toggle()),
    commands.register('destroy', () => destroy()),
    store.select((s) => !controlsVisible(s), (idle) => root.classList.toggle('vp-idle', idle)),
  ];

  // 6. Plugins
  const pluginHost = createPluginHost(log);
  pluginHost.setupAll(options.plugins ?? [], pluginContext);

  // 7. Layout
  let layout: Mounted | null = null;
  const buildLayout = (node: LayoutNode | false) => {
    layout?.dispose();
    layout = node === false ? null : engine.build(node, layoutLayer);
  };
  offs.push(commands.register('layout', ([node]) => buildLayout(node)));
  buildLayout(options.layout === undefined ? defaultLayout : options.layout);

  // Size tracking and ratio:auto
  const measure = () => {
    const width = Math.round(root.clientWidth);
    const height = Math.round(root.clientHeight);
    if (width === store.get().width && height === store.get().height) return;
    store.set({ width, height });
    events.emit('resize', { width, height });
  };
  const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
  resizeObserver?.observe(root);
  // Initial size without a `resize` event (that would precede `init`); later changes come from the observer.
  store.set({ width: Math.round(root.clientWidth), height: Math.round(root.clientHeight) });
  const onMetadata = () => {
    if (video.videoWidth > 0 && video.videoHeight > 0) root.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
  };
  if (options.ratio === 'auto') video.addEventListener('loadedmetadata', onMetadata);

  // 8–9. Init, then load
  events.emit('init');
  if (options.source !== undefined) player.load(options.source);
  return player;

  function destroy(): void {
    if (destroyed) return;
    events.emit('destroy');
    destroyed = true;
    layout?.dispose();
    for (const mounted of [...layers].reverse()) mounted.dispose();
    layers.clear();
    menus.dispose();
    activity.dispose();
    pluginHost.disposeAll();
    offs.forEach((off) => off());
    controller.destroy();
    resizeObserver?.disconnect();
    video.removeEventListener('loadedmetadata', onMetadata);
    // Stop media even if a third-party provider's detach() left it attached.
    video.pause();
    video.removeAttribute('src');
    try {
      video.load();
    } catch {
      /* jsdom: not implemented */
    }
    root.remove();
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/player.test.ts`
Expected: PASS. jsdom has no `ResizeObserver`; the code guards for it.

- [ ] **Step 5: Run the whole suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: all pass; typecheck exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/player.ts tests/player.test.ts
git commit -m "feat: add createPlayer composition root"
```

### Task 5.3: Public exports and first demo

**Files:**
- Create: `src/index.ts`, `demo/index.html`, `demo/main.ts`
- Modify: `package.json` (`dev` script)
- Test: `tests/index.test.ts`

- [ ] **Step 1: Write the failing test `tests/index.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import * as vp from '../src/index';

describe('public exports', () => {
  it('exposes the main entry points', () => {
    expect(typeof vp.createPlayer).toBe('function');
    expect(vp.defaultLayout.type).toBe('root');
    expect(typeof vp.html5Provider).toBe('function');
    expect(typeof vp.parseSource).toBe('function');
    expect(typeof vp.createIconButton).toBe('function');
    expect(typeof vp.createSlider).toBe('function');
    expect(vp.PLAYERJS_EVENTS).toContain('play');
    expect(vp.BUILTIN_COMPONENTS.play).toBeDefined();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/index.test.ts`
Expected: FAIL — cannot resolve `../src/index`.

- [ ] **Step 3: Implement `src/index.ts`**

```ts
export type * from './types';
export { createPlayer } from './player';
export { defaultLayout } from './ui/default-layout';
export * from './components';
export { html5Provider, hasNativeHls } from './providers/html5';
export { parseSource, parseSubtitleList, isPlaylistInput, sourceKey } from './source/parse';
export { PLAYERJS_EVENTS } from './api/events-list';
export { h, iconEl, parseSvg } from './ui/dom';
export { createIconButton } from './ui/button';
export { createSlider } from './ui/slider';
export { defaultIcons } from './ui/icons';
export { dictionaries } from './ui/i18n';
export { formatTime } from './shared/time';
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/index.test.ts`
Expected: PASS.

- [ ] **Step 5: Create `demo/index.html`**

```html
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Composable Video Player — demo</title>
    <link rel="icon" href="data:," />
    <style>
      body { margin: 0; padding: 24px; background: #f4f4f5; font-family: system-ui, sans-serif; color: #18181b; }
      main { max-width: 960px; margin: 0 auto; display: grid; gap: 32px; }
      h1 { font-size: 22px; margin: 0; }
      h2 { font-size: 16px; margin: 0 0 8px; }
      .log { font: 12px/1.4 ui-monospace, monospace; background: #18181b; color: #a1a1aa; padding: 8px; height: 96px; overflow: auto; border-radius: 6px; margin-top: 8px; }
    </style>
  </head>
  <body>
    <main>
      <h1>Composable Video Player</h1>
      <section>
        <h2>Basic (mp4)</h2>
        <div id="basic"></div>
        <div class="log" id="basic-log"></div>
      </section>
    </main>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

- [ ] **Step 6: Create `demo/main.ts`**

```ts
import { createPlayer } from '../src/index';

// CC0 clips from MDN; webm first, mp4 as `or` fallback (demonstrates the fallback chain).
const FLOWER = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm or https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';

const basic = createPlayer({
  container: 'basic',
  source: FLOWER,
  title: 'Flower (CC0)',
  log: true,
});

const logEl = document.getElementById('basic-log')!;
for (const name of ['init', 'new', 'metadata', 'play', 'pause', 'seek', 'quality', 'error', 'end'] as const) {
  basic.on(name, (data: unknown) => {
    const line = document.createElement('div');
    line.textContent = `${new Date().toLocaleTimeString()}  ${name}  ${data === undefined ? '' : JSON.stringify(data)}`;
    logEl.prepend(line);
  });
}

Object.assign(window, { basic });
```

- [ ] **Step 7: Set the dev script to serve `demo/`**

In `package.json` change `"dev": "vite"` to `"dev": "vite demo --config vite.config.ts"` (otherwise Vite looks for a config inside `demo/` and ignores the root one).

- [ ] **Step 8: Smoke-run the dev server**

Run: `npx vite demo --config vite.config.ts --port 5173 & sleep 3; curl -s http://localhost:5173/ | grep -c "Composable Video Player"; curl -s -o /dev/null -w "%{http_code}\n" https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm; kill %1`
Expected: prints `2` (title + h1) and `200` (demo media reachable). Full browser verification happens in chunk 9.

- [ ] **Step 9: Run the whole suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: all pass; typecheck exits 0.

- [ ] **Step 10: Commit**

```bash
git add src/index.ts tests/index.test.ts demo/index.html demo/main.ts package.json
git commit -m "feat: add public exports and first demo page"
```
