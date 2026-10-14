## Chunk 1: Foundation

Delivers: project setup, all shared contracts (`src/types.ts`), dependency-free helpers (`src/shared/`), core primitives (Logger, Store, EventBus, CommandRegistry, PluginHost) and the `file` micro-syntax parser.

Spec references: §2, §3.1–3.5, §4.1.

### Task 1.1: Project setup

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.build.json`, `vite.config.ts`, `.gitignore`, `src/env.d.ts`, `tests/smoke.test.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "composable-video-player",
  "version": "0.1.0",
  "description": "Composable, extensible PlayerJS-like video player in pure TypeScript",
  "type": "module",
  "main": "./dist/player.umd.cjs",
  "module": "./dist/player.js",
  "types": "./dist/types/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/types/index.d.ts",
      "import": "./dist/player.js",
      "require": "./dist/player.umd.cjs"
    }
  },
  "files": ["dist"],
  "sideEffects": ["*.css"],
  "scripts": {
    "dev": "vite",
    "build": "vite build && vite build -c vite.umd.config.ts && tsc -p tsconfig.build.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 2: Install dev dependencies**

Run: `npm install -D typescript vite vitest jsdom`
Expected: `added N packages`, `package.json` gains a `devDependencies` block (typescript 7.x, vite 8.x, vitest 5.x, jsdom 30.x).

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "strict": true,
    "noEmit": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitOverride": true
  },
  "include": ["src", "tests", "demo", "vite.config.ts", "vite.umd.config.ts"]
}
```

- [ ] **Step 4: Create `tsconfig.build.json`**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "declaration": true,
    "emitDeclarationOnly": true,
    "outDir": "dist/types",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 5: Create `vite.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: () => 'player.js',
    },
    sourcemap: true,
    target: 'es2020',
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    restoreMocks: true,
  },
});
```

- [ ] **Step 6: Create `.gitignore`**

```
node_modules/
dist/
demo/assets/
.playwright-mcp/
*.log
.DS_Store
```

- [ ] **Step 7: Create `src/env.d.ts`**

```ts
declare module '*.css?inline' {
  const css: string;
  export default css;
}
```

- [ ] **Step 8: Write a smoke test `tests/smoke.test.ts`**

```ts
import { describe, expect, it } from 'vitest';

describe('toolchain', () => {
  it('runs in jsdom', () => {
    expect(document.createElement('video').tagName).toBe('VIDEO');
  });
});
```

- [ ] **Step 9: Run tests and typecheck**

Run: `npm test && npm run typecheck`
Expected: `1 passed`; typecheck prints nothing and exits 0. If TypeScript 7 rejects an option in `tsconfig.json`, remove only that option and note it in the commit message.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json tsconfig.json tsconfig.build.json vite.config.ts .gitignore src/env.d.ts tests/smoke.test.ts
git commit -m "chore: set up TypeScript, Vite and Vitest"
```

### Task 1.2: Shared contracts `src/types.ts`

**Files:**
- Create: `src/types.ts`

This file is types only (no runtime code). Every other module imports from it with `import type`. Plugins extend `PlayerState`, `PlayerEvents`, `PlayerCommands`, `PlayerOptions` via declaration merging (`declare module '../types' { interface PlayerState { … } }`). **Fields a plugin adds to `PlayerState` or `PlayerOptions` must be optional** (`speeds?: number[]`) — otherwise `createInitialState` in core stops compiling; the plugin sets the initial value in `setup`.

- [ ] **Step 1: Create `src/types.ts`**

```ts
// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export type Status = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'ended' | 'error';
export type ErrorKind = 'network' | 'decode' | 'not-found' | 'unsupported' | 'unknown';

export interface PlayerError {
  kind: ErrorKind;
  message: string;
}

export interface Quality {
  label: string;
  height?: number;
  bitrate?: number;
}

export interface TrackInfo {
  label: string;
  lang?: string;
}

export interface PlayerState {
  status: Status;
  /** First `playing` happened since the last load. */
  started: boolean;
  currentTime: number;
  duration: number;
  /** End of the buffered range that contains currentTime, seconds. */
  buffered: number;
  live: boolean;
  waiting: boolean;
  volume: number;
  muted: boolean;
  rate: number;
  fullscreen: boolean;
  userActive: boolean;
  controlsLocked: boolean;
  width: number;
  height: number;
  url: string;
  /** Index into `qualities`. HLS "Auto" is a regular list item owned by the provider. */
  qualities: Quality[];
  quality: number;
  audioTracks: TrackInfo[];
  audioTrack: number;
  textTracks: TrackInfo[];
  /** -1 = subtitles off. */
  textTrack: number;
  /** Label or 'off'; written by memory, read by subtitles. */
  preferredSubtitle: string | null;
  title: string;
  poster: string;
  loop: boolean;
  error: PlayerError | null;
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

export interface SubtitleRef {
  label: string;
  url: string;
}

export interface SourceTrack {
  label: string;
  /** Fallback chain (`or`). */
  urls: string[];
}

export interface SourceQuality {
  label: string;
  tracks: SourceTrack[];
}

export interface SourceSpec {
  qualities: SourceQuality[];
  subtitles: SubtitleRef[];
  start?: number;
  forceType?: 'hls';
}

export type SourceSpecInput = Partial<SourceSpec> & Pick<SourceSpec, 'qualities'>;
export type SourceInput = string | SourceSpecInput;

export interface Selection {
  quality: number;
  audio: number;
  start: number;
}

export type SourceTransform = (spec: SourceSpec, sel: Selection) => Selection;

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export interface PlayerEvents {
  init: void;
  start: void;
  new: { spec: SourceSpec; selection: Selection };
  metadata: { duration: number };
  play: void;
  userplay: void;
  pause: void;
  userpause: void;
  stop: void;
  end: void;
  finish: void;
  time: number;
  quartile: 25 | 50 | 75 | 100;
  duration: number;
  seek: number;
  userseek: number;
  mute: void;
  unmute: void;
  volume: number;
  quality: string;
  audiotrack: string;
  subtitle: string;
  speed: number;
  fullscreen: void;
  exitfullscreen: void;
  resize: { width: number; height: number };
  ui: 0 | 1;
  buffering: void;
  buffered: void;
  loaderror: { url: string; error: PlayerError };
  error: PlayerError;
  playlist: unknown;
  next: void;
  previous: void;
  line: number;
  destroy: void;
  /** x: px from the timeline's left edge; rootX: px from the player root's left edge. */
  'ui:timeline-hover': { time: number; x: number; rootX: number; width: number };
  'ui:timeline-leave': void;
  'ui:menu': { open: boolean };
  /** A slider/timeline drag started or ended (keeps controls visible). */
  'ui:drag': { active: boolean };
}

export type EventName = keyof PlayerEvents;
export type EventArgs<K extends EventName> = PlayerEvents[K] extends void ? [] : [PlayerEvents[K]];
export type EventHandler<K extends EventName> = (data: PlayerEvents[K]) => void;

export interface EventBus {
  on<K extends EventName>(name: K, cb: EventHandler<K>): () => void;
  once<K extends EventName>(name: K, cb: EventHandler<K>): () => void;
  off<K extends EventName>(name: K, cb: EventHandler<K>): void;
  emit<K extends EventName>(name: K, ...args: EventArgs<K>): void;
  onAny(cb: (name: EventName, data: unknown) => void): () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export interface SelectOptions<T> {
  immediate?: boolean;
  equals?: (a: T, b: T) => boolean;
}

export interface Store<S> {
  get(): Readonly<S>;
  set(patch: Partial<S>): void;
  select<T>(selector: (s: S) => T, cb: (value: T, prev: T) => void, opts?: SelectOptions<T>): () => void;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export interface PlayerCommands {
  load(input: SourceInput): void;
  reload(): void;
  play(): Promise<void>;
  pause(): void;
  toggle(): void;
  stop(): void;
  seek(t: number | string): void;
  setVolume(v: number | string): void;
  mute(): void;
  unmute(): void;
  toggleMute(): void;
  setRate(r: number): void;
  setLoop(b: boolean): void;
  setTitle(s: string): void;
  setPoster(url: string): void;
  fullscreen(): void;
  exitFullscreen(): void;
  toggleFullscreen(): void;
  setQuality(i: number): void;
  setAudioTrack(i: number): void;
  setControlsLocked(b: boolean): void;
  showControls(): void;
  toggleMenu(): void;
  layout(node: LayoutNode): void;
  destroy(): void;
}

export type CommandName = keyof PlayerCommands;
export type CommandArgs<K extends CommandName> = Parameters<PlayerCommands[K]>;
export type CommandResult<K extends CommandName> = ReturnType<PlayerCommands[K]>;

export interface CommandContext {
  source: 'api' | 'user' | 'internal';
}

export type CommandHandler<K extends CommandName> = (args: CommandArgs<K>, ctx: CommandContext) => CommandResult<K>;
export type BeforeHook<K extends CommandName> = (args: CommandArgs<K>, ctx: CommandContext) => false | void | CommandArgs<K>;

export interface CommandRegistry {
  register<K extends CommandName>(name: K, handler: CommandHandler<K>): () => void;
  before<K extends CommandName>(name: K, hook: BeforeHook<K>): () => void;
  run<K extends CommandName>(name: K, args: CommandArgs<K>, ctx?: CommandContext): CommandResult<K> | undefined;
  has(name: string): boolean;
}

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

export interface Logger {
  debug(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

export interface ProviderContext {
  setQualities(qualities: Quality[], current: number): void;
  setAudioTracks(tracks: TrackInfo[], current: number): void;
  error(err: PlayerError): void;
  log: Logger;
  options: PlayerOptions;
}

export interface MediaProvider {
  name: string;
  canPlay(url: string, spec: SourceSpec): 0 | 1 | 2;
  attach(video: HTMLVideoElement, ctx: ProviderContext): void;
  /** Resolves when metadata is available and startTime applied; rejects with PlayerError. */
  load(url: string, startTime: number): Promise<void>;
  detach(): void;
  /** Index into the list the provider passed to setQualities. */
  setQuality?(index: number): void;
  setAudioTrack?(index: number): void;
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

export type Anchor = 'top-left' | 'top' | 'top-right' | 'left' | 'center' | 'right' | 'bottom-left' | 'bottom' | 'bottom-right';

export type HideRuleSpec = string | Record<string, number | string>;

export interface BaseProps {
  id?: string;
  hint?: string;
  scale?: number;
  margin?: string;
  opacity?: number;
  bg?: string;
  color?: string;
  flex?: number;
  anchor?: Anchor;
  hide?: HideRuleSpec[];
  action?: string;
  className?: string;
}

export interface LayoutNode extends BaseProps {
  type: string;
  children?: LayoutNode[];
  optional?: boolean;
  [prop: string]: unknown;
}

export interface ComponentInstance {
  el: HTMLElement;
  slot?: HTMLElement;
  dispose?(): void;
}

export type ComponentFactory<P = Record<string, unknown>> = (ctx: UIContext, props: P & BaseProps) => ComponentInstance;

export type IconName =
  | 'play' | 'pause' | 'replay' | 'volume-high' | 'volume-low' | 'volume-mute'
  | 'fullscreen' | 'fullscreen-exit' | 'settings' | 'playlist' | 'prev' | 'next' | 'check' | 'back';

export interface MenuOption {
  label: string;
  value: unknown;
}

export interface MenuDefinition {
  id: string;
  label: string;
  order?: number;
  visible: (s: PlayerState) => boolean;
  options: (s: PlayerState) => MenuOption[];
  current: (s: PlayerState) => unknown;
  select: (value: unknown) => void;
}

export interface MenuHost {
  register(def: MenuDefinition): () => void;
  open(opts?: { only?: string[]; align?: 'left' | 'center' | 'right' }): void;
  close(): void;
  toggle(): void;
  readonly isOpen: boolean;
  hasVisible(s: PlayerState): boolean;
  dispose(): void;
}

export type HideRuleFactory = (arg: unknown, ctx: UIContext) => { test: (s: PlayerState) => boolean };

export interface UIContext {
  player: Player;
  store: Store<PlayerState>;
  events: EventBus;
  commands: CommandRegistry;
  options: PlayerOptions;
  root: HTMLElement;
  log: Logger;
  t(key: string): string;
  icon(name: IconName): string;
  menus: MenuHost;
  /** Build a child layout node; its disposal is tied to this component. */
  build(node: LayoutNode): ComponentInstance | null;
  run(action: string): void;
  user<K extends CommandName>(name: K, ...args: CommandArgs<K>): void;
  select<T>(selector: (s: PlayerState) => T, cb: (value: T, prev: T) => void, opts?: SelectOptions<T>): () => void;
  on<K extends EventName>(name: K, cb: EventHandler<K>): () => void;
  listen(target: EventTarget, type: string, fn: (e: Event) => void, opts?: AddEventListenerOptions): void;
}

// ---------------------------------------------------------------------------
// Plugins
// ---------------------------------------------------------------------------

export interface PluginContext {
  player: Player;
  store: Store<PlayerState>;
  events: EventBus;
  commands: CommandRegistry;
  options: PlayerOptions;
  video: HTMLVideoElement;
  root: HTMLElement;
  log: Logger;
  /** Translate an i18n key (falls back to the key itself). */
  t(key: string): string;
  registerProvider(p: MediaProvider): void;
  addSourceTransform(fn: SourceTransform): () => void;
  registerComponent(type: string, factory: ComponentFactory<any>): void;
  registerMenu(menu: MenuDefinition): () => void;
  registerHideRule(name: string, rule: HideRuleFactory): void;
  addLayer(node: LayoutNode, position: 'below-ui' | 'above-ui'): () => void;
}

export interface Plugin {
  name: string;
  setup(ctx: PluginContext): void | (() => void);
}

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------

export interface ThemeVars {
  color1: string;
  color2: string;
  color3: string;
  toolbarBg: string;
  font: string;
  fontSize: string;
  radius: string;
  iconSize: string;
  timelineHeight: string;
  subColor: string;
  subBg: string;
  subSize: string;
}

export interface PlayerOptions {
  container: HTMLElement | string;
  source?: SourceInput;
  plugins?: Plugin[];
  layout?: LayoutNode | false;
  poster?: string;
  title?: string;
  autoplay?: boolean;
  muted?: boolean;
  loop?: boolean;
  volume?: number;
  rate?: number;
  start?: number;
  end?: number;
  ratio?: string;
  forceType?: 'hls';
  qualities?: string;
  theme?: Partial<ThemeVars>;
  icons?: Partial<Record<IconName, string>>;
  lang?: 'ru' | 'en';
  i18n?: Partial<Record<string, string>>;
  idleTimeout?: number;
  reload?: { retries: number; delay: number };
  hlsUrl?: string;
  hlsConfig?: Record<string, unknown>;
  log?: boolean;
}

export interface Player {
  readonly id: string;
  readonly state: Readonly<PlayerState>;
  readonly container: HTMLElement;
  readonly root: HTMLElement;
  readonly video: HTMLVideoElement;
  play(): Promise<void>;
  pause(): void;
  seek(t: number | string): void;
  load(source: SourceInput): void;
  on: EventBus['on'];
  once: EventBus['once'];
  off: EventBus['off'];
  select: Store<PlayerState>['select'];
  command<K extends CommandName>(name: K, ...args: CommandArgs<K>): CommandResult<K> | undefined;
  api(cmd: string, arg?: unknown): unknown;
  destroy(): void;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add shared player contracts"
```

### Task 1.3: Shared helpers

**Files:**
- Create: `src/shared/clamp.ts`, `src/shared/errors.ts`, `src/shared/url.ts`, `src/shared/time.ts`
- Test: `tests/shared/shared.test.ts`

- [ ] **Step 1: Write the failing test `tests/shared/shared.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { clamp } from '../../src/shared/clamp';
import { mediaErrorToPlayerError, toPlayerError } from '../../src/shared/errors';
import { extOf, resolveUrl } from '../../src/shared/url';
import { formatTime, parseTimestamp } from '../../src/shared/time';

describe('clamp', () => {
  it('limits a value to a range', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-1, 0, 1)).toBe(0);
    expect(clamp(0.5, 0, 1)).toBe(0.5);
  });
});

describe('errors', () => {
  it('maps MediaError codes', () => {
    expect(mediaErrorToPlayerError({ code: 2, message: '' } as MediaError).kind).toBe('network');
    expect(mediaErrorToPlayerError({ code: 3, message: '' } as MediaError).kind).toBe('decode');
    expect(mediaErrorToPlayerError({ code: 4, message: '' } as MediaError).kind).toBe('unsupported');
    expect(mediaErrorToPlayerError(null).kind).toBe('unknown');
  });
  it('normalizes unknown values', () => {
    expect(toPlayerError({ kind: 'network', message: 'x' })).toEqual({ kind: 'network', message: 'x' });
    expect(toPlayerError(new Error('boom'))).toEqual({ kind: 'unknown', message: 'boom' });
    expect(toPlayerError('oops')).toEqual({ kind: 'unknown', message: 'oops' });
  });
});

describe('url', () => {
  it('extracts lowercase extension ignoring query and hash', () => {
    expect(extOf('https://a.com/v/Movie.MP4?x=1#t')).toBe('mp4');
    expect(extOf('//a.com/live.m3u8')).toBe('m3u8');
    expect(extOf('https://a.com/stream')).toBe('');
  });
  it('resolves relative urls against a base', () => {
    expect(resolveUrl('sprite.jpg', 'https://a.com/thumbs/t.vtt')).toBe('https://a.com/thumbs/sprite.jpg');
    expect(resolveUrl('https://b.com/x.jpg', 'https://a.com/t.vtt')).toBe('https://b.com/x.jpg');
  });
});

describe('time', () => {
  it('formats seconds', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(65.4)).toBe('1:05');
    expect(formatTime(3725, 4000)).toBe('1:02:05');
    expect(formatTime(5, 4000)).toBe('0:00:05');
    expect(formatTime(NaN)).toBe('0:00');
  });
  it('parses VTT/SRT timestamps', () => {
    expect(parseTimestamp('00:01.500')).toBeCloseTo(1.5);
    expect(parseTimestamp('01:02:03.250')).toBeCloseTo(3723.25);
    expect(parseTimestamp('00:00:02,040')).toBeCloseTo(2.04);
    expect(parseTimestamp('garbage')).toBeNaN();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/shared/shared.test.ts`
Expected: FAIL — cannot resolve `../../src/shared/clamp`.

- [ ] **Step 3: Implement `src/shared/clamp.ts`**

```ts
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
```

- [ ] **Step 4: Implement `src/shared/errors.ts`**

```ts
import type { ErrorKind, PlayerError } from '../types';

const MEDIA_ERROR_KINDS: Record<number, ErrorKind> = { 1: 'unknown', 2: 'network', 3: 'decode', 4: 'unsupported' };

export function mediaErrorToPlayerError(err: MediaError | null): PlayerError {
  if (!err) return { kind: 'unknown', message: 'Unknown media error' };
  return { kind: MEDIA_ERROR_KINDS[err.code] ?? 'unknown', message: err.message || `MediaError ${err.code}` };
}

export function isPlayerError(value: unknown): value is PlayerError {
  return typeof value === 'object' && value !== null && 'kind' in value && 'message' in value;
}

export function toPlayerError(value: unknown): PlayerError {
  if (isPlayerError(value)) return { kind: value.kind, message: value.message };
  if (value instanceof Error) return { kind: 'unknown', message: value.message };
  return { kind: 'unknown', message: String(value) };
}
```

- [ ] **Step 5: Implement `src/shared/url.ts`**

```ts
export function extOf(url: string): string {
  const path = url.split(/[?#]/)[0] ?? '';
  const match = path.match(/\.([a-z0-9]+)$/i);
  return match ? match[1]!.toLowerCase() : '';
}

export function resolveUrl(url: string, base: string): string {
  try {
    return new URL(url, new URL(base, typeof location !== 'undefined' ? location.href : undefined)).href;
  } catch {
    return url;
  }
}
```

- [ ] **Step 6: Implement `src/shared/time.ts`**

```ts
const pad = (n: number) => String(n).padStart(2, '0');

/** `m:ss`, or `h:mm:ss` when `reference` (usually duration) is at least an hour. */
export function formatTime(seconds: number, reference = seconds): string {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0 || (Number.isFinite(reference) && reference >= 3600)) return `${h}:${pad(m)}:${pad(s)}`;
  return `${m}:${pad(s)}`;
}

/** Parses `hh:mm:ss.mmm`, `mm:ss.mmm` and SRT-style `hh:mm:ss,mmm`. */
export function parseTimestamp(value: string): number {
  const match = value.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$/);
  if (!match) return NaN;
  const [, h = '0', m, s, ms = '0'] = match;
  return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms.padEnd(3, '0')) / 1000;
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run tests/shared/shared.test.ts`
Expected: PASS (all tests).

- [ ] **Step 8: Commit**

```bash
git add src/shared tests/shared
git commit -m "feat: add shared helpers for errors, urls and time"
```

## Chunk 1b: Core primitives and source parsing

### Task 1.4: Logger and Store

**Files:**
- Create: `src/core/logger.ts`, `src/core/store.ts`
- Test: `tests/core/store.test.ts`

- [ ] **Step 1: Write the failing test `tests/core/store.test.ts`**

```ts
import { describe, expect, it, vi } from 'vitest';
import { createStore } from '../../src/core/store';
import { createLogger } from '../../src/core/logger';

interface S { a: number; b: string; list: number[] }
const initial = (): S => ({ a: 1, b: 'x', list: [] });

describe('createStore', () => {
  it('returns state and merges patches', () => {
    const store = createStore(initial());
    store.set({ a: 2 });
    expect(store.get()).toEqual({ a: 2, b: 'x', list: [] });
  });

  it('notifies selectors only when the selected value changes', () => {
    const store = createStore(initial());
    const cb = vi.fn();
    store.select((s) => s.a, cb);
    store.set({ b: 'y' });
    expect(cb).not.toHaveBeenCalled();
    store.set({ a: 5 });
    expect(cb).toHaveBeenCalledWith(5, 1);
  });

  it('supports immediate and custom equality', () => {
    const store = createStore(initial());
    const cb = vi.fn();
    store.select((s) => ({ a: s.a }), cb, { immediate: true, equals: (x, y) => x.a === y.a });
    expect(cb).toHaveBeenCalledTimes(1);
    store.set({ b: 'z' });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('skips notification when the patch changes nothing', () => {
    const store = createStore(initial());
    const cb = vi.fn();
    store.select((s) => s, cb);
    store.set({ a: 1 });
    expect(cb).not.toHaveBeenCalled();
  });

  it('unsubscribes', () => {
    const store = createStore(initial());
    const cb = vi.fn();
    const off = store.select((s) => s.a, cb);
    off();
    store.set({ a: 3 });
    expect(cb).not.toHaveBeenCalled();
  });

  it('isolates throwing subscribers', () => {
    const log = createLogger(false);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const store = createStore(initial(), log);
    const good = vi.fn();
    store.select((s) => s.a, () => { throw new Error('bad'); });
    store.select((s) => s.a, good);
    store.set({ a: 9 });
    expect(good).toHaveBeenCalledWith(9, 1);
    expect(err).toHaveBeenCalled();
  });

  it('handles nested set inside a subscriber', () => {
    const store = createStore(initial());
    const seen: number[] = [];
    store.select((s) => s.a, (a) => { if (a === 2) store.set({ a: 3 }); });
    store.select((s) => s.a, (a) => seen.push(a));
    store.set({ a: 2 });
    expect(store.get().a).toBe(3);
    expect(seen[seen.length - 1]).toBe(3);
  });
});

describe('createLogger', () => {
  it('prints debug only when enabled', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    createLogger(false).debug('hidden');
    expect(spy).not.toHaveBeenCalled();
    createLogger(true).debug('shown');
    expect(spy).toHaveBeenCalledWith('[vp]', 'shown');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/core/store.test.ts`
Expected: FAIL — cannot resolve `../../src/core/store`.

- [ ] **Step 3: Implement `src/core/logger.ts`**

```ts
import type { Logger } from '../types';

export function createLogger(enabled: boolean, prefix = '[vp]'): Logger {
  return {
    debug: (...args) => {
      if (enabled) console.log(prefix, ...args);
    },
    warn: (...args) => console.warn(prefix, ...args),
    error: (...args) => console.error(prefix, ...args),
  };
}
```

- [ ] **Step 4: Implement `src/core/store.ts`**

```ts
import type { Logger, SelectOptions, Store } from '../types';

interface Subscription<S, T> {
  selector: (s: S) => T;
  cb: (value: T, prev: T) => void;
  equals: (a: T, b: T) => boolean;
  last: T;
}

export function createStore<S extends object>(initial: S, log?: Logger): Store<S> {
  let state: S = { ...initial };
  const subs = new Set<Subscription<S, any>>();

  const call = <T>(sub: Subscription<S, T>, value: T, prev: T) => {
    try {
      sub.cb(value, prev);
    } catch (e) {
      log?.error('store subscriber failed', e);
    }
  };

  return {
    get: () => state,

    set(patch) {
      const changed = (Object.keys(patch) as Array<keyof S>).some((k) => !Object.is(state[k], patch[k]));
      if (!changed) return;
      state = { ...state, ...patch };
      for (const sub of [...subs]) {
        if (!subs.has(sub)) continue;
        const value = sub.selector(state);
        if (sub.equals(value, sub.last)) continue;
        const prev = sub.last;
        sub.last = value;
        call(sub, value, prev);
      }
    },

    select<T>(selector: (s: S) => T, cb: (value: T, prev: T) => void, opts: SelectOptions<T> = {}) {
      const sub: Subscription<S, T> = { selector, cb, equals: opts.equals ?? Object.is, last: selector(state) };
      subs.add(sub);
      if (opts.immediate) call(sub, sub.last, sub.last);
      return () => {
        subs.delete(sub);
      };
    },
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/core/store.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/logger.ts src/core/store.ts tests/core/store.test.ts
git commit -m "feat(core): add logger and reactive store"
```

### Task 1.5: EventBus

**Files:**
- Create: `src/core/events.ts`
- Test: `tests/core/events.test.ts`

- [ ] **Step 1: Write the failing test `tests/core/events.test.ts`**

```ts
import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../../src/core/events';
import { createLogger } from '../../src/core/logger';

describe('createEventBus', () => {
  it('delivers typed payloads and unsubscribes', () => {
    const bus = createEventBus();
    const cb = vi.fn();
    const off = bus.on('time', cb);
    bus.emit('time', 3);
    off();
    bus.emit('time', 4);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(3);
  });

  it('emits void events without payload', () => {
    const bus = createEventBus();
    const cb = vi.fn();
    bus.on('play', cb);
    bus.emit('play');
    expect(cb).toHaveBeenCalledWith(undefined);
  });

  it('once fires a single time and can be cancelled', () => {
    const bus = createEventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.once('pause', a);
    const cancel = bus.once('pause', b);
    cancel();
    bus.emit('pause');
    bus.emit('pause');
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
  });

  it('off removes a handler', () => {
    const bus = createEventBus();
    const cb = vi.fn();
    bus.on('volume', cb);
    bus.off('volume', cb);
    bus.emit('volume', 0.5);
    expect(cb).not.toHaveBeenCalled();
  });

  it('onAny receives every event with its name', () => {
    const bus = createEventBus();
    const any = vi.fn();
    bus.onAny(any);
    bus.emit('quality', '720p');
    bus.emit('ui:timeline-leave');
    expect(any).toHaveBeenNthCalledWith(1, 'quality', '720p');
    expect(any).toHaveBeenNthCalledWith(2, 'ui:timeline-leave', undefined);
  });

  it('isolates throwing handlers', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const bus = createEventBus(createLogger(false));
    const good = vi.fn();
    bus.on('end', () => { throw new Error('x'); });
    bus.on('end', good);
    bus.emit('end');
    expect(good).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/core/events.test.ts`
Expected: FAIL — cannot resolve `../../src/core/events`.

- [ ] **Step 3: Implement `src/core/events.ts`**

```ts
import type { EventBus, EventHandler, EventName, Logger } from '../types';

type AnyHandler = (name: EventName, data: unknown) => void;

export function createEventBus(log?: Logger): EventBus {
  const handlers = new Map<EventName, Set<(data: unknown) => void>>();
  const anyHandlers = new Set<AnyHandler>();

  const safe = (fn: () => void, name: EventName) => {
    try {
      fn();
    } catch (e) {
      log?.error(`event handler for "${String(name)}" failed`, e);
    }
  };

  const bus: EventBus = {
    on(name, cb) {
      let set = handlers.get(name);
      if (!set) handlers.set(name, (set = new Set()));
      set.add(cb as (data: unknown) => void);
      return () => bus.off(name, cb);
    },

    once(name, cb) {
      const wrapper = ((data: unknown) => {
        off();
        (cb as (data: unknown) => void)(data);
      }) as EventHandler<typeof name>;
      const off = bus.on(name, wrapper);
      return off;
    },

    off(name, cb) {
      handlers.get(name)?.delete(cb as (data: unknown) => void);
    },

    emit(name, ...args) {
      const data = args[0];
      const set = handlers.get(name);
      if (set) for (const cb of [...set]) safe(() => cb(data), name);
      for (const cb of [...anyHandlers]) safe(() => cb(name, data), name);
    },

    onAny(cb) {
      anyHandlers.add(cb);
      return () => {
        anyHandlers.delete(cb);
      };
    },
  };
  return bus;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/core/events.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/events.ts tests/core/events.test.ts
git commit -m "feat(core): add typed event bus with onAny"
```

### Task 1.6: CommandRegistry and PluginHost

**Files:**
- Create: `src/core/commands.ts`, `src/core/plugin-host.ts`
- Test: `tests/core/commands.test.ts`, `tests/core/plugin-host.test.ts`

- [ ] **Step 1: Write the failing test `tests/core/commands.test.ts`**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCommandRegistry } from '../../src/core/commands';
import { createLogger } from '../../src/core/logger';

describe('createCommandRegistry', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('runs a registered handler with args and default context', () => {
    const reg = createCommandRegistry(createLogger(false));
    const handler = vi.fn();
    reg.register('seek', handler);
    reg.run('seek', [10]);
    expect(handler).toHaveBeenCalledWith([10], { source: 'internal' });
    expect(reg.has('seek')).toBe(true);
  });

  it('returns the handler result', async () => {
    const reg = createCommandRegistry(createLogger(false));
    reg.register('play', () => Promise.resolve());
    await expect(reg.run('play', [])).resolves.toBeUndefined();
  });

  it('warns and returns undefined for unknown commands', () => {
    const reg = createCommandRegistry(createLogger(false));
    expect(reg.run('pause', [])).toBeUndefined();
    expect(console.warn).toHaveBeenCalled();
  });

  it('lets before-hooks cancel or rewrite arguments in order', () => {
    const reg = createCommandRegistry(createLogger(false));
    const handler = vi.fn();
    reg.register('seek', handler);
    reg.before('seek', ([t]) => [Number(t) * 2]);
    reg.before('seek', ([t], ctx) => (ctx.source === 'user' && Number(t) > 100 ? false : undefined));
    reg.run('seek', [10], { source: 'user' });
    expect(handler).toHaveBeenLastCalledWith([20], { source: 'user' });
    reg.run('seek', [60], { source: 'user' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('removes hooks and handlers', () => {
    const reg = createCommandRegistry(createLogger(false));
    const handler = vi.fn();
    const off = reg.register('stop', handler);
    const offHook = reg.before('stop', () => false);
    offHook();
    reg.run('stop', []);
    expect(handler).toHaveBeenCalledTimes(1);
    off();
    expect(reg.has('stop')).toBe(false);
  });

  it('warns when a handler is replaced', () => {
    const reg = createCommandRegistry(createLogger(false));
    reg.register('mute', () => {});
    reg.register('mute', () => {});
    expect(console.warn).toHaveBeenCalled();
  });

  it('catches throwing handlers and hooks', () => {
    const reg = createCommandRegistry(createLogger(false));
    reg.register('toggle', () => { throw new Error('x'); });
    expect(reg.run('toggle', [])).toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Write the failing test `tests/core/plugin-host.test.ts`**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPluginHost } from '../../src/core/plugin-host';
import { createLogger } from '../../src/core/logger';
import type { Plugin, PluginContext } from '../../src/types';

const ctx = {} as PluginContext;

describe('createPluginHost', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('sets up plugins in order and disposes in reverse', () => {
    const order: string[] = [];
    const mk = (name: string): Plugin => ({
      name,
      setup: () => {
        order.push(`setup:${name}`);
        return () => order.push(`dispose:${name}`);
      },
    });
    const host = createPluginHost(createLogger(false));
    host.setupAll([mk('a'), mk('b')], ctx);
    host.disposeAll();
    expect(order).toEqual(['setup:a', 'setup:b', 'dispose:b', 'dispose:a']);
  });

  it('isolates a failing plugin', () => {
    const host = createPluginHost(createLogger(false));
    const good = vi.fn();
    host.setupAll([{ name: 'bad', setup: () => { throw new Error('x'); } }, { name: 'good', setup: good }], ctx);
    expect(good).toHaveBeenCalledWith(ctx);
    expect(host.has('bad')).toBe(false);
    expect(host.has('good')).toBe(true);
  });

  it('ignores duplicate names', () => {
    const host = createPluginHost(createLogger(false));
    const second = vi.fn();
    host.setupAll([{ name: 'x', setup: () => {} }, { name: 'x', setup: second }], ctx);
    expect(second).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalled();
  });

  it('continues disposing when a disposer throws', () => {
    const host = createPluginHost(createLogger(false));
    const ok = vi.fn();
    host.setupAll([{ name: 'a', setup: () => ok }, { name: 'b', setup: () => () => { throw new Error('x'); } }], ctx);
    host.disposeAll();
    expect(ok).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run both to verify they fail**

Run: `npx vitest run tests/core/commands.test.ts tests/core/plugin-host.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement `src/core/commands.ts`**

```ts
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
```

- [ ] **Step 5: Implement `src/core/plugin-host.ts`**

```ts
import type { Logger, Plugin, PluginContext } from '../types';

export interface PluginHost {
  setupAll(plugins: Plugin[], ctx: PluginContext): void;
  disposeAll(): void;
  has(name: string): boolean;
}

export function createPluginHost(log: Logger): PluginHost {
  const active = new Set<string>();
  const disposers: Array<{ name: string; fn: () => void }> = [];

  return {
    setupAll(plugins, ctx) {
      for (const plugin of plugins) {
        if (active.has(plugin.name)) {
          log.warn(`plugin "${plugin.name}" is already registered; duplicate ignored`);
          continue;
        }
        try {
          const dispose = plugin.setup(ctx);
          active.add(plugin.name);
          if (typeof dispose === 'function') disposers.push({ name: plugin.name, fn: dispose });
        } catch (e) {
          log.error(`plugin "${plugin.name}" failed to set up`, e);
        }
      }
    },

    disposeAll() {
      for (const { name, fn } of disposers.reverse()) {
        try {
          fn();
        } catch (e) {
          log.error(`plugin "${name}" failed to dispose`, e);
        }
      }
      disposers.length = 0;
      active.clear();
    },

    has: (name) => active.has(name),
  };
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/core/commands.test.ts tests/core/plugin-host.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/core/commands.ts src/core/plugin-host.ts tests/core/commands.test.ts tests/core/plugin-host.test.ts
git commit -m "feat(core): add command registry with before-hooks and plugin host"
```

### Task 1.7: Source parsing (`file` micro-syntax)

**Files:**
- Create: `src/source/parse.ts`
- Test: `tests/source/parse.test.ts`

Rules (spec §4.1): extract `(subtitle:…)`; split qualities by `,` with `[Label]`; drop `<<<` group labels; split tracks by `;` with `{Label}`; split fallbacks by ` or `; resolve ` and ` randomly; strip `[seek:N]` suffix into `start`; `opts.qualities` labels unlabeled qualities by position.

- [ ] **Step 1: Write the failing test `tests/source/parse.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { isPlaylistInput, normalizeSpec, parseSource, parseSubtitleList, sourceKey } from '../../src/source/parse';

describe('parseSource', () => {
  it('parses a plain url', () => {
    expect(parseSource('https://a.com/v.mp4')).toEqual({
      qualities: [{ label: '', tracks: [{ label: '', urls: ['https://a.com/v.mp4'] }] }],
      subtitles: [],
    });
  });

  it('parses labeled qualities', () => {
    const spec = parseSource('[360p]//a/360.mp4,[720p]//a/720.mp4');
    expect(spec.qualities.map((q) => q.label)).toEqual(['360p', '720p']);
    expect(spec.qualities[1]!.tracks[0]!.urls).toEqual(['//a/720.mp4']);
  });

  it('parses audio tracks inside qualities', () => {
    const spec = parseSource('[480p]{French}//a/480_fr.mp4;{English}//a/480_en.mp4,[720p]{French}//a/720_fr.mp4;{English}//a/720_en.mp4');
    expect(spec.qualities).toHaveLength(2);
    expect(spec.qualities[0]!.tracks.map((t) => t.label)).toEqual(['French', 'English']);
    expect(spec.qualities[1]!.tracks[1]!.urls).toEqual(['//a/720_en.mp4']);
  });

  it('parses or-fallback chains', () => {
    const spec = parseSource('//a/v.m3u8 or //a/v.mp4');
    expect(spec.qualities[0]!.tracks[0]!.urls).toEqual(['//a/v.m3u8', '//a/v.mp4']);
  });

  it('resolves and-alternatives with the injected random', () => {
    expect(parseSource('//a/1.mp4 and //a/2.mp4', { random: () => 0 }).qualities[0]!.tracks[0]!.urls).toEqual(['//a/1.mp4']);
    expect(parseSource('//a/1.mp4 and //a/2.mp4', { random: () => 0.99 }).qualities[0]!.tracks[0]!.urls).toEqual(['//a/2.mp4']);
  });

  it('extracts inline subtitles', () => {
    const spec = parseSource('https://a.com/v.m3u8(subtitle:[En]https://a.com/en.vtt[Es]https://a.com/es.vtt)');
    expect(spec.qualities[0]!.tracks[0]!.urls).toEqual(['https://a.com/v.m3u8']);
    expect(spec.subtitles).toEqual([
      { label: 'En', url: 'https://a.com/en.vtt' },
      { label: 'Es', url: 'https://a.com/es.vtt' },
    ]);
  });

  it('extracts the [seek:N] suffix as start', () => {
    const spec = parseSource('//a/v.mp4[seek:10]');
    expect(spec.start).toBe(10);
    expect(spec.qualities[0]!.tracks[0]!.urls).toEqual(['//a/v.mp4']);
  });

  it('drops <<< group separators', () => {
    const spec = parseSource('[480p]//a/1.mp4,[<<<Second]//,[720p]//a/2.mp4');
    expect(spec.qualities.map((q) => q.label)).toEqual(['480p', '720p']);
  });

  it('labels unlabeled qualities from opts.qualities', () => {
    const spec = parseSource('//a/1.mp4,//a/2.mp4', { qualities: '480p, 720p' });
    expect(spec.qualities.map((q) => q.label)).toEqual(['480p', '720p']);
  });
});

describe('parseSubtitleList', () => {
  it('parses labeled and unlabeled entries', () => {
    expect(parseSubtitleList('[English]https://a/en.vtt,[Russian]https://a/ru.srt')).toEqual([
      { label: 'English', url: 'https://a/en.vtt' },
      { label: 'Russian', url: 'https://a/ru.srt' },
    ]);
    expect(parseSubtitleList('https://a/subs/en.vtt')).toEqual([{ label: 'en', url: 'https://a/subs/en.vtt' }]);
    expect(parseSubtitleList('')).toEqual([]);
  });
});

describe('isPlaylistInput', () => {
  it('detects JSON and playlist urls', () => {
    expect(isPlaylistInput('[{"title":"a","file":"x.mp4"}]')).toBe(true);
    expect(isPlaylistInput('{"playlist":[]}')).toBe(true);
    expect(isPlaylistInput('https://a.com/pl.txt?x=1')).toBe(true);
    expect(isPlaylistInput('https://a.com/pl.json')).toBe(true);
    expect(isPlaylistInput('[720p]https://a.com/v.mp4')).toBe(false);
    expect(isPlaylistInput('[{broken')).toBe(false);
    expect(isPlaylistInput({ qualities: [] })).toBe(false);
  });
});

describe('normalizeSpec and sourceKey', () => {
  it('fills defaults', () => {
    const spec = normalizeSpec({ qualities: [{ label: '', tracks: [{ label: '', urls: ['a.mp4'] }] }] }, 'hls');
    expect(spec).toEqual({ qualities: [{ label: '', tracks: [{ label: '', urls: ['a.mp4'] }] }], subtitles: [], start: undefined, forceType: 'hls' });
    expect(sourceKey(spec)).toBe('a.mp4');
    expect(sourceKey({ qualities: [], subtitles: [] })).toBe('');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/source/parse.test.ts`
Expected: FAIL — cannot resolve `../../src/source/parse`.

- [ ] **Step 3: Implement `src/source/parse.ts`**

```ts
import type { SourceInput, SourceSpec, SourceSpecInput, SourceTrack, SubtitleRef } from '../types';

export interface ParseOptions {
  /** Labels for unlabeled comma-separated qualities, e.g. "480p,720p". */
  qualities?: string;
  random?: () => number;
}

const SUBTITLE_PREFIX = '(subtitle:';
const PAIR_RE = /\[([^\]]*)\]([^[]+)/g;
const SEEK_RE = /\[seek:(\d+(?:\.\d+)?)\]$/;

function takeLabel(part: string, open: string, close: string): [string, string] {
  if (part.startsWith(open)) {
    const end = part.indexOf(close);
    if (end > 0) return [part.slice(1, end).trim(), part.slice(end + 1).trim()];
  }
  return ['', part];
}

function fileLabel(url: string): string {
  const name = url.split(/[?#]/)[0]!.split('/').pop() ?? '';
  return name.replace(/\.[^.]+$/, '');
}

function pickAlternative(link: string, random: () => number): string {
  if (!link.includes(' and ')) return link;
  const options = link.split(' and ').map((s) => s.trim()).filter(Boolean);
  return options[Math.min(options.length - 1, Math.floor(random() * options.length))] ?? '';
}

function extractInlineSubtitles(input: string): { rest: string; subtitles: SubtitleRef[] } {
  const subtitles: SubtitleRef[] = [];
  let rest = input;
  let idx = rest.indexOf(SUBTITLE_PREFIX);
  while (idx >= 0) {
    const end = rest.indexOf(')', idx);
    if (end < 0) break;
    const inner = rest.slice(idx + SUBTITLE_PREFIX.length, end);
    for (const m of inner.matchAll(PAIR_RE)) subtitles.push({ label: m[1]!.trim(), url: m[2]!.trim() });
    rest = rest.slice(0, idx) + rest.slice(end + 1);
    idx = rest.indexOf(SUBTITLE_PREFIX);
  }
  return { rest, subtitles };
}

export function parseSource(input: string, opts: ParseOptions = {}): SourceSpec {
  const random = opts.random ?? Math.random;
  const { rest, subtitles } = extractInlineSubtitles(input.trim());
  const labels = opts.qualities?.split(',').map((s) => s.trim()) ?? [];
  let start: number | undefined;

  const parseTrack = (part: string): SourceTrack => {
    const [label, body] = takeLabel(part, '{', '}');
    const urls = body
      .split(' or ')
      .map((link) => pickAlternative(link.trim(), random))
      .map((url) => {
        const m = url.match(SEEK_RE);
        if (!m) return url;
        start ??= Number(m[1]);
        return url.slice(0, m.index).trim();
      })
      .filter(Boolean);
    return { label, urls };
  };

  const qualities = rest
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((part) => takeLabel(part, '[', ']'))
    .filter(([label]) => !label.startsWith('<<<'))
    .map(([label, body], i) => ({
      label: label || labels[i] || '',
      tracks: body.split(';').map((s) => s.trim()).filter(Boolean).map(parseTrack).filter((t) => t.urls.length > 0),
    }))
    .filter((q) => q.tracks.length > 0);

  const spec: SourceSpec = { qualities, subtitles };
  if (start !== undefined) spec.start = start;
  return spec;
}

export function parseSubtitleList(value: string): SubtitleRef[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((part) => {
      const [label, url] = takeLabel(part, '[', ']');
      return { label: label || fileLabel(url), url };
    });
}

export function isPlaylistInput(input: SourceInput): boolean {
  if (typeof input !== 'string') return false;
  const s = input.trim();
  if (s.startsWith('[{') || s.startsWith('{')) {
    try {
      JSON.parse(s);
      return true;
    } catch {
      return false;
    }
  }
  const path = (s.split(/[?#]/)[0] ?? '').toLowerCase();
  return path.endsWith('.txt') || path.endsWith('.json');
}

export function normalizeSpec(input: SourceSpecInput, forceType?: 'hls'): SourceSpec {
  return {
    qualities: input.qualities,
    subtitles: input.subtitles ?? [],
    start: input.start,
    forceType: input.forceType ?? forceType,
  };
}

/** Stable identity of a source: first url of the first quality/track. */
export function sourceKey(spec: SourceSpec): string {
  return spec.qualities[0]?.tracks[0]?.urls[0] ?? '';
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/source/parse.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the whole suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: all tests pass, typecheck exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/source tests/source
git commit -m "feat(source): parse PlayerJS file micro-syntax"
```
