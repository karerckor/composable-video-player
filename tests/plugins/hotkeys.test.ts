import { beforeEach, describe, expect, it } from 'vitest';
import { hotkeysPlugin, type HotkeysOptions } from '../../src/plugins/hotkeys.js';
import { speedPlugin } from '../../src/plugins/speed.js';
import { qualityPlugin } from '../../src/plugins/quality.js';
import { createTestPlayer } from '../helpers/player-harness.js';
import type { CommandName, Player, Plugin, PlayerState, Store } from '../../src/types.js';

let player: Player;
let store: Store<PlayerState>;
let calls: Array<[string, unknown[], string]>;

/** Records commands through before-hooks and cancels them, and exposes the store. */
const recorder: Plugin = {
  name: 'recorder',
  setup(ctx) {
    store = ctx.store;
    for (const name of ['toggle', 'toggleFullscreen', 'toggleMute', 'seek', 'setVolume'] as CommandName[]) {
      ctx.commands.before(name, ((args: unknown[], c: { source: string }) => {
        calls.push([name, args, c.source]);
        return false;
      }) as never);
    }
  },
};

function setup(opts?: HotkeysOptions | false, extra: Plugin[] = []) {
  (player as Player | undefined)?.destroy(); // removes document listeners of a previous `global` player
  calls = [];
  ({ player } = createTestPlayer({ plugins: [recorder, ...extra, hotkeysPlugin(opts)] }));
}

const key = (code: string, init: KeyboardEventInit = {}, target: EventTarget = player.root) => {
  const e = new KeyboardEvent('keydown', { code, key: code, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e;
};

beforeEach(() => setup());

describe('hotkeysPlugin', () => {
  it('maps default keys to user commands', () => {
    key('Space');
    key('KeyF');
    key('KeyM');
    key('ArrowLeft');
    key('ArrowRight');
    key('ArrowUp');
    key('ArrowDown');
    expect(calls).toEqual([
      ['toggle', [], 'user'],
      ['toggleFullscreen', [], 'user'],
      ['toggleMute', [], 'user'],
      ['seek', ['-5'], 'user'],
      ['seek', ['+5'], 'user'],
      ['setVolume', ['+0.1'], 'user'],
      ['setVolume', ['-0.1'], 'user'],
    ]);
  });

  it('prevents default for handled keys only', () => {
    expect(key('Space').defaultPrevented).toBe(true);
    expect(key('KeyZ').defaultPrevented).toBe(false);
  });

  it('seeks to N*10% with digits when duration is known', () => {
    key('Digit5');
    expect(calls).toEqual([]);
    store.set({ duration: 200 });
    key('Digit5');
    key('Digit0');
    expect(calls).toEqual([
      ['seek', [100], 'user'],
      ['seek', [0], 'user'],
    ]);
  });

  it('ignores modifiers, handled events, inputs and Space on buttons', () => {
    key('Space', { ctrlKey: true });
    const input = document.createElement('input');
    player.root.append(input);
    key('Space', {}, input);
    key('Space', {}, player.root.querySelector('button')!);
    const handled = new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true });
    handled.preventDefault();
    player.root.dispatchEvent(handled);
    expect(calls).toEqual([]);
  });

  it('supports custom steps, Enter and disabling numbers', () => {
    setup({ seekStep: 10, volumeStep: 0.2, enter: true, numbers: false });
    store.set({ duration: 100 });
    key('ArrowRight');
    key('ArrowUp');
    key('Enter');
    key('Digit3');
    expect(calls).toEqual([
      ['seek', ['+10'], 'user'],
      ['setVolume', ['+0.2'], 'user'],
      ['toggle', [], 'user'],
    ]);
  });

  it('handles document keys only when global and hovered', () => {
    const docKey = () => document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true }));
    player.root.dispatchEvent(new Event('pointerenter'));
    docKey();
    expect(calls).toEqual([]);
    setup({ global: true });
    docKey();
    expect(calls).toEqual([]);
    player.root.dispatchEvent(new Event('pointerenter'));
    docKey();
    expect(calls).toEqual([['toggle', [], 'user']]);
    player.root.dispatchEvent(new Event('pointerleave'));
    docKey();
    expect(calls).toHaveLength(1);
  });

  const wheel = (deltaY: number, target: EventTarget = player.root, init: WheelEventInit = {}) => {
    const e = new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(e);
    return e;
  };

  it('changes volume with the wheel only in fullscreen', () => {
    wheel(-60);
    expect(calls).toEqual([]);
    store.set({ fullscreen: true });
    expect(wheel(-60).defaultPrevented).toBe(true);
    wheel(60);
    expect(calls).toEqual([
      ['setVolume', ['+0.1'], 'user'],
      ['setVolume', ['-0.1'], 'user'],
    ]);
  });

  it('ignores wheel events with deltaY 0 and accumulates small deltas', () => {
    store.set({ fullscreen: true });
    expect(wheel(0).defaultPrevented).toBe(false);
    expect(calls).toEqual([]);
    for (let i = 0; i < 5; i++) wheel(-10);
    expect(calls).toEqual([['setVolume', ['+0.1'], 'user']]);
  });

  it('does not lower the volume with the wheel while muted', () => {
    store.set({ fullscreen: true, muted: true });
    wheel(60);
    expect(calls).toEqual([]);
  });

  it('ignores wheel events that are already handled', () => {
    store.set({ fullscreen: true });
    player.root.addEventListener('wheel', (e) => e.preventDefault(), { once: true, capture: true });
    wheel(-60);
    expect(calls).toEqual([]);
  });

  it('ignores the wheel inside the settings menu', () => {
    setup(undefined, [speedPlugin(), qualityPlugin()]);
    store.set({ fullscreen: true });
    player.root.querySelector<HTMLButtonElement>('.vp-settings')!.click();
    const item = player.root.querySelector<HTMLElement>('.vp-menu .vp-menu-item')!;
    expect(wheel(-60, item).defaultPrevented).toBe(false);
    expect(calls).toEqual([]);
  });

  it('ignores the wheel over sliders and the playlist', () => {
    store.set({ fullscreen: true });
    for (const cls of ['vp-slider', 'vp-timeline', 'vp-playlist']) {
      const el = document.createElement('div');
      el.className = cls;
      player.root.append(el);
      wheel(-60, el);
    }
    expect(calls).toEqual([]);
  });

  it('ignores key repeat except for arrows', () => {
    store.set({ duration: 100 });
    key('Space', { repeat: true });
    key('KeyF', { repeat: true });
    key('KeyM', { repeat: true });
    key('Digit5', { repeat: true });
    expect(calls).toEqual([]);
    key('ArrowRight', { repeat: true });
    expect(calls).toEqual([['seek', ['+5'], 'user']]);
  });

  it('can be disabled', () => {
    setup(false);
    key('Space');
    expect(calls).toEqual([]);
  });

  it('does not seek while navigating the settings menu with arrows', () => {
    setup(undefined, [speedPlugin(), qualityPlugin()]);
    store.set({ qualities: [{ label: 'a' }, { label: 'b' }] });
    player.root.querySelector<HTMLButtonElement>('.vp-settings')!.click();
    const menu = player.root.querySelector('.vp-menu')!;
    menu.querySelector<HTMLButtonElement>('.vp-menu-item')!.click(); // into the quality submenu
    const item = player.root.querySelector<HTMLButtonElement>('.vp-menu-item')!;
    key('ArrowRight', {}, item);
    key('ArrowLeft', {}, item);
    key('ArrowDown', {}, player.root.querySelector<HTMLButtonElement>('.vp-menu button')!);
    expect(calls).toEqual([]);
  });
});
