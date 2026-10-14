## Chunk 4: Built-in components, theme and default layout

Delivers: `ui/button.ts` and `ui/slider.ts` helpers (shared with plugins), built-in components, `registerBuiltinComponents`, `defaultLayout`, and `theme/player.css`.

Spec references: §6.5, §6.7, §6.8. Deviations 5–6 from `00-overview.md` apply (`prev`/`next`/`playlist-button` belong to the playlist plugin; toolbar hides only on `idle`).

All components follow the same rules: read state only via `ctx.select`, act only via `ctx.user(...)`, never touch `<video>`, never use `innerHTML`.

### Task 4.1: Icon button and slider helpers

**Files:**
- Create: `src/ui/button.ts`, `src/ui/slider.ts`
- Test: `tests/ui/controls.test.ts`

- [ ] **Step 1: Write the failing test `tests/ui/controls.test.ts`**

```ts
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
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/ui/controls.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `src/ui/button.ts`**

```ts
import type { IconName, UIContext } from '../types';
import { h, iconEl } from './dom';

export interface IconButton {
  el: HTMLButtonElement;
  setIcon(name: IconName): void;
  /** i18n key; ignored when the layout node set a `hint`. */
  setLabel(key: string): void;
}

export function createIconButton(ctx: UIContext, className: string, onClick: () => void): IconButton {
  const el = h('button', { class: `vp-button ${className}`, type: 'button' });
  let current: IconName | null = null;
  ctx.listen(el, 'click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return {
    el,
    setIcon(name) {
      if (name === current) return;
      current = name;
      el.replaceChildren(iconEl(ctx.icon(name)));
    },
    setLabel(key) {
      if (el.dataset.vpHint !== undefined) return;
      const text = ctx.t(key);
      el.setAttribute('aria-label', text);
      el.title = text;
    },
  };
}
```

- [ ] **Step 4: Implement `src/ui/slider.ts`**

```ts
import type { UIContext } from '../types';
import { h } from './dom';
import { clamp } from '../shared/clamp';

export interface SliderOptions {
  className: string;
  label: string;
  /** Called with a 0..1 value; `final` is true on release and keyboard steps. */
  onInput(value: number, final: boolean): void;
  step?: number;
}

export interface Slider {
  el: HTMLDivElement;
  set(value: number, text?: string): void;
}

const round = (v: number) => Math.round(v * 1000) / 1000;

export function createSlider(ctx: UIContext, o: SliderOptions): Slider {
  const step = o.step ?? 0.05;
  const fill = h('div', { class: 'vp-slider-fill' });
  const el = h(
    'div',
    { class: `vp-slider ${o.className}`, role: 'slider', tabindex: 0, 'aria-label': o.label, 'aria-valuemin': 0, 'aria-valuemax': 1 },
    h('div', { class: 'vp-slider-track' }, fill),
  );
  let value = 0;
  let dragging = false;

  const valueAt = (clientX: number) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 ? round(clamp((clientX - r.left) / r.width, 0, 1)) : value;
  };

  const set = (v: number, text?: string) => {
    value = clamp(v, 0, 1);
    fill.style.width = `${value * 100}%`;
    el.setAttribute('aria-valuenow', String(round(value)));
    el.setAttribute('aria-valuetext', text ?? `${Math.round(value * 100)}%`);
  };

  ctx.listen(el, 'pointerdown', (e) => {
    const pe = e as PointerEvent;
    e.stopPropagation();
    dragging = true;
    ctx.events.emit('ui:drag', { active: true });
    try {
      el.setPointerCapture?.(pe.pointerId);
    } catch {
      /* jsdom / synthetic events have no active pointer */
    }
    o.onInput(valueAt(pe.clientX), false);
  });
  ctx.listen(el, 'pointermove', (e) => {
    if (dragging) o.onInput(valueAt((e as PointerEvent).clientX), false);
  });
  ctx.listen(el, 'pointerup', (e) => {
    if (!dragging) return;
    dragging = false;
    ctx.events.emit('ui:drag', { active: false });
    o.onInput(valueAt((e as PointerEvent).clientX), true);
  });
  ctx.listen(el, 'pointercancel', () => {
    if (!dragging) return;
    dragging = false;
    ctx.events.emit('ui:drag', { active: false });
  });
  ctx.listen(el, 'click', (e) => e.stopPropagation());
  ctx.listen(el, 'keydown', (e) => {
    const key = (e as KeyboardEvent).key;
    const delta = key === 'ArrowRight' || key === 'ArrowUp' ? step : key === 'ArrowLeft' || key === 'ArrowDown' ? -step : 0;
    if (!delta) return;
    e.preventDefault();
    e.stopPropagation();
    o.onInput(round(clamp(value + delta, 0, 1)), true);
  });

  return { el, set };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/ui/controls.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/button.ts src/ui/slider.ts tests/ui/controls.test.ts
git commit -m "feat(ui): add icon button and slider helpers"
```

### Task 4.2: Containers, text and indicators

**Files:**
- Create: `src/components/containers.ts`, `src/components/indicators.ts`
- Test: `tests/components/containers-indicators.test.ts`

- [ ] **Step 1: Write the failing test `tests/components/containers-indicators.test.ts`**

```ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/components/containers-indicators.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `src/components/containers.ts`**

```ts
import type { ComponentFactory, PlayerState } from '../types';
import { h } from '../ui/dom';
import { formatTime } from '../shared/time';

export const rootComponent: ComponentFactory = () => ({ el: h('div', { class: 'vp-layout-root' }) });
export const overlayComponent: ComponentFactory = () => ({ el: h('div', { class: 'vp-overlay' }) });
export const toolbarComponent: ComponentFactory = () => ({ el: h('div', { class: 'vp-toolbar' }) });
export const spacerComponent: ComponentFactory = () => ({ el: h('div', { class: 'vp-spacer' }) });

export const groupComponent: ComponentFactory<{ direction?: 'row' | 'column' }> = (_ctx, props) => ({
  el: h('div', { class: `vp-group vp-group-${props.direction === 'column' ? 'column' : 'row'}` }),
});

const PLACEHOLDER_RE = /\{(time|duration|title)\}/g;

export function fillTemplate(template: string, s: PlayerState): string {
  return template.replace(PLACEHOLDER_RE, (_m, key: string) => {
    if (key === 'time') return formatTime(s.currentTime, s.duration);
    if (key === 'duration') return formatTime(s.duration, s.duration);
    return s.title;
  });
}

export const textComponent: ComponentFactory<{ text?: string }> = (ctx, props) => {
  const el = h('span', { class: 'vp-text' });
  const template = String(props.text ?? '');
  if (!/\{(time|duration|title)\}/.test(template)) {
    el.textContent = ctx.t(template);
  } else {
    ctx.select((s) => fillTemplate(template, s), (text) => (el.textContent = text), { immediate: true });
  }
  return { el };
};
```

- [ ] **Step 4: Implement `src/components/indicators.ts`**

```ts
import type { ComponentFactory } from '../types';
import { h } from '../ui/dom';
import { formatTime } from '../shared/time';

export const timeComponent: ComponentFactory = (ctx) => {
  const el = h('span', { class: 'vp-time' });
  ctx.select((s) => formatTime(s.currentTime, s.duration), (text) => (el.textContent = text), { immediate: true });
  return { el };
};

export const durationComponent: ComponentFactory = (ctx) => {
  const el = h('span', { class: 'vp-duration' });
  ctx.select((s) => formatTime(s.duration, s.duration), (text) => (el.textContent = text), { immediate: true });
  return { el };
};

export const titleComponent: ComponentFactory = (ctx) => {
  const el = h('div', { class: 'vp-title' });
  ctx.select((s) => s.title, (title) => (el.textContent = title), { immediate: true });
  return { el };
};

export const bufferingComponent: ComponentFactory = (ctx) => ({
  el: h('div', { class: 'vp-buffering', role: 'status', 'aria-label': ctx.t('buffering') }),
});

export const liveComponent: ComponentFactory = (ctx) => ({
  el: h('span', { class: 'vp-live' }, h('span', { class: 'vp-live-dot', 'aria-hidden': 'true' }, '●'), ` ${ctx.t('live')}`),
});

export const errorOverlayComponent: ComponentFactory = (ctx) => {
  const message = h('div', { class: 'vp-error-message' });
  const retry = h('button', { class: 'vp-button vp-error-retry', type: 'button' }, ctx.t('retry'));
  const el = h('div', { class: 'vp-error', role: 'alert' }, message, retry);
  ctx.listen(retry, 'click', (e) => {
    e.stopPropagation();
    ctx.user('reload');
  });
  ctx.select((s) => s.error?.kind ?? null, (kind) => (message.textContent = kind ? ctx.t(`error.${kind}`) : ''), { immediate: true });
  return { el };
};

/**
 * Full-size layer over the video: click toggles playback, double click toggles fullscreen.
 * Accepted trade-off (same as YouTube/PlayerJS): a double click also delivers two clicks,
 * so playback toggles twice (net unchanged) before fullscreen; no single-click delay.
 */
export const mediaClickLayerComponent: ComponentFactory = (ctx) => {
  const el = h('div', { class: 'vp-click-layer' });
  let revealOnly = false;
  ctx.listen(el, 'pointerdown', (e) => {
    const s = ctx.store.get();
    revealOnly = (e as PointerEvent).pointerType === 'touch' && s.status === 'playing' && !s.userActive;
  });
  ctx.listen(el, 'click', () => {
    if (revealOnly) {
      revealOnly = false;
      return;
    }
    ctx.user('toggle');
  });
  ctx.listen(el, 'dblclick', () => ctx.user('toggleFullscreen'));
  return { el };
};
```

- [ ] **Step 5: Add the `buffering` i18n key**

In `src/ui/i18n.ts`, add `buffering: 'Загрузка',` after `retry` in the `ru` dictionary and `buffering: 'Loading',` after `retry` in the `en` dictionary.

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run tests/components/containers-indicators.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/containers.ts src/components/indicators.ts src/ui/i18n.ts tests/components/containers-indicators.test.ts
git commit -m "feat(components): add containers, text and indicator components"
```

## Chunk 4b: Controls, registration, default layout and theme

### Task 4.3: Buttons, volume and timeline

**Files:**
- Create: `src/components/buttons.ts`, `src/components/volume.ts`, `src/components/timeline.ts`
- Test: `tests/components/controls.test.ts`

- [ ] **Step 1: Write the failing test `tests/components/controls.test.ts`**

```ts
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
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/components/controls.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `src/components/buttons.ts`**

```ts
import type { ComponentFactory, IconName } from '../types';
import { createIconButton } from '../ui/button';

export const playComponent: ComponentFactory = (ctx) => {
  const b = createIconButton(ctx, 'vp-play', () => ctx.user('toggle'));
  ctx.select(
    (s) => s.status,
    (status) => {
      const key = status === 'playing' ? 'pause' : status === 'ended' ? 'replay' : 'play';
      b.setIcon(key);
      b.setLabel(key);
    },
    { immediate: true },
  );
  return { el: b.el };
};

export const bigPlayComponent: ComponentFactory = (ctx) => {
  const b = createIconButton(ctx, 'vp-big-play', () => ctx.user('play'));
  b.setIcon('play');
  b.setLabel('play');
  return { el: b.el };
};

export const muteComponent: ComponentFactory = (ctx) => {
  const b = createIconButton(ctx, 'vp-mute', () => ctx.user('toggleMute'));
  ctx.select(
    (s): IconName => (s.muted || s.volume === 0 ? 'volume-mute' : s.volume < 0.5 ? 'volume-low' : 'volume-high'),
    (icon) => b.setIcon(icon),
    { immediate: true },
  );
  // The label describes what a click does (toggleMute), so it follows `muted`, not the level.
  ctx.select((s) => s.muted, (muted) => b.setLabel(muted ? 'unmute' : 'mute'), { immediate: true });
  ctx.listen(
    b.el,
    'wheel',
    (e) => {
      e.preventDefault();
      ctx.user('setVolume', (e as WheelEvent).deltaY < 0 ? '+0.05' : '-0.05');
    },
    { passive: false },
  );
  return { el: b.el };
};

export const fullscreenComponent: ComponentFactory = (ctx) => {
  const b = createIconButton(ctx, 'vp-fullscreen', () => ctx.user('toggleFullscreen'));
  ctx.select(
    (s) => s.fullscreen,
    (fs) => {
      b.setIcon(fs ? 'fullscreen-exit' : 'fullscreen');
      b.setLabel(fs ? 'exitFullscreen' : 'fullscreen');
    },
    { immediate: true },
  );
  return { el: b.el };
};

export const settingsComponent: ComponentFactory = (ctx) => {
  const b = createIconButton(ctx, 'vp-settings', () => ctx.menus.toggle());
  b.setIcon('settings');
  b.setLabel('settings');
  b.el.dataset.vpMenuToggle = '';
  b.el.setAttribute('aria-haspopup', 'menu');
  b.el.setAttribute('aria-expanded', 'false');
  ctx.on('ui:menu', ({ open }) => b.el.setAttribute('aria-expanded', String(open)));
  return { el: b.el };
};
```

- [ ] **Step 4: Implement `src/components/volume.ts`**

```ts
import type { ComponentFactory } from '../types';
import { createSlider } from '../ui/slider';

export const volumeComponent: ComponentFactory = (ctx) => {
  const slider = createSlider(ctx, {
    className: 'vp-volume',
    label: ctx.t('volume'),
    onInput: (value) => ctx.user('setVolume', value),
  });
  ctx.select((s) => (s.muted ? 0 : s.volume), (v) => slider.set(v, `${Math.round(v * 100)}%`), { immediate: true });
  ctx.listen(
    slider.el,
    'wheel',
    (e) => {
      e.preventDefault();
      ctx.user('setVolume', (e as WheelEvent).deltaY < 0 ? '+0.05' : '-0.05');
    },
    { passive: false },
  );
  return { el: slider.el };
};
```

- [ ] **Step 5: Implement `src/components/timeline.ts`**

```ts
import type { ComponentFactory } from '../types';
import { h } from '../ui/dom';
import { clamp } from '../shared/clamp';
import { formatTime } from '../shared/time';

export const timelineComponent: ComponentFactory = (ctx) => {
  const buffered = h('div', { class: 'vp-timeline-buffered' });
  const progress = h('div', { class: 'vp-timeline-progress' });
  const thumb = h('div', { class: 'vp-timeline-thumb' });
  const el = h(
    'div',
    { class: 'vp-timeline', role: 'slider', tabindex: 0, 'aria-label': ctx.t('timeline'), 'aria-valuemin': 0 },
    h('div', { class: 'vp-timeline-track' }, buffered, progress, thumb),
  );
  let dragging = false;
  let dragTime = 0;

  const paint = (time: number, duration: number, bufferedEnd: number) => {
    const pct = duration > 0 ? clamp(time / duration, 0, 1) * 100 : 0;
    progress.style.width = `${pct}%`;
    thumb.style.left = `${pct}%`;
    buffered.style.width = duration > 0 ? `${clamp(bufferedEnd / duration, 0, 1) * 100}%` : '0%';
    el.setAttribute('aria-valuemax', String(Math.floor(duration)));
    el.setAttribute('aria-valuenow', String(Math.floor(time)));
    el.setAttribute('aria-valuetext', `${formatTime(time, duration)} / ${formatTime(duration, duration)}`);
  };

  const position = (clientX: number) => {
    const r = el.getBoundingClientRect();
    const x = clamp(clientX - r.left, 0, r.width);
    const duration = ctx.store.get().duration;
    const rootX = r.left - ctx.root.getBoundingClientRect().left + x;
    return { time: r.width > 0 ? (x / r.width) * duration : 0, x, rootX, width: r.width };
  };

  // No seeking on live streams, regardless of the layout's hide rules.
  ctx.select((s) => s.live, (live) => el.classList.toggle('vp-timeline-live', live), { immediate: true });

  ctx.select(
    (s) => [s.currentTime, s.duration, s.buffered] as const,
    ([t, d, b]) => {
      if (!dragging) paint(t, d, b);
    },
    { immediate: true, equals: (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2] },
  );

  ctx.listen(el, 'pointerdown', (e) => {
    const pe = e as PointerEvent;
    e.stopPropagation();
    const s = ctx.store.get();
    if (!(s.duration > 0)) return;
    dragging = true;
    el.classList.add('vp-dragging');
    ctx.events.emit('ui:drag', { active: true });
    try {
      el.setPointerCapture?.(pe.pointerId);
    } catch {
      /* synthetic events have no active pointer */
    }
    dragTime = position(pe.clientX).time;
    paint(dragTime, s.duration, s.buffered);
  });

  ctx.listen(el, 'pointermove', (e) => {
    const pos = position((e as PointerEvent).clientX);
    ctx.events.emit('ui:timeline-hover', pos);
    if (dragging) {
      dragTime = pos.time;
      const s = ctx.store.get();
      paint(dragTime, s.duration, s.buffered);
    }
  });

  ctx.listen(el, 'pointerup', (e) => {
    if (!dragging) return;
    dragTime = position((e as PointerEvent).clientX).time;
    dragging = false;
    el.classList.remove('vp-dragging');
    ctx.events.emit('ui:drag', { active: false });
    ctx.events.emit('line', dragTime);
    ctx.user('seek', dragTime);
  });

  ctx.listen(el, 'pointercancel', () => {
    if (!dragging) return;
    dragging = false;
    el.classList.remove('vp-dragging');
    ctx.events.emit('ui:drag', { active: false });
    const s = ctx.store.get();
    paint(s.currentTime, s.duration, s.buffered);
  });

  ctx.listen(el, 'pointerleave', () => {
    if (!dragging) ctx.events.emit('ui:timeline-leave');
  });

  ctx.listen(el, 'click', (e) => e.stopPropagation());

  ctx.listen(el, 'keydown', (e) => {
    const key = (e as KeyboardEvent).key;
    const target = key === 'ArrowRight' ? '+5' : key === 'ArrowLeft' ? '-5' : key === 'Home' ? 0 : key === 'End' ? ctx.store.get().duration : null;
    if (target === null) return;
    e.preventDefault();
    e.stopPropagation();
    ctx.user('seek', target);
  });

  return { el };
};
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run tests/components/controls.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/buttons.ts src/components/volume.ts src/components/timeline.ts tests/components/controls.test.ts
git commit -m "feat(components): add playback buttons, volume slider and timeline"
```

### Task 4.4: Component registration and default layout

**Files:**
- Create: `src/components/index.ts`, `src/ui/default-layout.ts`
- Test: `tests/components/default-layout.test.ts`

- [ ] **Step 1: Write the failing test `tests/components/default-layout.test.ts`**

```ts
import { describe, expect, it, vi } from 'vitest';
import { createUIHarness } from '../helpers/ui-harness';
import { registerBuiltinComponents, BUILTIN_COMPONENTS } from '../../src/components';
import { defaultLayout } from '../../src/ui/default-layout';

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

  it('lists every built-in type', () => {
    expect(Object.keys(BUILTIN_COMPONENTS).sort()).toEqual(
      ['big-play', 'buffering', 'duration', 'error-overlay', 'fullscreen', 'group', 'live', 'media-click-layer', 'mute', 'overlay', 'play', 'root', 'settings', 'spacer', 'text', 'time', 'timeline', 'title', 'toolbar', 'volume'].sort(),
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/components/default-layout.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `src/components/index.ts`**

```ts
import type { ComponentFactory } from '../types';
import type { Registry } from '../ui/registry';
import { groupComponent, overlayComponent, rootComponent, spacerComponent, textComponent, toolbarComponent } from './containers';
import { bigPlayComponent, fullscreenComponent, muteComponent, playComponent, settingsComponent } from './buttons';
import { bufferingComponent, durationComponent, errorOverlayComponent, liveComponent, mediaClickLayerComponent, timeComponent, titleComponent } from './indicators';
import { volumeComponent } from './volume';
import { timelineComponent } from './timeline';

export const BUILTIN_COMPONENTS: Record<string, ComponentFactory<any>> = {
  root: rootComponent,
  overlay: overlayComponent,
  toolbar: toolbarComponent,
  group: groupComponent,
  spacer: spacerComponent,
  text: textComponent,
  'media-click-layer': mediaClickLayerComponent,
  play: playComponent,
  'big-play': bigPlayComponent,
  mute: muteComponent,
  volume: volumeComponent,
  timeline: timelineComponent,
  time: timeComponent,
  duration: durationComponent,
  title: titleComponent,
  buffering: bufferingComponent,
  live: liveComponent,
  fullscreen: fullscreenComponent,
  settings: settingsComponent,
  'error-overlay': errorOverlayComponent,
};

export function registerBuiltinComponents(registry: Registry<ComponentFactory<any>>): void {
  for (const [type, factory] of Object.entries(BUILTIN_COMPONENTS)) registry.register(type, factory);
}

export * from './containers';
export * from './buttons';
export * from './indicators';
export * from './volume';
export * from './timeline';
```

- [ ] **Step 4: Implement `src/ui/default-layout.ts`**

```ts
import type { LayoutNode } from '../types';

/** The default PlayerJS-like layout. Copy and modify it to build your own. */
export const defaultLayout: LayoutNode = {
  type: 'root',
  children: [
    { type: 'media-click-layer' },
    {
      type: 'overlay',
      children: [
        { type: 'title', anchor: 'top-left', hide: ['idle'] },
        { type: 'buffering', anchor: 'center', hide: ['not-waiting'] },
        { type: 'big-play', anchor: 'center', hide: ['started'] },
        { type: 'error-overlay', anchor: 'center', hide: ['not-error'] },
      ],
    },
    {
      type: 'toolbar',
      hide: ['idle'],
      children: [
        { type: 'timeline' },
        {
          type: 'group',
          direction: 'row',
          className: 'vp-controls',
          children: [
            { type: 'prev', optional: true, hide: ['first-item'] },
            { type: 'play' },
            { type: 'next', optional: true, hide: ['last-item'] },
            { type: 'mute' },
            { type: 'volume', hide: [{ maxWidth: 400 }] },
            { type: 'time' },
            { type: 'text', text: '/', className: 'vp-time-sep', hide: ['live'] },
            { type: 'duration', hide: ['live'] },
            { type: 'live', hide: ['not-live'] },
            { type: 'spacer', flex: 1 },
            { type: 'settings', hide: ['no-menus'] },
            { type: 'playlist-button', optional: true, hide: ['no-playlist'] },
            { type: 'fullscreen' },
          ],
        },
      ],
    },
  ],
};
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/components/default-layout.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/index.ts src/ui/default-layout.ts tests/components/default-layout.test.ts
git commit -m "feat(components): register built-ins and add default layout"
```

### Task 4.5: Theme CSS

**Files:**
- Create: `src/theme/player.css`

No unit test (visual); verified in the browser in chunk 9. Plugins append their own rules to this file in chunk 7 (sections are marked).

- [ ] **Step 1: Create `src/theme/player.css`**

```css
/* ===== Root & theme variables ===== */
.vp-root {
  --vp-color-1: #00a3ff;
  --vp-color-2: #ffffff;
  --vp-color-3: rgba(18, 18, 18, 0.94);
  --vp-toolbar-bg: linear-gradient(to top, rgba(0, 0, 0, 0.8), rgba(0, 0, 0, 0));
  --vp-font: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --vp-font-size: 14px;
  --vp-radius: 6px;
  --vp-icon-size: 24px;
  --vp-timeline-height: 4px;
  --vp-sub-color: #ffffff;
  --vp-sub-bg: rgba(0, 0, 0, 0.6);
  --vp-sub-size: 1.4em;

  position: relative;
  width: 100%;
  overflow: hidden;
  background: #000;
  color: var(--vp-color-2);
  font-family: var(--vp-font);
  font-size: var(--vp-font-size);
  line-height: 1.25;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
  container-type: inline-size;
  outline: none;
}
.vp-root *,
.vp-root *::before,
.vp-root *::after {
  box-sizing: border-box;
}
.vp-root:fullscreen {
  width: 100%;
  height: 100%;
  aspect-ratio: auto !important;
}
.vp-root:-webkit-full-screen {
  width: 100%;
  height: 100%;
  aspect-ratio: auto !important;
}
.vp-root.vp-idle {
  cursor: none;
}

/* ===== Layers ===== */
.vp-media,
.vp-ui,
.vp-layer-below,
.vp-layout,
.vp-layer-above,
.vp-layout-root,
.vp-overlay,
.vp-click-layer {
  position: absolute;
  inset: 0;
}
.vp-media video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #000;
}
.vp-layer-below,
.vp-layer-above,
.vp-overlay {
  pointer-events: none;
}
.vp-layer-below > *,
.vp-layer-above > *,
.vp-overlay > * {
  pointer-events: auto;
}
.vp-click-layer {
  cursor: pointer;
}

/* ===== Visibility ===== */
.vp-toolbar,
.vp-title,
.vp-big-play,
.vp-buffering,
.vp-error,
.vp-anchor {
  transition: opacity 0.25s ease, visibility 0.25s ease;
}
.vp-hidden {
  opacity: 0 !important;
  visibility: hidden !important;
  pointer-events: none !important;
}

/* ===== Anchors ===== */
.vp-anchor {
  position: absolute;
}
.vp-anchor-top-left { top: 12px; left: 12px; }
.vp-anchor-top { top: 12px; left: 50%; translate: -50% 0; }
.vp-anchor-top-right { top: 12px; right: 12px; }
.vp-anchor-left { top: 50%; left: 12px; translate: 0 -50%; }
.vp-anchor-center { top: 50%; left: 50%; translate: -50% -50%; }
.vp-anchor-right { top: 50%; right: 12px; translate: 0 -50%; }
.vp-anchor-bottom-left { bottom: 12px; left: 12px; }
.vp-anchor-bottom { bottom: 12px; left: 50%; translate: -50% 0; }
.vp-anchor-bottom-right { bottom: 12px; right: 12px; }

/* ===== Toolbar & groups ===== */
.vp-toolbar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 28px 10px 6px;
  background: var(--vp-toolbar-bg);
}
.vp-group {
  display: flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
}
.vp-group-column {
  flex-direction: column;
  align-items: stretch;
}
.vp-spacer {
  flex: 1 1 auto;
}

/* ===== Buttons & icons ===== */
.vp-button {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 6px;
  border: 0;
  border-radius: var(--vp-radius);
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.vp-button:hover {
  background: rgba(255, 255, 255, 0.12);
}
.vp-button:focus-visible,
.vp-timeline:focus-visible,
.vp-slider:focus-visible,
.vp-menu button:focus-visible {
  outline: 2px solid var(--vp-color-1);
  outline-offset: 1px;
}
.vp-icon {
  display: inline-flex;
  width: var(--vp-icon-size);
  height: var(--vp-icon-size);
}
.vp-icon svg {
  width: 100%;
  height: 100%;
}
.vp-big-play {
  width: 76px;
  height: 76px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
  --vp-icon-size: 44px;
}
.vp-big-play:hover {
  background: var(--vp-color-1);
}

/* ===== Text indicators ===== */
.vp-time,
.vp-duration,
.vp-text {
  padding: 0 2px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.vp-title {
  max-width: calc(100% - 24px);
  overflow: hidden;
  font-size: 1.15em;
  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
}
.vp-title:empty {
  display: none;
}
.vp-live {
  padding: 2px 6px;
  font-size: 0.85em;
  font-weight: 700;
  letter-spacing: 0.05em;
}
.vp-live-dot {
  color: #ff3b30;
}
.vp-buffering {
  width: 52px;
  height: 52px;
  border: 4px solid rgba(255, 255, 255, 0.25);
  border-top-color: var(--vp-color-2);
  border-radius: 50%;
  animation: vp-spin 0.9s linear infinite;
  pointer-events: none !important;
}
@keyframes vp-spin {
  to {
    rotate: 360deg;
  }
}
.vp-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  max-width: 80%;
  padding: 16px 20px;
  border-radius: var(--vp-radius);
  background: rgba(0, 0, 0, 0.78);
  text-align: center;
}
.vp-error-retry {
  padding: 6px 14px;
  border: 1px solid rgba(255, 255, 255, 0.4);
}

/* ===== Timeline ===== */
.vp-timeline-live {
  display: none !important;
}
.vp-timeline {
  position: relative;
  display: flex;
  align-items: center;
  height: 18px;
  cursor: pointer;
  touch-action: none;
}
.vp-timeline-track {
  position: relative;
  width: 100%;
  height: var(--vp-timeline-height);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.25);
  transition: height 0.15s ease;
}
.vp-timeline:hover .vp-timeline-track,
.vp-timeline.vp-dragging .vp-timeline-track {
  height: calc(var(--vp-timeline-height) * 1.6);
}
.vp-timeline-buffered,
.vp-timeline-progress {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  border-radius: inherit;
}
.vp-timeline-buffered {
  background: rgba(255, 255, 255, 0.35);
}
.vp-timeline-progress {
  background: var(--vp-color-1);
}
.vp-timeline-thumb {
  position: absolute;
  top: 50%;
  width: 13px;
  height: 13px;
  margin: -6.5px 0 0 -6.5px;
  border-radius: 50%;
  background: var(--vp-color-1);
  scale: 0;
  transition: scale 0.15s ease;
}
.vp-timeline:hover .vp-timeline-thumb,
.vp-timeline.vp-dragging .vp-timeline-thumb {
  scale: 1;
}

/* ===== Slider (volume) ===== */
.vp-slider {
  position: relative;
  display: flex;
  align-items: center;
  width: 72px;
  height: 24px;
  margin: 0 6px 0 2px;
  cursor: pointer;
  touch-action: none;
}
.vp-slider-track {
  position: relative;
  width: 100%;
  height: 4px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.3);
}
.vp-slider-fill {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  border-radius: inherit;
  background: var(--vp-color-2);
}

/* ===== Settings menu ===== */
.vp-menu {
  position: absolute;
  right: 12px;
  bottom: 64px;
  min-width: 210px;
  max-height: calc(100% - 80px);
  overflow-y: auto;
  padding: 6px 0;
  border-radius: var(--vp-radius);
  background: var(--vp-color-3);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  font-size: 0.95em;
}
.vp-menu-left {
  right: auto;
  left: 12px;
}
.vp-menu-center {
  right: auto;
  left: 50%;
  translate: -50% 0;
}
.vp-menu button {
  all: unset;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 14px;
  cursor: pointer;
}
.vp-menu button:hover {
  background: rgba(255, 255, 255, 0.1);
}
.vp-menu-label {
  flex: 1;
}
.vp-menu-value {
  opacity: 0.7;
}
.vp-menu-check {
  display: inline-flex;
  width: 18px;
  --vp-icon-size: 18px;
}
.vp-menu-item.vp-active {
  color: var(--vp-color-1);
}
.vp-menu-back,
.vp-menu-title {
  margin-bottom: 4px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
  font-weight: 600;
  --vp-icon-size: 18px;
}
.vp-menu-title {
  padding: 8px 14px;
}

/* ===== Small players ===== */
@container (max-width: 480px) {
  .vp-ui {
    --vp-icon-size: 20px;
    --vp-font-size: 13px;
  }
  .vp-toolbar {
    padding: 18px 4px 2px;
  }
}

/* ===== Plugins (appended in chunk 7) ===== */
```

- [ ] **Step 2: Commit**

```bash
git add src/theme/player.css
git commit -m "feat(theme): add player stylesheet with CSS custom properties"
```
