import type { BeforeHook, CommandContext, CommandHandler, CommandName, CommandRegistry, Logger } from '../types';

type AnyHandler = (args: unknown[], ctx: CommandContext) => unknown;
type AnyHook = (args: unknown[], ctx: CommandContext) => false | void | unknown[];

const INTERNAL: CommandContext = { source: 'internal' };

export function createCommandRegistry(log: Logger): CommandRegistry {
  const handlers = new Map<string, AnyHandler>();
  const hooks = new Map<string, AnyHook[]>();

  return {
    register<K extends CommandName>(name: K, handler: CommandHandler<K>) {
      if (handlers.has(name)) log.warn(`command "${name}" handler replaced`);
      const h = handler as unknown as AnyHandler;
      handlers.set(name, h);
      return () => {
        if (handlers.get(name) === h) handlers.delete(name);
      };
    },

    before<K extends CommandName>(name: K, hook: BeforeHook<K>) {
      const h = hook as unknown as AnyHook;
      const list = hooks.get(name) ?? [];
      list.push(h);
      hooks.set(name, list);
      return () => {
        const current = hooks.get(name);
        if (current) hooks.set(name, current.filter((x) => x !== h));
      };
    },

    run(name, args, ctx = INTERNAL) {
      const handler = handlers.get(name);
      if (!handler) {
        log.warn(`unknown command "${name}"`);
        return undefined;
      }
      let current = args as unknown[];
      for (const hook of [...(hooks.get(name) ?? [])]) {
        let result: false | void | unknown[];
        try {
          result = hook(current, ctx);
        } catch (e) {
          log.error(`before-hook for "${name}" failed`, e);
          continue;
        }
        if (result === false) return undefined;
        if (Array.isArray(result)) current = result;
      }
      try {
        return handler(current, ctx) as any;
      } catch (e) {
        log.error(`command "${name}" failed`, e);
        return undefined;
      }
    },

    has: (name) => handlers.has(name),
  };
}
