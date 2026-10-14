import type { Logger, Plugin, PluginContext } from '../types';

export interface PluginHost {
  setupAll(plugins: Plugin[], ctx: PluginContext): void;
  disposeAll(): void;
  has(name: string): boolean;
}

export function createPluginHost(log: Logger): PluginHost {
  const active = new Set<string>();
  const disposers: Array<{ name: string; fn: () => void }> = [];

  return {
    setupAll(plugins, ctx) {
      for (const plugin of plugins) {
        if (active.has(plugin.name)) {
          log.warn(`plugin "${plugin.name}" is already registered; duplicate ignored`);
          continue;
        }
        try {
          const dispose = plugin.setup(ctx);
          active.add(plugin.name);
          if (typeof dispose === 'function') disposers.push({ name: plugin.name, fn: dispose });
        } catch (e) {
          log.error(`plugin "${plugin.name}" failed to set up`, e);
        }
      }
    },

    disposeAll() {
      for (const { name, fn } of disposers.reverse()) {
        try {
          fn();
        } catch (e) {
          log.error(`plugin "${name}" failed to dispose`, e);
        }
      }
      disposers.length = 0;
      active.clear();
    },

    has: (name) => active.has(name),
  };
}
