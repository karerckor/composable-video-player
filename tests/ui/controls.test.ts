import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createUIHarness } from '../helpers/ui-harness';
import { createIconButton } from '../../src/ui/button';
import { createSlider } from '../../src/ui/slider';
import type { UIContext } from '../../src/types';

let ui: ReturnType<typeof createUIHarness>;
let ctx: UIContext;

beforeEach(() => {
  ui = createUIHarness();
  ui.components.register('probe', (c) => {
    ctx = c;
    return { el: document.createElement('div') };
  });
  ui.engine.build({ type: 'probe' }, ui.root);
});

const rect = (el: HTMLElement, left: number, width: number) =>
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ left, width, top: 0, height: 10, right: left + width, bottom: 10, x: left, y: 0, toJSON() {} });

describe('createIconButton', () => {
  it('renders an icon, sets labels and handles clicks', () => {
    const onClick = vi.fn();
    const b = createIconButton(ctx, 'vp-x', onClick);
    b.setIcon('play');
    b.setLabel('play');
    expect(b.el.tagName).toBe('BUTTON');
    expect(b.el.classList.contains('vp-button')).toBe(true);
    expect(b.el.querySelector('svg')).not.toBeNull();
    expect(b.el.getAttribute('aria-label')).toBe('Воспроизвести');
    b.el.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('keeps a user hint over dynamic labels', () => {
    const b = createIconButton(ctx, 'vp-x', () => {});
    b.el.dataset.vpHint = '';
    b.el.setAttribute('aria-label', 'Custom');
    b.setLabel('pause');
    expect(b.el.getAttribute('aria-label')).toBe('Custom');
  });

  it('does not re-render the same icon', () => {
    const b = createIconButton(ctx, 'vp-x', () => {});
    b.setIcon('play');
    const svg = b.el.querySelector('svg');
    b.setIcon('play');
    expect(b.el.querySelector('svg')).toBe(svg);
  });
});

describe('createSlider', () => {
  it('reflects values with aria attributes', () => {
    const s = createSlider(ctx, { className: 'vp-volume', label: 'Громкость', onInput: () => {} });
    s.set(0.25, '25%');
    expect(s.el.getAttribute('role')).toBe('slider');
    expect(s.el.getAttribute('aria-valuenow')).toBe('0.25');
    expect(s.el.getAttribute('aria-valuetext')).toBe('25%');
    expect(s.el.querySelector<HTMLElement>('.vp-slider-fill')!.style.width).toBe('25%');
  });

  it('reports pointer drags with a final flag', () => {
    const onInput = vi.fn();
    const s = createSlider(ctx, { className: 'vp-volume', label: 'v', onInput });
    rect(s.el, 100, 200);
    s.el.dispatchEvent(new MouseEvent('pointerdown', { clientX: 150 }));
    s.el.dispatchEvent(new MouseEvent('pointermove', { clientX: 200 }));
    s.el.dispatchEvent(new MouseEvent('pointerup', { clientX: 400 }));
    expect(onInput.mock.calls).toEqual([
      [0.25, false],
      [0.5, false],
      [1, true],
    ]);
  });

  it('ignores pointermove without a drag and supports keyboard steps', () => {
    const onInput = vi.fn();
    const s = createSlider(ctx, { className: 'vp-volume', label: 'v', onInput, step: 0.1 });
    s.set(0.5);
    s.el.dispatchEvent(new MouseEvent('pointermove', { clientX: 10 }));
    s.el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    s.el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(onInput.mock.calls).toEqual([
      [0.6, true],
      [0.4, true],
    ]);
  });
  const pe = (type: string, init: { clientX?: number; pointerId?: number; button?: number } = {}) =>
    Object.assign(new MouseEvent(type, { clientX: init.clientX ?? 0, button: init.button ?? 0, bubbles: true }), {
      pointerId: init.pointerId,
    });
  const trackDrags = () => {
    const drags: boolean[] = [];
    ui.events.on('ui:drag', (d: { active: boolean }) => drags.push(d.active));
    return drags;
  };

  it('ignores a second pointer while dragging and only follows the active pointer', () => {
    const drags = trackDrags();
    const onInput = vi.fn();
    const s = createSlider(ctx, { className: 'vp-volume', label: 'v', onInput });
    rect(s.el, 0, 100);
    s.el.dispatchEvent(pe('pointerdown', { pointerId: 1, clientX: 10 }));
    s.el.dispatchEvent(pe('pointerdown', { pointerId: 2, clientX: 90 }));
    s.el.dispatchEvent(pe('pointermove', { pointerId: 2, clientX: 80 }));
    s.el.dispatchEvent(pe('pointerup', { pointerId: 2, clientX: 80 }));
    expect(drags).toEqual([true]);
    s.el.dispatchEvent(pe('pointerup', { pointerId: 1, clientX: 20 }));
    expect(drags).toEqual([true, false]);
    expect(onInput.mock.calls).toEqual([
      [0.1, false],
      [0.2, true],
    ]);
  });

  it('dispose ends an active drag without calling onInput', () => {
    const drags = trackDrags();
    const onInput = vi.fn();
    const s = createSlider(ctx, { className: 'vp-volume', label: 'v', onInput });
    rect(s.el, 0, 100);
    s.el.dispatchEvent(pe('pointerdown', { clientX: 10 }));
    onInput.mockClear();
    s.dispose();
    expect(drags).toEqual([true, false]);
    expect(onInput).not.toHaveBeenCalled();
    s.dispose();
    expect(drags).toEqual([true, false]);
  });

  it('lostpointercapture ends the drag once with the last value', () => {
    const drags = trackDrags();
    const onInput = vi.fn();
    const s = createSlider(ctx, { className: 'vp-volume', label: 'v', onInput });
    rect(s.el, 0, 100);
    s.el.dispatchEvent(pe('pointerdown', { clientX: 10 }));
    s.el.dispatchEvent(pe('pointermove', { clientX: 40 }));
    s.el.dispatchEvent(pe('lostpointercapture'));
    expect(drags).toEqual([true, false]);
    expect(onInput.mock.calls).toEqual([
      [0.1, false],
      [0.4, false],
      [0.4, true],
    ]);
    s.el.dispatchEvent(pe('pointerup', { clientX: 90 }));
    s.el.dispatchEvent(pe('lostpointercapture'));
    expect(onInput).toHaveBeenCalledTimes(3);
    expect(drags).toEqual([true, false]);
  });

  it('pointerup followed by lostpointercapture does not emit final twice', () => {
    const onInput = vi.fn();
    const s = createSlider(ctx, { className: 'vp-volume', label: 'v', onInput });
    rect(s.el, 0, 100);
    s.el.dispatchEvent(pe('pointerdown', { clientX: 10 }));
    s.el.dispatchEvent(pe('pointerup', { clientX: 50 }));
    s.el.dispatchEvent(pe('lostpointercapture'));
    expect(onInput.mock.calls.filter((c) => c[1] === true)).toHaveLength(1);
  });

  it('keyboard keys are default-prevented but still bubble to ancestors', () => {
    const s = createSlider(ctx, { className: 'vp-volume', label: 'v', onInput: () => {} });
    const parent = document.createElement('div');
    parent.append(s.el);
    const seen = vi.fn();
    parent.addEventListener('keydown', seen);
    const ev = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
    s.el.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('ignores non-primary mouse buttons', () => {
    const drags = trackDrags();
    const onInput = vi.fn();
    const s = createSlider(ctx, { className: 'vp-volume', label: 'v', onInput });
    s.el.dispatchEvent(pe('pointerdown', { button: 2, clientX: 10 }));
    expect(onInput).not.toHaveBeenCalled();
    expect(drags).toEqual([]);
  });

  it('exposes aria-valuenow immediately', () => {
    const s = createSlider(ctx, { className: 'vp-volume', label: 'v', onInput: () => {} });
    expect(s.el.getAttribute('aria-valuenow')).toBe('0');
  });
});
