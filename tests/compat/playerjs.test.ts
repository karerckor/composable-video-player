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

  it('delivers init and later events to PlayerjsEvents and DOM listeners', () => {
    const calls: Array<[string, string, unknown]> = [];
    (window as unknown as { PlayerjsEvents: unknown }).PlayerjsEvents = (e: string, id: string, data: unknown) => calls.push([e, id, data]);
    instance = new Playerjs({ id: 'player' });
    installFakeMedia(instance.player.video);
    const dom = vi.fn();
    document.getElementById('player')!.addEventListener('volume', dom);
    instance.api('volume', 0.4);
    expect(calls[0]).toEqual(['init', 'player', undefined]);
    expect(calls).toContainEqual(['volume', 'player', 0.4]);
    expect(dom).toHaveBeenCalled();
  });

  it('calls the ready function and supports nocontrols', () => {
    const ready = vi.fn();
    (window as unknown as { onPlayerReady: unknown }).onPlayerReady = ready;
    instance = new Playerjs({ id: 'player', ready: 'onPlayerReady', nocontrols: 1 });
    expect(ready).toHaveBeenCalledWith('player');
    expect(document.querySelector('#player .vp-toolbar')).toBeNull();
    expect(document.querySelector('#player .vp-click-layer')).not.toBeNull();
  });

  it('answers postMessage commands from the parent window', () => {
    instance = new Playerjs({ id: 'player', postmessage: 1, title: 'T' });
    const reply = vi.spyOn(window, 'postMessage').mockImplementation(() => {});
    window.dispatchEvent(new MessageEvent('message', { data: { api: 'title' }, source: window, origin: 'https://host' }));
    expect(reply).toHaveBeenCalledWith({ event: 'title', answer: 'T' }, 'https://host');
  });
});
