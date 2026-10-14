import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createUIHarness } from '../helpers/ui-harness';
import { bigPlayComponent, fullscreenComponent, muteComponent, playComponent, settingsComponent } from '../../src/components/buttons';
import { volumeComponent } from '../../src/components/volume';
import { timelineComponent } from '../../src/components/timeline';
import type { CommandName } from '../../src/types';

let ui: ReturnType<typeof createUIHarness>;
let calls: Array<[string, unknown[]]>;

beforeEach(() => {
  ui = createUIHarness({ state: { duration: 100 } });
  calls = [];
  for (const name of ['play', 'toggle', 'toggleMute', 'setVolume', 'toggleFullscreen', 'seek'] as CommandName[]) {
    ui.commands.register(name, ((args: unknown[]) => calls.push([name, args])) as never);
  }
  ui.components.register('play', playComponent);
  ui.components.register('big-play', bigPlayComponent);
  ui.components.register('mute', muteComponent);
  ui.components.register('fullscreen', fullscreenComponent);
  ui.components.register('settings', settingsComponent);
  ui.components.register('volume', volumeComponent);
  ui.components.register('timeline', timelineComponent);
});

const build = (type: string) => ui.engine.build({ type }, ui.root)!.el;
const rect = (el: HTMLElement, left: number, width: number) =>
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ left, width, top: 0, height: 10, right: left + width, bottom: 10, x: left, y: 0, toJSON() {} });

describe('play and big-play', () => {
  it('switch icon/label by status and toggle on click', () => {
    const el = build('play');
    expect(el.getAttribute('aria-label')).toBe('Воспроизвести');
    ui.store.set({ status: 'playing' });
    expect(el.getAttribute('aria-label')).toBe('Пауза');
    ui.store.set({ status: 'ended' });
    expect(el.getAttribute('aria-label')).toBe('Повторить');
    el.click();
    build('big-play').click();
    expect(calls).toEqual([['toggle', []], ['play', []]]);
  });
});

describe('mute', () => {
  it('reflects volume level and toggles mute', () => {
    const el = build('mute');
    expect(el.getAttribute('aria-label')).toBe('Выключить звук');
    ui.store.set({ volume: 0 });
    expect(el.getAttribute('aria-label')).toBe('Выключить звук');
    ui.store.set({ muted: true });
    expect(el.getAttribute('aria-label')).toBe('Включить звук');
    el.click();
    expect(calls).toEqual([['toggleMute', []]]);
  });

  it('changes volume with the wheel', () => {
    const el = build('mute');
    el.dispatchEvent(new WheelEvent('wheel', { deltaY: -10, cancelable: true }));
    el.dispatchEvent(new WheelEvent('wheel', { deltaY: 10, cancelable: true }));
    expect(calls).toEqual([['setVolume', ['+0.05']], ['setVolume', ['-0.05']]]);
  });
});

describe('fullscreen and settings', () => {
  it('fullscreen toggles and swaps label', () => {
    const el = build('fullscreen');
    expect(el.getAttribute('aria-label')).toBe('Полный экран');
    ui.store.set({ fullscreen: true });
    expect(el.getAttribute('aria-label')).toBe('Выйти из полноэкранного режима');
    el.click();
    expect(calls).toEqual([['toggleFullscreen', []]]);
  });

  it('settings opens the menu host and tracks aria-expanded', () => {
    ui.menus.register({ id: 'speed', label: 'speed', visible: () => true, options: () => [{ label: '1', value: 1 }], current: () => 1, select: () => {} });
    const el = build('settings');
    expect(el.hasAttribute('data-vp-menu-toggle')).toBe(true);
    el.click();
    expect(ui.menus.isOpen).toBe(true);
    expect(el.getAttribute('aria-expanded')).toBe('true');
    el.click();
    expect(ui.menus.isOpen).toBe(false);
    expect(el.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('volume', () => {
  it('shows 0 when muted and sends absolute volume on drag', () => {
    const el = build('volume');
    ui.store.set({ volume: 0.4 });
    expect(el.getAttribute('aria-valuenow')).toBe('0.4');
    ui.store.set({ muted: true });
    expect(el.getAttribute('aria-valuenow')).toBe('0');
    rect(el, 0, 100);
    el.dispatchEvent(new MouseEvent('pointerdown', { clientX: 30 }));
    el.dispatchEvent(new MouseEvent('pointerup', { clientX: 30 }));
    expect(calls).toEqual([['setVolume', [0.3]], ['setVolume', [0.3]]]);
  });
  it('dispose ends an active drag', () => {
    const drags: boolean[] = [];
    ui.events.on('ui:drag', ({ active }) => drags.push(active));
    const mounted = ui.engine.build({ type: 'volume' }, ui.root)!;
    rect(mounted.el, 0, 100);
    mounted.el.dispatchEvent(new MouseEvent('pointerdown', { clientX: 30 }));
    mounted.dispose();
    expect(drags).toEqual([true, false]);
  });
});

describe('timeline', () => {
  it('paints progress and buffer', () => {
    const el = build('timeline');
    ui.store.set({ currentTime: 25, buffered: 50 });
    expect(el.querySelector<HTMLElement>('.vp-timeline-progress')!.style.width).toBe('25%');
    expect(el.querySelector<HTMLElement>('.vp-timeline-buffered')!.style.width).toBe('50%');
    expect(el.getAttribute('aria-valuetext')).toBe('0:25 / 1:40');
  });

  it('emits hover/leave events', () => {
    const el = build('timeline');
    rect(el, 0, 200);
    const hover = vi.fn();
    const leave = vi.fn();
    ui.events.on('ui:timeline-hover', hover);
    ui.events.on('ui:timeline-leave', leave);
    el.dispatchEvent(new MouseEvent('pointermove', { clientX: 50 }));
    el.dispatchEvent(new MouseEvent('pointerleave'));
    expect(hover).toHaveBeenCalledWith({ time: 25, x: 50, rootX: 50, width: 200 });
    expect(leave).toHaveBeenCalled();
  });

  it('drags without seeking until release, then seeks and emits line', () => {
    const el = build('timeline');
    rect(el, 0, 200);
    const line = vi.fn();
    const drags: boolean[] = [];
    ui.events.on('line', line);
    ui.events.on('ui:drag', ({ active }) => drags.push(active));
    el.dispatchEvent(new MouseEvent('pointerdown', { clientX: 20 }));
    el.dispatchEvent(new MouseEvent('pointermove', { clientX: 100 }));
    expect(el.querySelector<HTMLElement>('.vp-timeline-progress')!.style.width).toBe('50%');
    ui.store.set({ currentTime: 1 });
    expect(el.querySelector<HTMLElement>('.vp-timeline-progress')!.style.width).toBe('50%');
    el.dispatchEvent(new MouseEvent('pointerup', { clientX: 100 }));
    expect(calls).toEqual([['seek', [50]]]);
    expect(line).toHaveBeenCalledWith(50);
    expect(drags).toEqual([true, false]);
  });

  it('seeks with arrow keys', () => {
    const el = build('timeline');
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }));
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', cancelable: true }));
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', cancelable: true }));
    expect(calls).toEqual([['seek', ['+5']], ['seek', ['-5']], ['seek', [0]]]);
  });

  it('hides itself on live streams', () => {
    const el = build('timeline');
    ui.store.set({ live: true });
    expect(el.classList.contains('vp-timeline-live')).toBe(true);
  });

  it('ignores pointer input when duration is unknown', () => {
    ui.store.set({ duration: 0 });
    const el = build('timeline');
    rect(el, 0, 200);
    el.dispatchEvent(new MouseEvent('pointerdown', { clientX: 20 }));
    el.dispatchEvent(new MouseEvent('pointerup', { clientX: 20 }));
    expect(calls).toEqual([]);
  });

  const pe = (type: string, init: { clientX?: number; pointerId?: number; button?: number } = {}) =>
    Object.assign(new MouseEvent(type, { clientX: init.clientX ?? 0, button: init.button ?? 0, bubbles: true }), {
      pointerId: init.pointerId,
    });

  it('ignores a second pointer and non-primary buttons while dragging', () => {
    const el = build('timeline');
    rect(el, 0, 200);
    const drags: boolean[] = [];
    ui.events.on('ui:drag', ({ active }) => drags.push(active));
    el.dispatchEvent(pe('pointerdown', { pointerId: 1, button: 2, clientX: 20 }));
    expect(drags).toEqual([]);
    el.dispatchEvent(pe('pointerdown', { pointerId: 1, clientX: 20 }));
    el.dispatchEvent(pe('pointerdown', { pointerId: 2, clientX: 180 }));
    el.dispatchEvent(pe('pointermove', { pointerId: 2, clientX: 160 }));
    expect(el.querySelector<HTMLElement>('.vp-timeline-progress')!.style.width).toBe('10%');
    el.dispatchEvent(pe('pointerup', { pointerId: 2, clientX: 160 }));
    el.dispatchEvent(pe('pointercancel', { pointerId: 2 }));
    expect(drags).toEqual([true]);
    expect(calls).toEqual([]);
    el.dispatchEvent(pe('pointerup', { pointerId: 1, clientX: 100 }));
    expect(drags).toEqual([true, false]);
    expect(calls).toEqual([['seek', [50]]]);
  });

  it('still emits hover for any pointer', () => {
    const el = build('timeline');
    rect(el, 0, 200);
    const hover = vi.fn();
    ui.events.on('ui:timeline-hover', hover);
    el.dispatchEvent(pe('pointermove', { pointerId: 5, clientX: 50 }));
    expect(hover).toHaveBeenCalledTimes(1);
  });

  it('lostpointercapture ends the drag with a single seek', () => {
    const el = build('timeline');
    rect(el, 0, 200);
    const line = vi.fn();
    const drags: boolean[] = [];
    ui.events.on('line', line);
    ui.events.on('ui:drag', ({ active }) => drags.push(active));
    el.dispatchEvent(pe('pointerdown', { clientX: 20 }));
    el.dispatchEvent(pe('pointermove', { clientX: 100 }));
    el.dispatchEvent(pe('lostpointercapture'));
    expect(drags).toEqual([true, false]);
    expect(calls).toEqual([['seek', [50]]]);
    expect(line).toHaveBeenCalledTimes(1);
    el.dispatchEvent(pe('pointerup', { clientX: 150 }));
    el.dispatchEvent(pe('lostpointercapture'));
    expect(calls).toEqual([['seek', [50]]]);
    expect(drags).toEqual([true, false]);
  });

  it('dispose mid-drag emits ui:drag inactive without seeking', () => {
    const mounted = ui.engine.build({ type: 'timeline' }, ui.root)!;
    rect(mounted.el, 0, 200);
    const drags: boolean[] = [];
    ui.events.on('ui:drag', ({ active }) => drags.push(active));
    mounted.el.dispatchEvent(pe('pointerdown', { clientX: 20 }));
    mounted.dispose();
    expect(drags).toEqual([true, false]);
    expect(calls).toEqual([]);
  });

  it('arrow keys are default-prevented but still bubble', () => {
    const el = build('timeline');
    const seen = vi.fn();
    ui.root.addEventListener('keydown', seen);
    const ev = new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true, bubbles: true });
    el.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([['seek', ['+5']]]);
  });
});
