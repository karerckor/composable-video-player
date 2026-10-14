import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRegistry, type Registry } from '../../src/ui/registry';
import { compileHide, registerBuiltinHideRules } from '../../src/ui/hide-rules';
import { createLogger } from '../../src/core/logger';
import { createInitialState } from '../../src/core/initial-state';
import type { HideRuleFactory, HideRuleSpec, PlayerState, UIContext } from '../../src/types';

const log = createLogger(false);
const state = (patch: Partial<PlayerState> = {}): PlayerState => ({ ...createInitialState({ container: 'x' }), ...patch });

let reg: Registry<HideRuleFactory>;
const ctx = {
  menus: { hasVisible: (s: PlayerState) => s.qualities.length > 1 },
  commands: { has: (name: string) => name === 'next' },
} as unknown as UIContext;

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  reg = createRegistry<HideRuleFactory>('hide rule', log);
  registerBuiltinHideRules(reg);
});

const test = (spec: HideRuleSpec[], s: PlayerState) => compileHide(spec, reg, ctx, log)(s);

describe('registry', () => {
  it('stores items and warns on replacement', () => {
    const r = createRegistry<number>('thing', log);
    r.register('a', 1);
    r.register('a', 2);
    expect(r.get('a')).toBe(2);
    expect(r.has('b')).toBe(false);
    expect(console.warn).toHaveBeenCalled();
  });
});

describe('built-in hide rules', () => {
  it('idle hides while playing without activity unless locked', () => {
    expect(test(['idle'], state({ status: 'playing', userActive: false }))).toBe(true);
    expect(test(['idle'], state({ status: 'playing', userActive: true }))).toBe(false);
    expect(test(['idle'], state({ status: 'paused', userActive: false }))).toBe(false);
    expect(test(['idle'], state({ status: 'playing', controlsLocked: true }))).toBe(false);
  });

  it('status, started, fullscreen, waiting, live and error rules', () => {
    expect(test(['paused'], state({ status: 'paused' }))).toBe(true);
    expect(test(['playing'], state({ status: 'paused' }))).toBe(false);
    expect(test(['not-started'], state())).toBe(true);
    expect(test(['started'], state({ started: true }))).toBe(true);
    expect(test(['fullscreen'], state({ fullscreen: true }))).toBe(true);
    expect(test(['not-fullscreen'], state())).toBe(true);
    expect(test(['not-waiting'], state({ waiting: true }))).toBe(false);
    expect(test(['live'], state({ live: true }))).toBe(true);
    expect(test(['not-live'], state())).toBe(true);
    expect(test(['not-error'], state({ status: 'error' }))).toBe(false);
  });

  it('width rules', () => {
    expect(test([{ minWidth: 400 }], state({ width: 400 }))).toBe(true);
    expect(test([{ maxWidth: 400 }], state({ width: 399 }))).toBe(true);
    expect(test([{ maxWidth: 400 }], state({ width: 400 }))).toBe(false);
  });

  it('no-menus and command rules use the UI context', () => {
    expect(test(['no-menus'], state())).toBe(true);
    expect(test(['no-menus'], state({ qualities: [{ label: 'a' }, { label: 'b' }] }))).toBe(false);
    expect(test([{ command: 'next' }], state())).toBe(false);
    expect(test([{ command: 'prev' }], state())).toBe(true);
  });

  it('combines rules with OR and treats unknown rules as false', () => {
    expect(test(['paused', 'fullscreen'], state({ fullscreen: true }))).toBe(true);
    expect(test(['nope'], state())).toBe(false);
    expect(console.warn).toHaveBeenCalled();
  });
});
