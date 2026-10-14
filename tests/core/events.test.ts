import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../../src/core/events';
import { createLogger } from '../../src/core/logger';

describe('createEventBus', () => {
  it('delivers typed payloads and unsubscribes', () => {
    const bus = createEventBus();
    const cb = vi.fn();
    const off = bus.on('time', cb);
    bus.emit('time', 3);
    off();
    bus.emit('time', 4);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(3);
  });

  it('emits void events without payload', () => {
    const bus = createEventBus();
    const cb = vi.fn();
    bus.on('play', cb);
    bus.emit('play');
    expect(cb).toHaveBeenCalledWith(undefined);
  });

  it('once fires a single time and can be cancelled', () => {
    const bus = createEventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.once('pause', a);
    const cancel = bus.once('pause', b);
    cancel();
    bus.emit('pause');
    bus.emit('pause');
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
  });

  it('off removes a handler', () => {
    const bus = createEventBus();
    const cb = vi.fn();
    bus.on('volume', cb);
    bus.off('volume', cb);
    bus.emit('volume', 0.5);
    expect(cb).not.toHaveBeenCalled();
  });

  it('onAny receives every event with its name', () => {
    const bus = createEventBus();
    const any = vi.fn();
    bus.onAny(any);
    bus.emit('quality', '720p');
    bus.emit('ui:timeline-leave');
    expect(any).toHaveBeenNthCalledWith(1, 'quality', '720p');
    expect(any).toHaveBeenNthCalledWith(2, 'ui:timeline-leave', undefined);
  });

  it('isolates throwing handlers', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const bus = createEventBus(createLogger(false));
    const good = vi.fn();
    bus.on('end', () => { throw new Error('x'); });
    bus.on('end', good);
    bus.emit('end');
    expect(good).toHaveBeenCalled();
  });
});
