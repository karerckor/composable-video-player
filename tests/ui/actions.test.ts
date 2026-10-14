import { afterEach, describe, expect, it, vi } from 'vitest';
import { createActionRunner, parseAction } from '../../src/ui/actions';
import { createStore } from '../../src/core/store';
import { createLogger } from '../../src/core/logger';
import { createInitialState } from '../../src/core/initial-state';
import type { MenuHost, Player } from '../../src/types';

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

  function setup() {
    const store = createStore({ ...createInitialState({ container: 'x' }), currentTime: 12.7, duration: 60, title: 'T', url: 'v.mp4' });
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
