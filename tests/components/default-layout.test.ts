import { describe, expect, it, vi } from 'vitest';
import { createUIHarness } from '../helpers/ui-harness.js';
import { registerBuiltinComponents, BUILTIN_COMPONENTS } from '../../src/components/index.js';
import { defaultLayout } from '../../src/ui/default-layout.js';
import css from '../../src/theme/player.css?inline';

describe('default layout', () => {
  it('builds with built-in components only, without warnings', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ui = createUIHarness();
    registerBuiltinComponents(ui.components);
    const mounted = ui.engine.build(defaultLayout, ui.root)!;
    expect(warn).not.toHaveBeenCalled();
    for (const cls of ['vp-click-layer', 'vp-toolbar', 'vp-timeline', 'vp-play', 'vp-mute', 'vp-volume', 'vp-time', 'vp-duration', 'vp-settings', 'vp-fullscreen', 'vp-big-play', 'vp-buffering', 'vp-error']) {
      expect(mounted.el.querySelector(`.${cls}`), cls).not.toBeNull();
    }
    expect(mounted.el.querySelector('.vp-prev')).toBeNull();
  });

  it('hides the toolbar only while idle-playing and the settings button without menus', () => {
    const ui = createUIHarness();
    registerBuiltinComponents(ui.components);
    const el = ui.engine.build(defaultLayout, ui.root)!.el;
    const toolbar = el.querySelector('.vp-toolbar')!;
    expect(toolbar.classList.contains('vp-hidden')).toBe(false);
    ui.store.set({ status: 'playing', userActive: false });
    expect(toolbar.classList.contains('vp-hidden')).toBe(true);
    expect(el.querySelector('.vp-settings')!.classList.contains('vp-hidden')).toBe(true);
  });

  it('hides big-play when the player is in error', () => {
    const ui = createUIHarness();
    registerBuiltinComponents(ui.components);
    const el = ui.engine.build(defaultLayout, ui.root)!.el;
    const bigPlay = el.querySelector('.vp-big-play')!;
    expect(bigPlay.classList.contains('vp-hidden')).toBe(false);
    ui.store.set({ status: 'error' });
    expect(bigPlay.classList.contains('vp-hidden')).toBe(true);
  });

  it('lists every built-in type', () => {
    expect(Object.keys(BUILTIN_COMPONENTS).sort()).toEqual(
      ['big-play', 'buffering', 'duration', 'error-overlay', 'fullscreen', 'group', 'live', 'media-click-layer', 'mute', 'overlay', 'play', 'root', 'settings', 'spacer', 'text', 'time', 'timeline', 'title', 'toolbar', 'volume'].sort(),
    );
  });

  it('collapses hidden controls inside toolbar rows instead of keeping their space', () => {
    expect(css).toMatch(/\.vp-group\s*>\s*\.vp-hidden\s*\{[^}]*display:\s*none/);
  });
});
