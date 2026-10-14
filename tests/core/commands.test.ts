import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCommandRegistry } from '../../src/core/commands';
import { createLogger } from '../../src/core/logger';

describe('createCommandRegistry', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('runs a registered handler with args and default context', () => {
    const reg = createCommandRegistry(createLogger(false));
    const handler = vi.fn();
    reg.register('seek', handler);
    reg.run('seek', [10]);
    expect(handler).toHaveBeenCalledWith([10], { source: 'internal' });
    expect(reg.has('seek')).toBe(true);
  });

  it('returns the handler result', async () => {
    const reg = createCommandRegistry(createLogger(false));
    reg.register('play', () => Promise.resolve());
    await expect(reg.run('play', [])).resolves.toBeUndefined();
  });

  it('warns and returns undefined for unknown commands', () => {
    const reg = createCommandRegistry(createLogger(false));
    expect(reg.run('pause', [])).toBeUndefined();
    expect(console.warn).toHaveBeenCalled();
  });

  it('lets before-hooks cancel or rewrite arguments in order', () => {
    const reg = createCommandRegistry(createLogger(false));
    const handler = vi.fn();
    reg.register('seek', handler);
    reg.before('seek', ([t]) => [Number(t) * 2]);
    reg.before('seek', ([t], ctx) => (ctx.source === 'user' && Number(t) > 100 ? false : undefined));
    reg.run('seek', [10], { source: 'user' });
    expect(handler).toHaveBeenLastCalledWith([20], { source: 'user' });
    reg.run('seek', [60], { source: 'user' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('removes hooks and handlers', () => {
    const reg = createCommandRegistry(createLogger(false));
    const handler = vi.fn();
    const off = reg.register('stop', handler);
    const offHook = reg.before('stop', () => false);
    offHook();
    reg.run('stop', []);
    expect(handler).toHaveBeenCalledTimes(1);
    off();
    expect(reg.has('stop')).toBe(false);
  });

  it('warns when a handler is replaced', () => {
    const reg = createCommandRegistry(createLogger(false));
    reg.register('mute', () => {});
    reg.register('mute', () => {});
    expect(console.warn).toHaveBeenCalled();
  });

  it('catches throwing handlers and hooks', () => {
    const reg = createCommandRegistry(createLogger(false));
    reg.register('toggle', () => { throw new Error('x'); });
    expect(reg.run('toggle', [])).toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});
