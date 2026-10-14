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

  it('play with a non-string argument loads it unchanged', () => {
    register('load', 'play', 'playItem');
    const list = [{ title: 'a', file: 'a.mp4' }];
    api('play', list);
    expect(calls).toEqual([['load', [list], 'api']]);
    expect(calls[0]![1][0]).toBe(list);
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
