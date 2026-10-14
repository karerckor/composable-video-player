import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPluginHost } from '../../src/core/plugin-host';
import { createLogger } from '../../src/core/logger';
import type { Plugin, PluginContext } from '../../src/types';

const ctx = {} as PluginContext;

describe('createPluginHost', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('sets up plugins in order and disposes in reverse', () => {
    const order: string[] = [];
    const mk = (name: string): Plugin => ({
      name,
      setup: () => {
        order.push(`setup:${name}`);
        return () => order.push(`dispose:${name}`);
      },
    });
    const host = createPluginHost(createLogger(false));
    host.setupAll([mk('a'), mk('b')], ctx);
    host.disposeAll();
    expect(order).toEqual(['setup:a', 'setup:b', 'dispose:b', 'dispose:a']);
  });

  it('isolates a failing plugin', () => {
    const host = createPluginHost(createLogger(false));
    const good = vi.fn();
    host.setupAll([{ name: 'bad', setup: () => { throw new Error('x'); } }, { name: 'good', setup: good }], ctx);
    expect(good).toHaveBeenCalledWith(ctx);
    expect(host.has('bad')).toBe(false);
    expect(host.has('good')).toBe(true);
  });

  it('ignores duplicate names', () => {
    const host = createPluginHost(createLogger(false));
    const second = vi.fn();
    host.setupAll([{ name: 'x', setup: () => {} }, { name: 'x', setup: second }], ctx);
    expect(second).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalled();
  });

  it('continues disposing when a disposer throws', () => {
    const host = createPluginHost(createLogger(false));
    const ok = vi.fn();
    host.setupAll([{ name: 'a', setup: () => ok }, { name: 'b', setup: () => () => { throw new Error('x'); } }], ctx);
    host.disposeAll();
    expect(ok).toHaveBeenCalled();
  });
});
