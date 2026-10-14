import { afterEach, describe, expect, it, vi } from 'vitest';
import { bridgeEvents } from '../../src/compat/events';
import { bridgePostMessage } from '../../src/compat/postmessage';
import { createEventBus } from '../../src/core/events';

afterEach(() => {
  delete (window as unknown as { PlayerjsEvents?: unknown }).PlayerjsEvents;
});

describe('bridgeEvents', () => {
  it('calls PlayerjsEvents and dispatches DOM events for public events only', () => {
    const bus = createEventBus();
    const container = document.createElement('div');
    const global = vi.fn();
    (window as unknown as { PlayerjsEvents: unknown }).PlayerjsEvents = global;
    const dom = vi.fn();
    container.addEventListener('time', dom);
    const off = bridgeEvents(bus, container, 'player');
    bus.emit('time', 5);
    bus.emit('ui:timeline-leave');
    expect(global).toHaveBeenCalledTimes(1);
    expect(global).toHaveBeenCalledWith('time', 'player', 5);
    expect((dom.mock.calls[0]![0] as CustomEvent).detail).toBe(5);
    off();
    bus.emit('time', 6);
    expect(global).toHaveBeenCalledTimes(1);
  });

  it('survives a throwing PlayerjsEvents', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const bus = createEventBus();
    (window as unknown as { PlayerjsEvents: unknown }).PlayerjsEvents = () => {
      throw new Error('x');
    };
    bridgeEvents(bus, document.createElement('div'), 'p');
    expect(() => bus.emit('play')).not.toThrow();
  });
});

describe('bridgePostMessage', () => {
  function fakeWindow() {
    const listeners: Array<(e: MessageEvent) => void> = [];
    const parent = { postMessage: vi.fn() };
    const win = {
      parent,
      addEventListener: (_type: string, fn: (e: MessageEvent) => void) => listeners.push(fn),
      removeEventListener: vi.fn(),
    } as unknown as Window;
    const send = (data: unknown, origin = 'https://host', source: unknown = parent) =>
      listeners.forEach((fn) => fn({ data, origin, source } as unknown as MessageEvent));
    return { win, parent, send };
  }

  it('runs api commands from the parent and answers getters', () => {
    const { win, parent, send } = fakeWindow();
    const api = vi.fn((cmd: string, arg?: unknown) => (cmd === 'time' ? 12 : arg === undefined ? undefined : undefined));
    bridgePostMessage({ api, events: createEventBus(), id: 'p', win });
    send({ api: 'volume', set: 0.5 });
    send({ api: 'time' });
    expect(api).toHaveBeenNthCalledWith(1, 'volume', 0.5);
    expect(api).toHaveBeenNthCalledWith(2, 'time');
    expect(parent.postMessage).toHaveBeenCalledWith({ event: 'time', answer: 12 }, 'https://host');
  });

  it('ignores other sources, wrong origins and malformed messages', () => {
    const { win, send } = fakeWindow();
    const api = vi.fn();
    bridgePostMessage({ api, events: createEventBus(), id: 'p', win, origin: 'https://host' });
    send({ api: 'play' }, 'https://evil');
    send({ api: 'play' }, 'https://host', {});
    send('play');
    send({ api: 42 });
    expect(api).not.toHaveBeenCalled();
  });

  it('forwards public events to the parent', () => {
    const { win, parent } = fakeWindow();
    const bus = createEventBus();
    bridgePostMessage({ api: vi.fn(), events: bus, id: 'p', win });
    bus.emit('pause');
    bus.emit('ui:menu', { open: true });
    expect(parent.postMessage).toHaveBeenCalledTimes(1);
    expect(parent.postMessage).toHaveBeenCalledWith({ event: 'pause', id: 'p', data: undefined }, '*');
  });

  it('does not forward events when not inside an iframe', () => {
    const postMessage = vi.spyOn(window, 'postMessage');
    const bus = createEventBus();
    bridgePostMessage({ api: vi.fn(), events: bus, id: 'p' });
    bus.emit('pause');
    expect(postMessage).not.toHaveBeenCalled();
  });
});
