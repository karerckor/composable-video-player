import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Playerjs } from '../../src/compat/playerjs';
import { installFakeMedia } from '../helpers/fake-media';
import { flush } from '../helpers/flush';

let instance: Playerjs | null;

beforeEach(() => {
  localStorage.clear();
  document.body.replaceChildren();
  const host = document.createElement('div');
  host.id = 'player';
  document.body.append(host);
  instance = null;
});
afterEach(() => {
  instance?.api('destroy');
  delete (window as unknown as Record<string, unknown>).PlayerjsEvents;
  delete (window as unknown as Record<string, unknown>).onPlayerReady;
});

describe('Playerjs', () => {
  it('creates a player in #id with default plugins and the default layout', () => {
    instance = new Playerjs({ id: 'player', title: 'Hello' });
    expect(document.querySelector('#player .vp-root .vp-toolbar')).not.toBeNull();
    expect(instance.api('title')).toBe('Hello');
    expect(instance.player.id).toBe('player');
  });

  it('delivers init and later events to PlayerjsEvents and DOM listeners', async () => {
    const calls: Array<[string, string, unknown]> = [];
    (window as unknown as { PlayerjsEvents: unknown }).PlayerjsEvents = (e: string, id: string, data: unknown) => calls.push([e, id, data]);
    instance = new Playerjs({ id: 'player' });
    installFakeMedia(instance.player.video);
    const dom = vi.fn();
    document.getElementById('player')!.addEventListener('volume', dom);
    instance.api('volume', 0.4);
    await Promise.resolve();
    expect(calls).toContainEqual(['init', 'player', undefined]);
    expect(calls).toContainEqual(['volume', 'player', 0.4]);
    expect(dom).toHaveBeenCalled();
  });

  it('calls the ready function and supports nocontrols', async () => {
    const ready = vi.fn();
    (window as unknown as { onPlayerReady: unknown }).onPlayerReady = ready;
    instance = new Playerjs({ id: 'player', ready: 'onPlayerReady', nocontrols: 1 });
    await Promise.resolve();
    expect(ready).toHaveBeenCalledWith('player');
    expect(document.querySelector('#player .vp-toolbar')).toBeNull();
    expect(document.querySelector('#player .vp-click-layer')).not.toBeNull();
  });

  it('answers postMessage commands from the parent window', () => {
    instance = new Playerjs({ id: 'player', postmessage: 1, title: 'T' });
    const reply = vi.spyOn(window, 'postMessage').mockImplementation(() => {});
    window.dispatchEvent(new MessageEvent('message', { data: { api: 'title' }, source: window, origin: 'https://host' }));
    expect(reply).toHaveBeenCalledWith({ event: 'title', answer: 'T', id: 'player' }, 'https://host');
  });

  it('lets ready and PlayerjsEvents(init) handlers use the returned instance', async () => {
    let seenByReady: Playerjs | null | undefined;
    let seenByInit: Playerjs | null | undefined;
    (window as unknown as { onPlayerReady: unknown }).onPlayerReady = () => {
      seenByReady = instance;
    };
    (window as unknown as { PlayerjsEvents: unknown }).PlayerjsEvents = (e: string) => {
      if (e === 'init') seenByInit = instance;
    };
    instance = new Playerjs({ id: 'player', ready: 'onPlayerReady' });
    await Promise.resolve();
    expect(seenByReady).toBe(instance);
    expect(seenByInit).toBe(instance);
  });

  it('keeps event order after the deferred init', async () => {
    const calls: string[] = [];
    (window as unknown as { PlayerjsEvents: unknown }).PlayerjsEvents = (e: string) => calls.push(e);
    const dom: string[] = [];
    const host = document.getElementById('player')!;
    for (const name of ['init', 'new']) host.addEventListener(name, () => dom.push(name));
    instance = new Playerjs({ id: 'player', file: 'a.mp4' });
    expect(calls).toEqual([]);
    await Promise.resolve();
    expect(calls.indexOf('init')).toBe(0);
    expect(calls).toContain('new');
    expect(calls.indexOf('new')).toBe(1);
    expect(dom.slice(0, 2)).toEqual(['init', 'new']);
  });

  it('starts a playlist given as a file array', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    instance = new Playerjs({ id: 'player', file: [{ title: 'One', file: 'one.mp4' }, { title: 'Two', file: 'two.mp4' }] });
    installFakeMedia(instance.player.video);
    await flush();
    expect(instance.player.state.playlist?.flat).toHaveLength(2);
    expect(instance.player.state.playlist?.index).toBe(0);
    expect(instance.player.state.url).toBe('one.mp4');
    expect(instance.player.state.title).toBe('One');
    expect(instance.player.state.error).toBeNull();
    expect(error).not.toHaveBeenCalled();
  });

  it("api('file', array) loads a playlist", async () => {
    instance = new Playerjs({ id: 'player', file: 'a.mp4' });
    installFakeMedia(instance.player.video);
    await flush();
    instance.api('file', [{ title: 'Two', file: 'two.mp4' }]);
    await flush();
    expect(instance.player.state.playlist?.flat).toHaveLength(1);
    expect(instance.player.state.url).toBe('two.mp4');
  });

  it('does not let a throwing ready callback escape', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    (window as unknown as { onPlayerReady: unknown }).onPlayerReady = () => {
      throw new Error('boom');
    };
    instance = new Playerjs({ id: 'player', ready: 'onPlayerReady' });
    await Promise.resolve();
    expect(error).toHaveBeenCalledWith('[vp] ready callback failed', expect.any(Error));
    error.mockRestore();
  });

  it('warns once when postmessage is enabled without postmessageOrigin', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    instance = new Playerjs({ id: 'player', postmessage: 1 });
    const calls = warn.mock.calls.filter((c) => String(c[1]).includes('postmessageOrigin'));
    expect(calls).toHaveLength(1);
    expect(String(calls[0]![1])).toContain('any');
    instance.api('destroy');
    warn.mockClear();
    document.body.replaceChildren();
    const host = document.createElement('div');
    host.id = 'player';
    document.body.append(host);
    instance = new Playerjs({ id: 'player', postmessage: 1, postmessageOrigin: 'https://host' });
    expect(warn.mock.calls.filter((c) => String(c[1]).includes('postmessageOrigin'))).toHaveLength(0);
    warn.mockRestore();
  });

  it('ignores messages for another id', () => {
    instance = new Playerjs({ id: 'player', postmessage: 1, title: 'T' });
    const reply = vi.spyOn(window, 'postMessage').mockImplementation(() => {});
    window.dispatchEvent(new MessageEvent('message', { data: { api: 'title', id: 'other' }, source: window, origin: 'https://host' }));
    expect(reply).not.toHaveBeenCalled();
  });

  it('stops answering messages and delivering events after destroy', async () => {
    const calls: string[] = [];
    (window as unknown as { PlayerjsEvents: unknown }).PlayerjsEvents = (e: string) => calls.push(e);
    instance = new Playerjs({ id: 'player', postmessage: 1, title: 'T' });
    await Promise.resolve();
    const player = instance;
    player.api('destroy');
    instance = null;
    const reply = vi.spyOn(window, 'postMessage').mockImplementation(() => {});
    const seen = calls.length;
    window.dispatchEvent(new MessageEvent('message', { data: { api: 'title' }, source: window, origin: 'https://host' }));
    expect(reply).not.toHaveBeenCalled();
    expect(calls.length).toBe(seen);
    expect(calls).toContain('destroy');
  });
});
