import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Playerjs } from '../../src/compat/playerjs';
import { installFakeMedia } from '../helpers/fake-media';

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
