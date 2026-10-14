import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).Playerjs;
  delete (window as unknown as Record<string, unknown>).PlayerjsAsync;
  vi.resetModules();
});

describe('umd entry', () => {
  it('exposes window.Playerjs and calls PlayerjsAsync', async () => {
    const async = vi.fn();
    (window as unknown as { PlayerjsAsync: unknown }).PlayerjsAsync = async;
    const mod = await import('../src/umd');
    expect((window as unknown as { Playerjs: unknown }).Playerjs).toBe(mod.Playerjs);
    expect(typeof mod.createPlayer).toBe('function');
    expect(async).toHaveBeenCalledTimes(1);
  });
});
