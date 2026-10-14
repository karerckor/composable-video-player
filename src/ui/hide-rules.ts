import type { HideRuleFactory, HideRuleSpec, Logger, PlayerState, UIContext } from '../types';
import type { Registry } from './registry';

const simple = (test: (s: PlayerState) => boolean): HideRuleFactory => () => ({ test });

export function registerBuiltinHideRules(reg: Registry<HideRuleFactory>): void {
  reg.register('idle', simple((s) => !s.userActive && s.status === 'playing' && !s.controlsLocked));
  reg.register('paused', simple((s) => s.status === 'paused'));
  reg.register('playing', simple((s) => s.status === 'playing'));
  reg.register('not-started', simple((s) => !s.started));
  reg.register('started', simple((s) => s.started));
  reg.register('fullscreen', simple((s) => s.fullscreen));
  reg.register('not-fullscreen', simple((s) => !s.fullscreen));
  reg.register('not-waiting', simple((s) => !s.waiting));
  reg.register('live', simple((s) => s.live));
  reg.register('not-live', simple((s) => !s.live));
  reg.register('error', simple((s) => s.status === 'error'));
  reg.register('not-error', simple((s) => s.status !== 'error'));
  reg.register('minWidth', (arg) => {
    const n = Number(arg);
    return { test: (s) => s.width >= n };
  });
  reg.register('maxWidth', (arg) => {
    const n = Number(arg);
    return { test: (s) => s.width < n };
  });
  reg.register('no-menus', (_arg, ctx) => ({ test: (s) => !ctx.menus.hasVisible(s) }));
  reg.register('command', (arg, ctx) => {
    const name = String(arg);
    return { test: () => !ctx.commands.has(name) };
  });
}

/** Compiles hide specs into one predicate: hidden when ANY rule is true. */
export function compileHide(specs: HideRuleSpec[], reg: Registry<HideRuleFactory>, ctx: UIContext, log: Logger): (s: PlayerState) => boolean {
  const tests = specs.map((spec) => {
    const [name, arg] = typeof spec === 'string' ? [spec, undefined] : (Object.entries(spec)[0] ?? ['', undefined]);
    const factory = reg.get(name);
    if (!factory) {
      log.warn(`unknown hide rule "${name}"`);
      return () => false;
    }
    return factory(arg, ctx).test;
  });
  return (s) => tests.some((test) => test(s));
}
