## Chunk 3: UI infrastructure

Delivers: DOM helper (with safe SVG parsing), i18n, default icons, registries, hide rules, action strings, the settings `MenuHost`, `UserActivity` (autohide), base-prop application and the `LayoutEngine`, plus a reusable UI test harness.

Spec references: §6.1–6.4, §6.6, §6.8 (icons, i18n).

Security rule for the whole UI: never assign `innerHTML`. Text goes through `textContent`/`h()`; SVG icons go through `iconEl()`, which parses with `DOMParser('image/svg+xml')` and strips `<script>`, `<foreignObject>`, `on*` attributes and `javascript:` URLs.

### Task 3.1: DOM helper, i18n and icons

**Files:**
- Create: `src/ui/dom.ts`, `src/ui/i18n.ts`, `src/ui/icons.ts`
- Test: `tests/ui/basics.test.ts`

- [ ] **Step 1: Write the failing test `tests/ui/basics.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { h, iconEl } from '../../src/ui/dom';
import { createTranslator } from '../../src/ui/i18n';
import { defaultIcons, createIconSet } from '../../src/ui/icons';

describe('h', () => {
  it('creates elements with attributes and children', () => {
    const el = h('button', { class: 'a b', type: 'button', disabled: true, hidden: false, 'data-x': 1 }, 'Play', null, h('span'));
    expect(el.className).toBe('a b');
    expect(el.getAttribute('type')).toBe('button');
    expect(el.hasAttribute('disabled')).toBe(true);
    expect(el.hasAttribute('hidden')).toBe(false);
    expect(el.dataset.x).toBe('1');
    expect(el.textContent).toBe('Play');
    expect(el.querySelector('span')).not.toBeNull();
  });
});

describe('iconEl', () => {
  it('parses svg into the SVG namespace', () => {
    const el = iconEl('<svg viewBox="0 0 24 24"><path d="M0 0h1"/></svg>');
    expect(el.className).toBe('vp-icon');
    expect(el.getAttribute('aria-hidden')).toBe('true');
    const svg = el.querySelector('svg')!;
    expect(svg.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(svg.querySelector('path')).not.toBeNull();
  });

  it('strips scripts, event handlers and javascript urls', () => {
    const el = iconEl('<svg onload="alert(1)"><script>alert(2)</script><a href="javascript:alert(3)"><path d="M0 0"/></a><foreignObject><div/></foreignObject></svg>');
    const svg = el.querySelector('svg')!;
    expect(svg.hasAttribute('onload')).toBe(false);
    expect(el.querySelector('script')).toBeNull();
    expect(el.querySelector('foreignObject')).toBeNull();
    expect(el.querySelector('a')!.hasAttribute('href')).toBe(false);
  });

  it('ignores invalid markup', () => {
    expect(iconEl('<div>not svg</div>').childElementCount).toBe(0);
    expect(iconEl('<svg><unclosed></svg').childElementCount).toBe(0);
  });
});

describe('createTranslator', () => {
  it('translates with fallback to the key and overrides', () => {
    const ru = createTranslator('ru');
    expect(ru('quality')).toBe('Качество');
    expect(ru('Мой текст')).toBe('Мой текст');
    const en = createTranslator('en', { quality: 'Resolution' });
    expect(en('quality')).toBe('Resolution');
    expect(en('speed')).toBe('Speed');
  });
});

describe('icons', () => {
  it('provides every icon and allows overrides', () => {
    expect(defaultIcons.play).toContain('<svg');
    const icons = createIconSet({ play: '<svg id="custom"></svg>' });
    expect(icons('play')).toContain('custom');
    expect(icons('pause')).toBe(defaultIcons.pause);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/ui/basics.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `src/ui/dom.ts`**

```ts
export type Attrs = Record<string, string | number | boolean | null | undefined>;
export type Child = Node | string | null | undefined | false;

const SVG_NS = 'http://www.w3.org/2000/svg';

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = String(value);
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children) if (child !== null && child !== undefined && child !== false) el.append(child);
  return el;
}

function sanitizeSvg(root: Element): void {
  for (const bad of [...root.querySelectorAll('script, foreignObject')]) bad.remove();
  for (const node of [root, ...root.querySelectorAll('*')]) {
    for (const attr of [...node.attributes]) {
      if (/^on/i.test(attr.name) || /^\s*javascript:/i.test(attr.value)) node.removeAttribute(attr.name);
    }
  }
}

/** Parses an SVG string (never as HTML) and returns it wrapped in a `.vp-icon` span. */
export function parseSvg(markup: string): SVGElement | null {
  const source = /xmlns\s*=/.test(markup) ? markup : markup.replace(/<svg\b/, `<svg xmlns="${SVG_NS}"`);
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(source, 'image/svg+xml');
  } catch {
    return null;
  }
  const root = doc.documentElement;
  if (!root || root.namespaceURI !== SVG_NS || root.localName !== 'svg' || doc.getElementsByTagName('parsererror').length) return null;
  sanitizeSvg(root);
  return document.importNode(root, true) as unknown as SVGElement;
}

export function iconEl(markup: string): HTMLSpanElement {
  const span = h('span', { class: 'vp-icon', 'aria-hidden': 'true' });
  const svg = parseSvg(markup);
  if (svg) span.append(svg);
  return span;
}
```

- [ ] **Step 4: Implement `src/ui/i18n.ts`**

```ts
export type Dictionary = Record<string, string>;

export const dictionaries: Record<'ru' | 'en', Dictionary> = {
  ru: {
    play: 'Воспроизвести',
    pause: 'Пауза',
    replay: 'Повторить',
    mute: 'Выключить звук',
    unmute: 'Включить звук',
    volume: 'Громкость',
    fullscreen: 'Полный экран',
    exitFullscreen: 'Выйти из полноэкранного режима',
    settings: 'Настройки',
    playlist: 'Плейлист',
    prev: 'Предыдущий',
    next: 'Следующий',
    timeline: 'Перемотка',
    quality: 'Качество',
    speed: 'Скорость',
    subtitles: 'Субтитры',
    audio: 'Аудио',
    off: 'Выкл',
    auto: 'Авто',
    normal: 'Обычная',
    back: 'Назад',
    live: 'LIVE',
    retry: 'Повторить',
    'error.network': 'Ошибка сети',
    'error.decode': 'Не удалось декодировать видео',
    'error.not-found': 'Видео не найдено',
    'error.unsupported': 'Формат не поддерживается',
    'error.unknown': 'Ошибка воспроизведения',
  },
  en: {
    play: 'Play',
    pause: 'Pause',
    replay: 'Replay',
    mute: 'Mute',
    unmute: 'Unmute',
    volume: 'Volume',
    fullscreen: 'Fullscreen',
    exitFullscreen: 'Exit fullscreen',
    settings: 'Settings',
    playlist: 'Playlist',
    prev: 'Previous',
    next: 'Next',
    timeline: 'Seek',
    quality: 'Quality',
    speed: 'Speed',
    subtitles: 'Subtitles',
    audio: 'Audio',
    off: 'Off',
    auto: 'Auto',
    normal: 'Normal',
    back: 'Back',
    live: 'LIVE',
    retry: 'Retry',
    'error.network': 'Network error',
    'error.decode': 'The video could not be decoded',
    'error.not-found': 'Video not found',
    'error.unsupported': 'Format not supported',
    'error.unknown': 'Playback error',
  },
};

export function createTranslator(lang: 'ru' | 'en' = 'ru', overrides: Partial<Dictionary> = {}): (key: string) => string {
  const dict: Dictionary = { ...(dictionaries[lang] ?? dictionaries.ru) };
  for (const [k, v] of Object.entries(overrides)) if (v !== undefined) dict[k] = v;
  return (key) => dict[key] ?? key;
}
```

- [ ] **Step 5: Implement `src/ui/icons.ts`**

```ts
import type { IconName } from '../types';

const svg = (path: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" focusable="false">${path}</svg>`;

export const defaultIcons: Record<IconName, string> = {
  play: svg('<path d="M8 5v14l11-7z"/>'),
  pause: svg('<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>'),
  replay: svg('<path d="M12 5V1L7 6l5 5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z"/>'),
  'volume-high': svg('<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/>'),
  'volume-low': svg('<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4z"/>'),
  'volume-mute': svg('<path d="M3 9v6h4l5 5V4L7 9H3zm13.6 3 2.7-2.7-1.4-1.4-2.7 2.7-2.7-2.7-1.4 1.4 2.7 2.7-2.7 2.7 1.4 1.4 2.7-2.7 2.7 2.7 1.4-1.4z"/>'),
  fullscreen: svg('<path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>'),
  'fullscreen-exit': svg('<path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>'),
  settings: svg('<path d="M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.3 7.3 0 0 0-1.7-1L15 3.3h-4l-.4 2.6a7.3 7.3 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1c.5.4 1.1.7 1.7 1l.4 2.6h4l.4-2.6c.6-.3 1.2-.6 1.7-1l2.5 1 2-3.5zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"/>'),
  playlist: svg('<path d="M3 6h12v2H3zm0 5h12v2H3zm0 5h8v2H3zm14-5v6l5-3z"/>'),
  prev: svg('<path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/>'),
  next: svg('<path d="M16 6h2v12h-2zM6 18l8.5-6L6 6z"/>'),
  check: svg('<path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/>'),
  back: svg('<path d="M15.4 7.4 14 6l-6 6 6 6 1.4-1.4L10.8 12z"/>'),
};

export function createIconSet(overrides: Partial<Record<IconName, string>> = {}): (name: IconName) => string {
  return (name) => overrides[name] ?? defaultIcons[name];
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run tests/ui/basics.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/ui/dom.ts src/ui/i18n.ts src/ui/icons.ts tests/ui/basics.test.ts
git commit -m "feat(ui): add DOM helper with safe SVG parsing, i18n and icon set"
```

### Task 3.2: Registries and hide rules

**Files:**
- Create: `src/ui/registry.ts`, `src/ui/hide-rules.ts`
- Test: `tests/ui/hide-rules.test.ts`

- [ ] **Step 1: Write the failing test `tests/ui/hide-rules.test.ts`**

```ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/ui/hide-rules.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `src/ui/registry.ts`**

```ts
import type { Logger } from '../types';

export interface Registry<T> {
  register(name: string, item: T): void;
  get(name: string): T | undefined;
  has(name: string): boolean;
}

export function createRegistry<T>(kind: string, log: Logger): Registry<T> {
  const items = new Map<string, T>();
  return {
    register(name, item) {
      if (items.has(name)) log.warn(`${kind} "${name}" replaced`);
      items.set(name, item);
    },
    get: (name) => items.get(name),
    has: (name) => items.has(name),
  };
}
```

- [ ] **Step 4: Implement `src/ui/hide-rules.ts`**

```ts
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
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/ui/hide-rules.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/registry.ts src/ui/hide-rules.ts tests/ui/hide-rules.test.ts
git commit -m "feat(ui): add registries and built-in hide rules"
```

### Task 3.3: Action strings

**Files:**
- Create: `src/ui/actions.ts`
- Test: `tests/ui/actions.test.ts`

- [ ] **Step 1: Write the failing test `tests/ui/actions.test.ts`**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createActionRunner, parseAction } from '../../src/ui/actions';
import { createStore } from '../../src/core/store';
import { createLogger } from '../../src/core/logger';
import { createInitialState } from '../../src/core/initial-state';
import type { MenuHost, Player } from '../../src/types';

describe('parseAction', () => {
  it('parses api chains', () => {
    expect(parseAction('api:seek,-10;play')).toEqual([
      { type: 'api', name: 'seek', args: ['-10'] },
      { type: 'api', name: 'play', args: [] },
    ]);
  });
  it('parses js, event, settings and urls', () => {
    expect(parseAction('js:MyFn,1,{time}')).toEqual([{ type: 'js', fn: 'MyFn', args: ['1', '{time}'] }]);
    expect(parseAction('event:liked')).toEqual([{ type: 'event', name: 'liked' }]);
    expect(parseAction('settings')).toEqual([{ type: 'settings', only: [], align: undefined }]);
    expect(parseAction('settings:speed,quality,left')).toEqual([{ type: 'settings', only: ['speed', 'quality'], align: 'left' }]);
    expect(parseAction('https://a.com/x?t={time}')).toEqual([{ type: 'url', url: 'https://a.com/x?t={time}' }]);
    expect(parseAction('//a.com')).toEqual([{ type: 'url', url: '//a.com' }]);
    expect(parseAction('nonsense')).toEqual([]);
  });
});

describe('createActionRunner', () => {
  afterEach(() => {
    delete (window as any).MyFn;
    delete (window as any).ns;
  });

  function setup() {
    const store = createStore({ ...createInitialState({ container: 'x' }), currentTime: 12.7, duration: 60, title: 'T', url: 'v.mp4' });
    const container = document.createElement('div');
    const api = vi.fn();
    const player = { api, container } as unknown as Player;
    const menus = { open: vi.fn() } as unknown as MenuHost;
    const run = createActionRunner({ player, store, menus, log: createLogger(false) });
    return { run, api, menus, container };
  }

  it('runs api actions with the first argument and placeholders', () => {
    const { run, api } = setup();
    run('api:seek,{time};play');
    expect(api).toHaveBeenNthCalledWith(1, 'seek', '12');
    expect(api).toHaveBeenNthCalledWith(2, 'play', undefined);
  });

  it('calls global functions by path with this binding', () => {
    const { run } = setup();
    (window as any).MyFn = vi.fn();
    (window as any).ns = { obj: { fn: vi.fn(function (this: unknown) { return this; }) } };
    run('js:MyFn,a,{title}');
    run('js:ns.obj.fn');
    expect((window as any).MyFn).toHaveBeenCalledWith('a', 'T');
    expect((window as any).ns.obj.fn).toHaveReturnedWith((window as any).ns.obj);
  });

  it('refuses non-identifier js paths', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { run } = setup();
    run('js:alert(1)');
    expect(console.warn).toHaveBeenCalled();
  });

  it('dispatches events, opens menus and urls', () => {
    const { run, menus, container } = setup();
    const listener = vi.fn();
    container.addEventListener('liked', listener);
    run('event:liked');
    expect(listener).toHaveBeenCalled();
    run('settings:speed,center');
    expect(menus.open).toHaveBeenCalledWith({ only: ['speed'], align: 'center' });
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    run('https://a.com/?t={time}');
    expect(open).toHaveBeenCalledWith('https://a.com/?t=12', '_blank', 'noopener');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/ui/actions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/ui/actions.ts`**

```ts
import type { Logger, MenuHost, Player, PlayerState, Store } from '../types';

export type Align = 'left' | 'center' | 'right';
export type Action =
  | { type: 'api'; name: string; args: string[] }
  | { type: 'js'; fn: string; args: string[] }
  | { type: 'event'; name: string }
  | { type: 'settings'; only: string[]; align: Align | undefined }
  | { type: 'url'; url: string };

const ALIGNS: readonly string[] = ['left', 'center', 'right'];
const PATH_RE = /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/;
const trimAll = (parts: string[]) => parts.map((p) => p.trim());

export function parseAction(input: string): Action[] {
  const s = input.trim();
  if (s.startsWith('api:')) {
    return s
      .slice(4)
      .split(';')
      .map((p) => p.trim())
      .filter(Boolean)
      .map((part) => {
        const [name = '', ...args] = trimAll(part.split(','));
        return { type: 'api' as const, name, args };
      });
  }
  if (s.startsWith('js:')) {
    const [fn = '', ...args] = trimAll(s.slice(3).split(','));
    return [{ type: 'js', fn, args }];
  }
  if (s.startsWith('event:')) return [{ type: 'event', name: s.slice(6).trim() }];
  if (s === 'settings' || s.startsWith('settings:')) {
    const parts = trimAll(s.slice(9).split(',')).filter(Boolean);
    const align = parts.find((p) => ALIGNS.includes(p)) as Align | undefined;
    return [{ type: 'settings', only: parts.filter((p) => p !== align), align }];
  }
  if (/^(https?:)?\/\//.test(s)) return [{ type: 'url', url: s }];
  return [];
}

export interface ActionRunnerDeps {
  player: Player;
  store: Store<PlayerState>;
  menus: MenuHost;
  log: Logger;
}

function resolveGlobal(path: string): { fn: unknown; self: unknown } {
  let self: unknown = window;
  let value: unknown = window;
  for (const key of path.split('.')) {
    self = value;
    value = value == null ? undefined : (value as Record<string, unknown>)[key];
  }
  return { fn: value, self };
}

export function createActionRunner(d: ActionRunnerDeps): (action: string) => void {
  const fill = (value: string) => {
    const s = d.store.get();
    return value.replace(/\{(time|duration|title|file)\}/g, (_m, key: string) => {
      if (key === 'time') return String(Math.floor(s.currentTime));
      if (key === 'duration') return String(Math.floor(s.duration));
      if (key === 'title') return s.title;
      return s.url;
    });
  };

  const execute = (action: Action) => {
    switch (action.type) {
      case 'api': {
        const result = d.player.api(action.name, action.args[0] !== undefined ? fill(action.args[0]) : undefined);
        if (result instanceof Promise) result.catch((e) => d.log.warn(`action api:${action.name} rejected`, e));
        break;
      }
      case 'js': {
        if (!PATH_RE.test(action.fn)) {
          d.log.warn(`invalid js action "${action.fn}"`);
          break;
        }
        const { fn, self } = resolveGlobal(action.fn);
        if (typeof fn !== 'function') {
          d.log.warn(`js action "${action.fn}" is not a function`);
          break;
        }
        fn.apply(self, action.args.map(fill));
        break;
      }
      case 'event':
        d.player.container.dispatchEvent(new CustomEvent(action.name, { detail: d.store.get(), bubbles: true }));
        break;
      case 'settings':
        d.menus.open({ only: action.only.length ? action.only : undefined, align: action.align });
        break;
      case 'url':
        window.open(fill(action.url), '_blank', 'noopener');
        break;
    }
  };

  return (input) => {
    for (const action of parseAction(input)) {
      try {
        execute(action);
      } catch (e) {
        d.log.error(`action "${input}" failed`, e);
      }
    }
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/ui/actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/actions.ts tests/ui/actions.test.ts
git commit -m "feat(ui): parse and run PlayerJS action strings"
```

## Chunk 3b: Menu host, user activity and layout engine

### Task 3.4: MenuHost (settings menu)

**Files:**
- Create: `src/ui/menu-host.ts`
- Test: `tests/ui/menu-host.test.ts`

The panel is appended to the `above-ui` layer. It re-renders only when a signature of visible menus/current values changes (not on every `timeupdate`), so keyboard focus is kept. Elements with `data-vp-menu-toggle` (the settings button) are not "outside" for click-to-close.

- [ ] **Step 1: Write the failing test `tests/ui/menu-host.test.ts`**

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { createMenuHost } from '../../src/ui/menu-host';
import { createStore } from '../../src/core/store';
import { createEventBus } from '../../src/core/events';
import { createLogger } from '../../src/core/logger';
import { createInitialState } from '../../src/core/initial-state';
import { createTranslator } from '../../src/ui/i18n';
import { createIconSet } from '../../src/ui/icons';
import type { MenuDefinition, MenuHost, PlayerState, Store } from '../../src/types';

let store: Store<PlayerState>;
let layer: HTMLElement;
let menus: MenuHost;
let menuEvents: boolean[];

const speedMenu = (): MenuDefinition => ({
  id: 'speed',
  label: 'speed',
  order: 20,
  visible: () => true,
  options: () => [0.5, 1, 2].map((v) => ({ label: v === 1 ? 'Обычная' : String(v), value: v })),
  current: (s) => s.rate,
  select: (v) => store.set({ rate: v as number }),
});
const qualityMenu = (): MenuDefinition => ({
  id: 'quality',
  label: 'quality',
  order: 10,
  visible: (s) => s.qualities.length > 1,
  options: (s) => s.qualities.map((q, i) => ({ label: q.label, value: i })),
  current: (s) => s.quality,
  select: (v) => store.set({ quality: v as number }),
});

const items = () => [...layer.querySelectorAll<HTMLButtonElement>('.vp-menu-item')];
const texts = () => items().map((b) => b.textContent);

beforeEach(() => {
  document.body.replaceChildren();
  store = createStore(createInitialState({ container: 'x' }));
  layer = document.createElement('div');
  document.body.append(layer);
  const events = createEventBus();
  menuEvents = [];
  events.on('ui:menu', ({ open }) => menuEvents.push(open));
  menus = createMenuHost({ layer, store, events, t: createTranslator('ru'), icon: createIconSet(), log: createLogger(false) });
});

describe('MenuHost', () => {
  it('knows whether any menu is visible', () => {
    menus.register(qualityMenu());
    expect(menus.hasVisible(store.get())).toBe(false);
    store.set({ qualities: [{ label: '360p' }, { label: '720p' }] });
    expect(menus.hasVisible(store.get())).toBe(true);
  });

  it('opens a main list sorted by order with current values', () => {
    menus.register(speedMenu());
    menus.register(qualityMenu());
    store.set({ qualities: [{ label: '360p' }, { label: '720p' }], quality: 1 });
    menus.open();
    expect(menus.isOpen).toBe(true);
    expect(texts()).toEqual(['Качество720p', 'СкоростьОбычная']);
    expect(menuEvents).toEqual([true]);
  });

  it('navigates into a submenu, selects and closes', () => {
    menus.register(speedMenu());
    menus.register(qualityMenu());
    store.set({ qualities: [{ label: '360p' }, { label: '720p' }] });
    menus.open();
    items()[1]!.click();
    expect(texts()).toEqual(['0.5', 'Обычная', '2']);
    expect(items()[1]!.getAttribute('aria-checked')).toBe('true');
    items()[2]!.click();
    expect(store.get().rate).toBe(2);
    expect(menus.isOpen).toBe(false);
    expect(menuEvents).toEqual([true, false]);
  });

  it('opens a single visible menu directly as a submenu', () => {
    menus.register(speedMenu());
    menus.open();
    expect(texts()).toEqual(['0.5', 'Обычная', '2']);
    expect(layer.querySelector('.vp-menu-back')).toBeNull();
  });

  it('filters by only and goes back', () => {
    menus.register(speedMenu());
    menus.register(qualityMenu());
    store.set({ qualities: [{ label: '360p' }, { label: '720p' }], quality: 1 });
    menus.open({ only: ['quality'] });
    expect(texts()).toEqual(['360p', '720p']);
    menus.close();
    menus.open();
    items()[0]!.click();
    layer.querySelector<HTMLButtonElement>('.vp-menu-back')!.click();
    expect(texts()).toEqual(['Качество720p', 'СкоростьОбычная']);
  });

  it('closes on outside pointerdown and Escape but not on the toggle button', () => {
    menus.register(speedMenu());
    const toggle = document.createElement('button');
    toggle.dataset.vpMenuToggle = '';
    document.body.append(toggle);
    menus.open();
    toggle.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(menus.isOpen).toBe(true);
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(menus.isOpen).toBe(false);
    menus.open();
    layer.querySelector('.vp-menu')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(menus.isOpen).toBe(false);
  });

  it('does not open without visible menus', () => {
    menus.register(qualityMenu());
    menus.open();
    expect(menus.isOpen).toBe(false);
    expect(menuEvents).toEqual([]);
  });

  it('toggle and dispose', () => {
    menus.register(speedMenu());
    menus.toggle();
    expect(menus.isOpen).toBe(true);
    menus.toggle();
    expect(menus.isOpen).toBe(false);
    menus.open();
    menus.dispose();
    expect(layer.children).toHaveLength(0);
  });

  it('does not rebuild on unrelated state changes', () => {
    menus.register(speedMenu());
    menus.open();
    const first = items()[0];
    store.set({ currentTime: 5 });
    expect(items()[0]).toBe(first);
    store.set({ rate: 2 });
    expect(items()[0]).not.toBe(first);
  });

  it('unregister removes a menu', () => {
    const off = menus.register(speedMenu());
    off();
    expect(menus.hasVisible(store.get())).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/ui/menu-host.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/ui/menu-host.ts`**

```ts
import type { EventBus, IconName, Logger, MenuDefinition, MenuHost, PlayerState, Store } from '../types';
import { h, iconEl } from './dom';

export interface MenuHostDeps {
  layer: HTMLElement;
  store: Store<PlayerState>;
  events: EventBus;
  t: (key: string) => string;
  icon: (name: IconName) => string;
  log: Logger;
}

type OpenOptions = { only?: string[]; align?: 'left' | 'center' | 'right' };

export function createMenuHost(d: MenuHostDeps): MenuHost {
  const defs: MenuDefinition[] = [];
  let panel: HTMLElement | null = null;
  let opts: OpenOptions = {};
  let view: string | null = null;
  let unsubscribe: (() => void) | null = null;

  const visibleDefs = (s: PlayerState) =>
    defs
      .filter((def) => (!opts.only || opts.only.includes(def.id)) && def.visible(s))
      .sort((a, b) => (a.order ?? 100) - (b.order ?? 100));

  const currentLabel = (def: MenuDefinition, s: PlayerState) => {
    const cur = def.current(s);
    return def.options(s).find((o) => Object.is(o.value, cur))?.label ?? '';
  };

  const signature = (s: PlayerState) =>
    visibleDefs(s)
      .map((def) => `${def.id}:${currentLabel(def, s)}:${def.options(s).map((o) => o.label).join(',')}`)
      .join('|');

  const focusFirst = () => panel?.querySelector<HTMLButtonElement>('button')?.focus();

  const button = (cls: string, onClick: () => void, ...children: Array<Node | string>) => {
    const b = h('button', { class: cls, type: 'button' }, ...children);
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
    return b;
  };

  const render = () => {
    if (!panel) return;
    const s = d.store.get();
    const list = visibleDefs(s);
    if (!list.length) {
      host.close();
      return;
    }
    if (view === null && list.length === 1) view = list[0]!.id;
    const def = view ? list.find((x) => x.id === view) : undefined;
    if (view && !def) view = null;

    panel.replaceChildren();
    if (def) {
      if (list.length > 1) {
        panel.append(
          button(
            'vp-menu-back',
            () => {
              view = null;
              render();
              focusFirst();
            },
            iconEl(d.icon('back')),
            h('span', {}, d.t(def.label)),
          ),
        );
      } else {
        panel.append(h('div', { class: 'vp-menu-title' }, d.t(def.label)));
      }
      const cur = def.current(s);
      for (const option of def.options(s)) {
        const active = Object.is(option.value, cur);
        const item = button(
          `vp-menu-item${active ? ' vp-active' : ''}`,
          () => {
            def.select(option.value);
            host.close();
          },
          h('span', { class: 'vp-menu-check' }, active ? iconEl(d.icon('check')) : ''),
          h('span', { class: 'vp-menu-label' }, option.label),
        );
        item.setAttribute('role', 'menuitemradio');
        item.setAttribute('aria-checked', String(active));
        panel.append(item);
      }
    } else {
      for (const x of list) {
        const item = button(
          'vp-menu-item vp-menu-main',
          () => {
            view = x.id;
            render();
            focusFirst();
          },
          h('span', { class: 'vp-menu-label' }, d.t(x.label)),
          h('span', { class: 'vp-menu-value' }, currentLabel(x, s)),
        );
        item.setAttribute('role', 'menuitem');
        panel.append(item);
      }
    }
  };

  const onOutside = (e: Event) => {
    const target = e.target as Element | null;
    if (!panel || (target && (panel.contains(target) || target.closest?.('[data-vp-menu-toggle]')))) return;
    host.close();
  };

  const onKey = (e: KeyboardEvent) => {
    if (!panel) return;
    const buttons = [...panel.querySelectorAll<HTMLButtonElement>('button')];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') {
      host.close();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const step = e.key === 'ArrowDown' ? 1 : -1;
      buttons[(index + step + buttons.length) % buttons.length]?.focus();
    } else if (e.key === 'ArrowLeft') {
      panel.querySelector<HTMLButtonElement>('.vp-menu-back')?.click();
    } else if (e.key !== 'ArrowRight') {
      return;
    }
    // Handled (ArrowRight is swallowed): keep player hotkeys from also seeking/changing volume.
    e.preventDefault();
    e.stopPropagation();
  };

  const host: MenuHost = {
    register(def) {
      defs.push(def);
      if (panel) render();
      return () => {
        const i = defs.indexOf(def);
        if (i >= 0) defs.splice(i, 1);
        if (panel) render();
      };
    },

    open(o = {}) {
      if (panel) host.close();
      opts = o;
      if (!visibleDefs(d.store.get()).length) return;
      view = null;
      panel = h('div', { class: `vp-menu vp-menu-${o.align ?? 'right'}`, role: 'menu' });
      d.layer.append(panel);
      render();
      if (!panel) return;
      unsubscribe = d.store.select(signature, render);
      document.addEventListener('pointerdown', onOutside, true);
      panel.addEventListener('keydown', onKey);
      d.events.emit('ui:menu', { open: true });
      focusFirst();
    },

    close() {
      if (!panel) return;
      panel.removeEventListener('keydown', onKey);
      panel.remove();
      panel = null;
      unsubscribe?.();
      unsubscribe = null;
      document.removeEventListener('pointerdown', onOutside, true);
      d.events.emit('ui:menu', { open: false });
    },

    toggle() {
      if (panel) host.close();
      else host.open();
    },

    get isOpen() {
      return panel !== null;
    },

    hasVisible: (s) => defs.some((def) => def.visible(s)),

    dispose() {
      host.close();
      defs.length = 0;
    },
  };
  return host;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/ui/menu-host.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/menu-host.ts tests/ui/menu-host.test.ts
git commit -m "feat(ui): add settings menu host"
```

### Task 3.5: UserActivity (autohide)

**Files:**
- Create: `src/ui/activity.ts`
- Test: `tests/ui/activity.test.ts`

- [ ] **Step 1: Write the failing test `tests/ui/activity.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createUserActivity, type UserActivity } from '../../src/ui/activity';
import { createStore } from '../../src/core/store';
import { createEventBus } from '../../src/core/events';
import { createInitialState } from '../../src/core/initial-state';
import type { EventBus, PlayerState, Store } from '../../src/types';

let store: Store<PlayerState>;
let events: EventBus;
let root: HTMLElement;
let activity: UserActivity;

const fire = (type: string, props: Record<string, unknown> = {}) =>
  root.dispatchEvent(Object.assign(new Event(type, { bubbles: true }), props));

beforeEach(() => {
  vi.useFakeTimers();
  store = createStore({ ...createInitialState({ container: 'x' }), started: true, status: 'playing' });
  events = createEventBus();
  root = document.createElement('div');
  activity = createUserActivity({ root, store, events, timeout: 3000 });
});
afterEach(() => {
  activity.dispose();
  vi.useRealTimers();
});

describe('createUserActivity', () => {
  it('activates on pointer movement and deactivates after the timeout', () => {
    fire('pointermove');
    expect(store.get().userActive).toBe(true);
    vi.advanceTimersByTime(2999);
    expect(store.get().userActive).toBe(true);
    vi.advanceTimersByTime(1);
    expect(store.get().userActive).toBe(false);
  });

  it('deactivates immediately when a mouse leaves', () => {
    fire('pointermove');
    fire('pointerleave', { pointerType: 'mouse' });
    expect(store.get().userActive).toBe(false);
    fire('pointermove');
    fire('pointerleave', { pointerType: 'touch' });
    expect(store.get().userActive).toBe(true);
  });

  it('holds activity while a menu is open', () => {
    fire('keydown');
    events.emit('ui:menu', { open: true });
    vi.advanceTimersByTime(10000);
    expect(store.get().userActive).toBe(true);
    fire('pointerleave', { pointerType: 'mouse' });
    expect(store.get().userActive).toBe(true);
    events.emit('ui:menu', { open: false });
    vi.advanceTimersByTime(3000);
    expect(store.get().userActive).toBe(false);
  });

  it('holds activity during a drag', () => {
    events.emit('ui:drag', { active: true });
    vi.advanceTimersByTime(10000);
    expect(store.get().userActive).toBe(true);
    events.emit('ui:drag', { active: false });
    vi.advanceTimersByTime(3000);
    expect(store.get().userActive).toBe(false);
  });

  it('poke() activates programmatically', () => {
    activity.poke();
    expect(store.get().userActive).toBe(true);
  });

  it('emits ui when toolbar visibility changes', () => {
    const ui: number[] = [];
    events.on('ui', (v) => ui.push(v));
    fire('pointermove');
    vi.advanceTimersByTime(3000);
    expect(ui).toEqual([1, 0]);
  });

  it('dispose removes listeners', () => {
    activity.dispose();
    fire('pointermove');
    expect(store.get().userActive).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/ui/activity.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/ui/activity.ts`**

```ts
import type { EventBus, PlayerState, Store } from '../types';

export interface UserActivityDeps {
  root: HTMLElement;
  store: Store<PlayerState>;
  events: EventBus;
  timeout: number;
}

export interface UserActivity {
  poke(): void;
  dispose(): void;
}

const ACTIVATE = ['pointermove', 'pointerdown', 'keydown', 'focusin'] as const;

/** Mirrors the default toolbar hide rule [idle] (toolbar is visible before the first play, like PlayerJS). */
export const controlsVisible = (s: PlayerState) => s.userActive || s.status !== 'playing' || s.controlsLocked;

export function createUserActivity(d: UserActivityDeps): UserActivity {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let holds = 0;

  const setActive = (active: boolean) => {
    if (d.store.get().userActive !== active) d.store.set({ userActive: active });
  };

  const poke = () => {
    clearTimeout(timer);
    setActive(true);
    if (holds === 0) timer = setTimeout(() => setActive(false), d.timeout);
  };

  const onLeave = (e: Event) => {
    if ((e as PointerEvent).pointerType !== 'mouse' || holds > 0) return;
    clearTimeout(timer);
    setActive(false);
  };

  for (const type of ACTIVATE) d.root.addEventListener(type, poke);
  d.root.addEventListener('pointerleave', onLeave);

  const hold = (active: boolean) => {
    if (active) {
      holds++;
      clearTimeout(timer);
      setActive(true);
    } else {
      holds = Math.max(0, holds - 1);
      poke();
    }
  };
  const offMenu = d.events.on('ui:menu', ({ open }) => hold(open));
  const offDrag = d.events.on('ui:drag', ({ active }) => hold(active));

  const offUi = d.store.select(controlsVisible, (visible) => d.events.emit('ui', visible ? 1 : 0));

  return {
    poke,
    dispose() {
      clearTimeout(timer);
      for (const type of ACTIVATE) d.root.removeEventListener(type, poke);
      d.root.removeEventListener('pointerleave', onLeave);
      offMenu();
      offDrag();
      offUi();
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/ui/activity.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/activity.ts tests/ui/activity.test.ts
git commit -m "feat(ui): add user activity tracking for autohide"
```

### Task 3.6: Base props, LayoutEngine and the UI test harness

**Files:**
- Create: `src/ui/base-props.ts`, `src/ui/layout.ts`, `tests/helpers/ui-harness.ts`
- Test: `tests/ui/layout.test.ts`

`LayoutEngine.build(node, parent)` creates a per-node `UIContext` whose `select/on/listen/build` register disposers automatically; applies base props; wires hide rules (class `vp-hidden`) and `action`; builds children into `slot ?? el`.

- [ ] **Step 1: Write the failing test `tests/ui/layout.test.ts`**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createUIHarness } from '../helpers/ui-harness';
import { h } from '../../src/ui/dom';
import type { ComponentFactory } from '../../src/types';

let ui: ReturnType<typeof createUIHarness>;

const box: ComponentFactory = () => ({ el: h('div', { class: 'box' }) });
const container: ComponentFactory = () => {
  const el = h('div', { class: 'container' });
  const slot = h('div', { class: 'slot' });
  el.append(slot);
  return { el, slot };
};

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  ui = createUIHarness();
  ui.components.register('box', box);
  ui.components.register('container', container);
});

describe('LayoutEngine', () => {
  it('builds a tree into slots and the parent', () => {
    const mounted = ui.engine.build({ type: 'container', children: [{ type: 'box' }, { type: 'box' }] }, ui.root)!;
    expect(ui.root.contains(mounted.el)).toBe(true);
    expect(mounted.el.querySelectorAll('.slot > .box')).toHaveLength(2);
  });

  it('applies base props', () => {
    const m = ui.engine.build(
      { type: 'box', id: 'logo', hint: 'quality', scale: 1.2, margin: '0 15 0 20', opacity: 0.5, bg: 'red', color: 'blue', flex: 1, anchor: 'top-left', className: 'x y' },
      ui.root,
    )!;
    expect(m.el.id).toBe('p_control_logo');
    expect(m.el.title).toBe('Качество');
    expect(m.el.getAttribute('aria-label')).toBe('Качество');
    expect(m.el.style.getPropertyValue('scale')).toBe('1.2');
    expect(m.el.style.margin).toBe('0px 15px 0px 20px');
    expect(m.el.style.opacity).toBe('0.5');
    expect(m.el.style.flexGrow).toBe('1');
    expect(m.el.classList.contains('vp-anchor-top-left')).toBe(true);
    expect(m.el.classList.contains('y')).toBe(true);
  });

  it('skips unknown types with a warning, or silently when optional', () => {
    expect(ui.engine.build({ type: 'nope' }, ui.root)).toBeNull();
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(ui.engine.build({ type: 'nope', optional: true }, ui.root)).toBeNull();
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it('toggles vp-hidden from hide rules reactively', () => {
    const m = ui.engine.build({ type: 'box', hide: ['paused'] }, ui.root)!;
    expect(m.el.classList.contains('vp-hidden')).toBe(false);
    ui.store.set({ status: 'paused' });
    expect(m.el.classList.contains('vp-hidden')).toBe(true);
  });

  it('runs actions on click instead of component handlers', () => {
    const inner = vi.fn();
    ui.components.register('btn', () => {
      const el = h('button');
      el.addEventListener('click', inner);
      return { el };
    });
    const m = ui.engine.build({ type: 'btn', action: 'api:seek,10' }, ui.root)!;
    m.el.click();
    expect(ui.api).toHaveBeenCalledWith('seek', '10');
    expect(inner).not.toHaveBeenCalled();
  });

  it('disposes subscriptions, listeners and children', () => {
    const cb = vi.fn();
    const disposeChild = vi.fn();
    ui.components.register('sub', (ctx) => {
      const el = h('div');
      ctx.select((s) => s.volume, cb);
      ctx.listen(window, 'resize', cb);
      return { el, dispose: disposeChild };
    });
    const m = ui.engine.build({ type: 'container', children: [{ type: 'sub' }] }, ui.root)!;
    m.dispose();
    ui.store.set({ volume: 0.3 });
    window.dispatchEvent(new Event('resize'));
    expect(cb).not.toHaveBeenCalled();
    expect(disposeChild).toHaveBeenCalled();
    expect(ui.root.contains(m.el)).toBe(false);
  });

  it('ctx.user runs commands with user source and swallows rejections', async () => {
    const handler = vi.fn(() => Promise.reject(new Error('blocked')));
    ui.commands.register('play', handler);
    ui.components.register('u', (ctx) => {
      const el = h('button');
      el.addEventListener('click', () => ctx.user('play'));
      return { el };
    });
    ui.engine.build({ type: 'u' }, ui.root)!.el.click();
    await Promise.resolve();
    expect(handler).toHaveBeenCalledWith([], { source: 'user' });
  });

  it('isolates a throwing component', () => {
    ui.components.register('bad', () => {
      throw new Error('x');
    });
    const m = ui.engine.build({ type: 'container', children: [{ type: 'bad' }, { type: 'box' }] }, ui.root)!;
    expect(m.el.querySelectorAll('.box')).toHaveLength(1);
    expect(console.error).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Create the harness `tests/helpers/ui-harness.ts`**

```ts
import { vi } from 'vitest';
import { createStore } from '../../src/core/store';
import { createEventBus } from '../../src/core/events';
import { createCommandRegistry } from '../../src/core/commands';
import { createLogger } from '../../src/core/logger';
import { createInitialState } from '../../src/core/initial-state';
import { createRegistry } from '../../src/ui/registry';
import { registerBuiltinHideRules } from '../../src/ui/hide-rules';
import { createTranslator } from '../../src/ui/i18n';
import { createIconSet } from '../../src/ui/icons';
import { createMenuHost } from '../../src/ui/menu-host';
import { createActionRunner } from '../../src/ui/actions';
import { createLayoutEngine } from '../../src/ui/layout';
import type { ComponentFactory, HideRuleFactory, Player, PlayerOptions, PlayerState } from '../../src/types';

export function createUIHarness(opts: { state?: Partial<PlayerState>; options?: Partial<PlayerOptions> } = {}) {
  document.body.replaceChildren();
  const log = createLogger(false);
  const options: PlayerOptions = { container: 'p', ...opts.options };
  const store = createStore<PlayerState>({ ...createInitialState(options), ...opts.state });
  const events = createEventBus(log);
  const commands = createCommandRegistry(log);
  const root = document.createElement('div');
  const layerAbove = document.createElement('div');
  root.append(layerAbove);
  document.body.append(root);
  const components = createRegistry<ComponentFactory<any>>('component', log);
  const hideRules = createRegistry<HideRuleFactory>('hide rule', log);
  registerBuiltinHideRules(hideRules);
  const t = createTranslator('ru');
  const icon = createIconSet();
  const menus = createMenuHost({ layer: layerAbove, store, events, t, icon, log });
  const api = vi.fn();
  const player = {
    id: 'p',
    container: root,
    root,
    video: document.createElement('video'),
    api,
    get state() {
      return store.get();
    },
  } as unknown as Player;
  const run = createActionRunner({ player, store, menus, log });
  const engine = createLayoutEngine({
    components,
    hideRules,
    playerId: 'p',
    log,
    base: { player, store, events, commands, options, root, log, t, icon, menus, run },
  });
  return { log, options, store, events, commands, root, layerAbove, components, hideRules, menus, player, api, engine, t, icon };
}
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run tests/ui/layout.test.ts`
Expected: FAIL — cannot resolve `../../src/ui/layout` (imported by the harness).

- [ ] **Step 4: Implement `src/ui/base-props.ts`**

```ts
import type { BaseProps } from '../types';

const toCssLength = (v: string) => (/^-?\d+(\.\d+)?$/.test(v) ? `${v}px` : v);

export function applyBaseProps(el: HTMLElement, props: BaseProps, playerId: string, t: (key: string) => string): void {
  if (props.id) el.id = `${playerId}_control_${props.id}`;
  if (props.hint) {
    const text = t(props.hint);
    el.title = text;
    el.setAttribute('aria-label', text);
    el.dataset.vpHint = '';
  }
  if (props.scale !== undefined) el.style.setProperty('scale', String(props.scale));
  if (props.margin) el.style.margin = props.margin.trim().split(/\s+/).map(toCssLength).join(' ');
  if (props.opacity !== undefined) el.style.opacity = String(props.opacity);
  if (props.bg) el.style.background = props.bg;
  if (props.color) el.style.color = props.color;
  if (props.flex !== undefined) el.style.flexGrow = String(props.flex);
  if (props.anchor) el.classList.add('vp-anchor', `vp-anchor-${props.anchor}`);
  if (props.className) el.classList.add(...props.className.split(/\s+/).filter(Boolean));
}
```

Components that set a dynamic `aria-label` (e.g. play/pause) must skip it when `el.dataset.vpHint` is present (the user's hint wins).

- [ ] **Step 5: Implement `src/ui/layout.ts`**

```ts
import type { ComponentFactory, ComponentInstance, HideRuleFactory, LayoutNode, Logger, UIContext } from '../types';
import type { Registry } from './registry';
import { applyBaseProps } from './base-props';
import { compileHide } from './hide-rules';

export type UIBase = Pick<UIContext, 'player' | 'store' | 'events' | 'commands' | 'options' | 'root' | 'log' | 't' | 'icon' | 'menus' | 'run'>;

export interface LayoutEngineDeps {
  components: Registry<ComponentFactory<any>>;
  hideRules: Registry<HideRuleFactory>;
  base: UIBase;
  playerId: string;
  log: Logger;
}

export interface Mounted {
  el: HTMLElement;
  dispose(): void;
}

export interface LayoutEngine {
  build(node: LayoutNode, parent: HTMLElement | null): Mounted | null;
}

export function createLayoutEngine(d: LayoutEngineDeps): LayoutEngine {
  const build = (node: LayoutNode, parent: HTMLElement | null): (Mounted & { instance: ComponentInstance }) | null => {
    const factory = d.components.get(node.type);
    if (!factory) {
      if (!node.optional) d.log.warn(`unknown component "${node.type}"`);
      return null;
    }

    const disposers: Array<() => void> = [];
    const ctx: UIContext = {
      ...d.base,
      build(child) {
        const mounted = build(child, null);
        if (!mounted) return null;
        disposers.push(mounted.dispose);
        return mounted.instance;
      },
      select(selector, cb, opts) {
        const off = d.base.store.select(selector, cb, opts);
        disposers.push(off);
        return off;
      },
      on(name, cb) {
        const off = d.base.events.on(name, cb);
        disposers.push(off);
        return off;
      },
      listen(target, type, fn, opts) {
        target.addEventListener(type, fn, opts);
        disposers.push(() => target.removeEventListener(type, fn, opts));
      },
      user(name, ...args) {
        const result = d.base.commands.run(name, args, { source: 'user' });
        if (result instanceof Promise) result.catch((e) => d.log.warn(`command "${name}" rejected`, e));
      },
    };

    const cleanup = () => {
      for (const off of disposers.reverse()) off();
      disposers.length = 0;
    };

    let instance: ComponentInstance;
    try {
      instance = factory(ctx, node);
    } catch (e) {
      d.log.error(`component "${node.type}" failed to build`, e);
      cleanup();
      return null;
    }

    applyBaseProps(instance.el, node, d.playerId, d.base.t);

    if (node.hide?.length) {
      const hidden = compileHide(node.hide, d.hideRules, ctx, d.log);
      ctx.select((s) => hidden(s), (isHidden) => instance.el.classList.toggle('vp-hidden', isHidden), { immediate: true });
    }

    if (node.action) {
      // Capture on the root ancestor: fires before any listener on the element itself,
      // and stopPropagation keeps the click from reaching the component's own handler.
      const action = node.action;
      instance.el.dataset.vpAction = '';
      ctx.listen(
        d.base.root,
        'click',
        (e) => {
          // Only the innermost element with an action handles the click (nested actions).
          if ((e.target as Element | null)?.closest?.('[data-vp-action]') !== instance.el) return;
          e.stopPropagation();
          e.preventDefault();
          d.base.run(action);
        },
        { capture: true },
      );
    }

    for (const child of node.children ?? []) {
      const built = ctx.build(child);
      if (built) (instance.slot ?? instance.el).append(built.el);
    }

    if (parent) parent.append(instance.el);

    let disposed = false;
    return {
      el: instance.el,
      instance,
      dispose() {
        if (disposed) return;
        disposed = true;
        try {
          instance.dispose?.();
        } catch (e) {
          d.log.error(`component "${node.type}" failed to dispose`, e);
        }
        cleanup();
        instance.el.remove();
      },
    };
  };

  return {
    build(node, parent) {
      const mounted = build(node, parent);
      return mounted ? { el: mounted.el, dispose: mounted.dispose } : null;
    },
  };
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run tests/ui/layout.test.ts`
Expected: PASS. (If jsdom's CSSOM drops the unknown `scale` property, `getPropertyValue('scale')` returns `''`; in that case change `applyBaseProps` to also write `el.dataset.vpScale` and assert on that instead — the browser still honours `style.setProperty('scale', …)`.)

- [ ] **Step 7: Run the whole suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: all pass; typecheck exits 0.

- [ ] **Step 8: Commit**

```bash
git add src/ui/base-props.ts src/ui/layout.ts tests/helpers/ui-harness.ts tests/ui/layout.test.ts
git commit -m "feat(ui): add layout engine with base props, hide rules and actions"
```
