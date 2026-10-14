import { afterEach, describe, expect, it, vi } from 'vitest';
import { createActionRunner, parseAction } from '../../src/ui/actions.js';
import { createStore } from '../../src/core/store.js';
import { createLogger } from '../../src/core/logger.js';
import { createInitialState } from '../../src/core/initial-state.js';
import type { MenuHost, Player, PlayerState } from '../../src/types.js';

describe('parseAction', () => {
  it('parses api chains', () => {
    expect(parseAction('api:seek,-10;play')).toEqual([
      { type: 'api', name: 'seek', args: ['-10'] },
      { type: 'api', name: 'play', args: [] },
    ]);
  });
  it('parses js, event, settings and urls', () => {
    expect(parseAction('js:MyFn,1,{time}')).toEqual([{ type: 'js', fn: 'MyFn', args: ['1', '{time}'] }]);
    expect(parseAction('event:liked')).toEqual([{ type: 'event', name: 'liked' }]);
    expect(parseAction('settings')).toEqual([{ type: 'settings', only: [], align: undefined }]);
    expect(parseAction('settings:speed,quality,left')).toEqual([{ type: 'settings', only: ['speed', 'quality'], align: 'left' }]);
    expect(parseAction('https://a.com/x?t={time}')).toEqual([{ type: 'url', url: 'https://a.com/x?t={time}' }]);
    expect(parseAction('//a.com')).toEqual([{ type: 'url', url: '//a.com' }]);
    expect(parseAction('nonsense')).toEqual([]);
  });
});

describe('createActionRunner', () => {
  afterEach(() => {
    delete (window as any).MyFn;
    delete (window as any).ns;
  });

  function setup(patch: Partial<PlayerState> = {}) {
    const store = createStore({ ...createInitialState({ container: 'x' }), currentTime: 12.7, duration: 60, title: 'T', url: 'v.mp4', ...patch });
    const container = document.createElement('div');
    const api = vi.fn();
    const player = { api, container } as unknown as Player;
    const menus = { open: vi.fn() } as unknown as MenuHost;
    const run = createActionRunner({ player, store, menus, log: createLogger(false) });
    return { run, api, menus, container };
  }

  it('runs api actions with the first argument and placeholders', () => {
    const { run, api } = setup();
    run('api:seek,{time};play');
    expect(api).toHaveBeenNthCalledWith(1, 'seek', '12');
    expect(api).toHaveBeenNthCalledWith(2, 'play', undefined);
  });

  it('calls global functions by path with this binding', () => {
    const { run } = setup();
    (window as any).MyFn = vi.fn();
    (window as any).ns = { obj: { fn: vi.fn(function (this: unknown) { return this; }) } };
    run('js:MyFn,a,{title}');
    run('js:ns.obj.fn');
    expect((window as any).MyFn).toHaveBeenCalledWith('a', 'T');
    expect((window as any).ns.obj.fn).toHaveReturnedWith((window as any).ns.obj);
  });

  it('refuses non-identifier js paths', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { run } = setup();
    run('js:alert(1)');
    expect(console.warn).toHaveBeenCalled();
  });

  it('refuses dangerous js paths', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const w = window as any;
    const evalSpy = vi.spyOn(w, 'eval');
    const timeout = vi.spyOn(w, 'setTimeout');
    w.ns = { x: 1 };
    const { run } = setup();
    run('js:eval,1+1');
    run('js:setTimeout,x');
    run('js:ns.constructor');
    run('js:ns.__proto__.x');
    expect(evalSpy).not.toHaveBeenCalled();
    expect(timeout).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledTimes(4);
  });

  it('url-encodes placeholders in urls only', () => {
    const { run, api } = setup({ title: 'a&b#c' });
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    run('https://x/?t={title}');
    expect(open).toHaveBeenCalledWith('https://x/?t=a%26b%23c', '_blank', 'noopener');
    run('api:title,{title}');
    expect(api).toHaveBeenCalledWith('title', 'a&b#c');
  });

  it('uses 0 for non-finite time and duration', () => {
    const { run, api } = setup({ duration: Infinity, currentTime: NaN });
    run('api:seek,{duration}');
    run('api:seek,{time}');
    expect(api).toHaveBeenNthCalledWith(1, 'seek', '0');
    expect(api).toHaveBeenNthCalledWith(2, 'seek', '0');
  });

  it('dispatches events, opens menus and urls', () => {
    const { run, menus, container } = setup();
    const listener = vi.fn();
    container.addEventListener('liked', listener);
    run('event:liked');
    expect(listener).toHaveBeenCalled();
    run('settings:speed,center');
    expect(menus.open).toHaveBeenCalledWith({ only: ['speed'], align: 'center' });
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    run('https://a.com/?t={time}');
    expect(open).toHaveBeenCalledWith('https://a.com/?t=12', '_blank', 'noopener');
  });
});
