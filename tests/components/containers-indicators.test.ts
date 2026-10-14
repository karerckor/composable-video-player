import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createUIHarness } from '../helpers/ui-harness';
import * as containers from '../../src/components/containers';
import * as indicators from '../../src/components/indicators';

let ui: ReturnType<typeof createUIHarness>;

beforeEach(() => {
  ui = createUIHarness({ state: { duration: 3700 } });
  ui.components.register('root', containers.rootComponent);
  ui.components.register('overlay', containers.overlayComponent);
  ui.components.register('toolbar', containers.toolbarComponent);
  ui.components.register('group', containers.groupComponent);
  ui.components.register('spacer', containers.spacerComponent);
  ui.components.register('text', containers.textComponent);
  ui.components.register('time', indicators.timeComponent);
  ui.components.register('duration', indicators.durationComponent);
  ui.components.register('title', indicators.titleComponent);
  ui.components.register('buffering', indicators.bufferingComponent);
  ui.components.register('live', indicators.liveComponent);
  ui.components.register('error-overlay', indicators.errorOverlayComponent);
  ui.components.register('media-click-layer', indicators.mediaClickLayerComponent);
});

const build = (node: Parameters<typeof ui.engine.build>[0]) => ui.engine.build(node, ui.root)!.el;

describe('containers', () => {
  it('create classed elements', () => {
    expect(build({ type: 'root' }).className).toBe('vp-layout-root');
    expect(build({ type: 'overlay' }).className).toBe('vp-overlay');
    expect(build({ type: 'toolbar' }).className).toBe('vp-toolbar');
    expect(build({ type: 'group' }).className).toBe('vp-group vp-group-row');
    expect(build({ type: 'group', direction: 'column' }).className).toBe('vp-group vp-group-column');
    expect(build({ type: 'spacer' }).className).toBe('vp-spacer');
  });

  it('text translates static text and fills placeholders reactively', () => {
    expect(build({ type: 'text', text: 'quality' }).textContent).toBe('Качество');
    const el = build({ type: 'text', text: '{time} из {duration} — {title}' });
    ui.store.set({ currentTime: 61, title: 'Фильм' });
    expect(el.textContent).toBe('0:01:01 из 1:01:40 — Фильм');
  });
});

describe('indicators', () => {
  it('time and duration format with the duration as reference', () => {
    const time = build({ type: 'time' });
    const duration = build({ type: 'duration' });
    ui.store.set({ currentTime: 65 });
    expect(time.textContent).toBe('0:01:05');
    expect(duration.textContent).toBe('1:01:40');
  });

  it('title, buffering and live', () => {
    const title = build({ type: 'title' });
    ui.store.set({ title: 'Hello' });
    expect(title.textContent).toBe('Hello');
    const buffering = build({ type: 'buffering' });
    expect(buffering.getAttribute('role')).toBe('status');
    expect(buffering.getAttribute('aria-label')).toBe('Загрузка');
    expect(build({ type: 'live' }).textContent).toContain('LIVE');
  });

  it('error overlay shows a localized message and retries', () => {
    const reload = vi.fn();
    ui.commands.register('reload', reload);
    const el = build({ type: 'error-overlay' });
    ui.store.set({ status: 'error', error: { kind: 'network', message: 'x' } });
    expect(el.querySelector('.vp-error-message')!.textContent).toBe('Ошибка сети');
    el.querySelector<HTMLButtonElement>('.vp-error-retry')!.click();
    expect(reload).toHaveBeenCalledWith([], { source: 'user' });
  });

  it('media click layer toggles, and double click toggles fullscreen', () => {
    const toggle = vi.fn();
    const fs = vi.fn();
    ui.commands.register('toggle', toggle);
    ui.commands.register('toggleFullscreen', fs);
    const el = build({ type: 'media-click-layer' });
    el.click();
    el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(fs).toHaveBeenCalledTimes(1);
  });

  it('a touch tap on hidden controls only reveals them', () => {
    const toggle = vi.fn();
    ui.commands.register('toggle', toggle);
    ui.store.set({ started: true, status: 'playing', userActive: false });
    const el = build({ type: 'media-click-layer' });
    el.dispatchEvent(Object.assign(new Event('pointerdown', { bubbles: true }), { pointerType: 'touch' }));
    el.click();
    expect(toggle).not.toHaveBeenCalled();
    ui.store.set({ userActive: true });
    el.dispatchEvent(Object.assign(new Event('pointerdown', { bubbles: true }), { pointerType: 'touch' }));
    el.click();
    expect(toggle).toHaveBeenCalledTimes(1);
  });
});
