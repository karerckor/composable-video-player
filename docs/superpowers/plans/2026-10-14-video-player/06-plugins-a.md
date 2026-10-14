## Chunk 6: Plugins A — quality, speed, audio tracks, hotkeys, autoplay, memory

Delivers: six plugins, each a factory `xxxPlugin(opts?) => Plugin` in its own file, plus a test helper that builds a real player with a fake provider.

Spec references: §7 (table and ordering), §3.4 ("play after load"), §4.3 (SourceTransforms). Deviations 13–15 from `00-overview.md` apply.

Plugin conventions:
- Options come from the factory argument first, then from `ctx.options` (declared via declaration merging, all optional).
- Plugin-added state fields are optional and initialized in `setup`.
- User-facing actions run commands with `{ source: 'user' }`.
- `setup` returns one dispose function that undoes every registration.

### Task 6.1: Player test harness

**Files:**
- Create: `tests/helpers/player-harness.ts`

- [ ] **Step 1: Create `tests/helpers/player-harness.ts`**

```ts
import { createPlayer } from '../../src/player';
import { installFakeMedia, type FakeMedia } from './fake-media';
import { fakeProvider, type FakeProviderOptions } from './fake-provider';
import type { PlayerOptions, Plugin } from '../../src/types';

/** A real player (composition root) wired to a fake provider and a fake media element. */
export function createTestPlayer(opts: Partial<PlayerOptions> = {}, providerOptions: FakeProviderOptions = {}) {
  document.body.replaceChildren();
  const host = document.createElement('div');
  host.id = 'p';
  document.body.append(host);
  const fp = fakeProvider(providerOptions);
  let media!: FakeMedia;
  // Runs first among plugins, i.e. before `init`, so plugins that restore state on init hit the fake element.
  const providerPlugin: Plugin = {
    name: 'fake-provider',
    setup(ctx) {
      media = installFakeMedia(ctx.video);
      ctx.registerProvider(fp.provider);
    },
  };
  const player = createPlayer({ ...opts, container: host, plugins: [providerPlugin, ...(opts.plugins ?? [])] });
  return { player, media, fp, host };
}
```

The fake media element is installed inside the first plugin's `setup`, which runs before `init` and before `options.source` is loaded.

- [ ] **Step 2: Typecheck and commit**

Run: `npm run typecheck`
Expected: exits 0.

```bash
git add tests/helpers/player-harness.ts
git commit -m "test: add real-player test harness"
```

### Task 6.2: Quality plugin

**Files:**
- Create: `src/plugins/quality.ts`
- Test: `tests/plugins/quality.test.ts`

- [ ] **Step 1: Write the failing test `tests/plugins/quality.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { pickQuality, qualityPlugin } from '../../src/plugins/quality';
import { createTestPlayer } from '../helpers/player-harness';
import { flush } from '../helpers/flush';

describe('pickQuality', () => {
  const labels = ['360p', '720p', '1080p'];
  it('supports labels, num:X and max', () => {
    expect(pickQuality(labels, '720p')).toBe(1);
    expect(pickQuality(labels, 'num:0')).toBe(0);
    expect(pickQuality(labels, 'num:9')).toBeNull();
    expect(pickQuality(labels, 'max')).toBe(2);
    expect(pickQuality(labels, 'nope')).toBeNull();
    expect(pickQuality(labels, undefined)).toBeNull();
  });
});

describe('qualityPlugin', () => {
  it('applies defaultQuality as a source transform', async () => {
    const { fp } = createTestPlayer({ plugins: [qualityPlugin({ defaultQuality: '360p' })], source: '[360p]a.mp4,[720p]b.mp4' });
    await flush();
    expect(fp.loads[0]!.url).toBe('a.mp4');
  });

  it('reads defaultQuality from player options', async () => {
    const { fp } = createTestPlayer({ plugins: [qualityPlugin()], defaultQuality: 'num:0', source: '[360p]a.mp4,[720p]b.mp4' });
    await flush();
    expect(fp.loads[0]!.url).toBe('a.mp4');
  });

  it('shows a quality menu that switches quality and hides forbidden labels', async () => {
    const { player, host, fp } = createTestPlayer({
      plugins: [qualityPlugin({ forbiddenQuality: '1080p' })],
      source: '[360p]a.mp4,[720p]b.mp4,[1080p]c.mp4',
    });
    await flush();
    const settings = host.querySelector<HTMLButtonElement>('.vp-settings')!;
    expect(settings.classList.contains('vp-hidden')).toBe(false);
    settings.click();
    const labels = [...host.querySelectorAll('.vp-menu-item .vp-menu-label')].map((e) => e.textContent);
    expect(labels).toEqual(['360p', '720p']);
    host.querySelector<HTMLButtonElement>('.vp-menu-item')!.click();
    await flush();
    expect(player.state.quality).toBe(0);
    expect(fp.loads[fp.loads.length - 1]!.url).toBe('a.mp4');
  });

  it('translates the provider "auto" label', async () => {
    const { player, host, fp } = createTestPlayer({ plugins: [qualityPlugin()], source: 'a.m3u8' });
    await flush();
    fp.ctx.setQualities([{ label: 'auto' }, { label: '360p' }, { label: '720p' }], 0);
    host.querySelector<HTMLButtonElement>('.vp-settings')!.click();
    expect(host.querySelector('.vp-menu-item .vp-menu-label')!.textContent).toBe('Авто');
    expect(player.state.qualities).toHaveLength(3);
  });

  it('never starts on a forbidden quality', async () => {
    const { fp } = createTestPlayer({ plugins: [qualityPlugin({ forbiddenQuality: '1080p' })], source: '[360p]a.mp4,[720p]b.mp4,[1080p]c.mp4' });
    await flush();
    expect(fp.loads[0]!.url).toBe('b.mp4');
  });

  it('hides the menu with a single quality', async () => {
    const { host } = createTestPlayer({ plugins: [qualityPlugin()], source: 'a.mp4' });
    await flush();
    expect(host.querySelector('.vp-settings')!.classList.contains('vp-hidden')).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/plugins/quality.test.ts`
Expected: FAIL — cannot resolve `../../src/plugins/quality`.

- [ ] **Step 3: Implement `src/plugins/quality.ts`**

```ts
import type { CommandContext, MenuOption, Plugin, PlayerState } from '../types';

declare module '../types' {
  interface PlayerOptions {
    /** Label, `num:X` (zero-based) or `max`. PlayerJS: default_quality. */
    defaultQuality?: string;
    /** Comma-separated labels hidden from the menu. PlayerJS: forbidden_quality. */
    forbiddenQuality?: string;
  }
}

export interface QualityPluginOptions {
  defaultQuality?: string;
  forbiddenQuality?: string | string[];
}

const USER: CommandContext = { source: 'user' };

export function pickQuality(labels: string[], wanted: string | undefined): number | null {
  if (!wanted) return null;
  if (wanted === 'max') return labels.length ? labels.length - 1 : null;
  const num = wanted.match(/^num:(\d+)$/);
  if (num) {
    const i = Number(num[1]);
    return i < labels.length ? i : null;
  }
  const i = labels.indexOf(wanted);
  return i >= 0 ? i : null;
}

const toList = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value : (value ?? '').split(',')).map((s) => s.trim()).filter(Boolean);

export function qualityPlugin(o: QualityPluginOptions = {}): Plugin {
  return {
    name: 'quality',
    setup(ctx) {
      const wanted = o.defaultQuality ?? ctx.options.defaultQuality;
      const forbidden = new Set(toList(o.forbiddenQuality ?? ctx.options.forbiddenQuality));

      const options = (s: PlayerState): MenuOption[] =>
        s.qualities
          .map((q, i) => ({ label: q.label === 'auto' ? ctx.t('auto') : q.label || String(i + 1), value: i, raw: q.label }))
          .filter((x) => !forbidden.has(x.raw))
          .map(({ label, value }) => ({ label, value }));

      const offTransform = ctx.addSourceTransform((spec, sel) => {
        const labels = spec.qualities.map((q) => q.label);
        let index = pickQuality(labels, wanted) ?? sel.quality;
        if (forbidden.has(labels[index] ?? '')) {
          // fall back to the highest allowed quality
          for (let i = labels.length - 1; i >= 0; i--) {
            if (!forbidden.has(labels[i]!)) {
              index = i;
              break;
            }
          }
        }
        return index === sel.quality ? sel : { ...sel, quality: index };
      });

      const offMenu = ctx.registerMenu({
        id: 'quality',
        label: 'quality',
        order: 10,
        visible: (s) => options(s).length > 1,
        options,
        current: (s) => s.quality,
        select: (value) => ctx.commands.run('setQuality', [value as number], USER),
      });

      return () => {
        offTransform();
        offMenu();
      };
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/plugins/quality.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/plugins/quality.ts tests/plugins/quality.test.ts
git commit -m "feat(plugins): add quality plugin"
```

### Task 6.3: Speed and audio track plugins

**Files:**
- Create: `src/plugins/speed.ts`, `src/plugins/audiotracks.ts`
- Test: `tests/plugins/speed-audio.test.ts`

- [ ] **Step 1: Write the failing test `tests/plugins/speed-audio.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { speedPlugin } from '../../src/plugins/speed';
import { audioTracksPlugin } from '../../src/plugins/audiotracks';
import { createTestPlayer } from '../helpers/player-harness';
import { flush } from '../helpers/flush';

const menuLabels = (host: HTMLElement) => [...host.querySelectorAll('.vp-menu-item .vp-menu-label')].map((e) => e.textContent);

describe('speedPlugin', () => {
  it('exposes speeds, a menu and setSpeedIndex', async () => {
    const { player, host } = createTestPlayer({ plugins: [speedPlugin({ speeds: [0.5, 1, 2] })] });
    expect(player.state.speeds).toEqual([0.5, 1, 2]);
    host.querySelector<HTMLButtonElement>('.vp-settings')!.click();
    expect(menuLabels(host)).toEqual(['0.5x', 'Обычная', '2x']);
    host.querySelectorAll<HTMLButtonElement>('.vp-menu-item')[2]!.click();
    expect(player.state.rate).toBe(2);
    player.api('speed', 0);
    expect(player.state.rate).toBe(0.5);
  });

  it('applies defaultSpeed on init', () => {
    const { player } = createTestPlayer({ plugins: [speedPlugin()], defaultSpeed: 1.5 });
    expect(player.video.defaultPlaybackRate).toBe(1.5);
  });
});

describe('audioTracksPlugin', () => {
  const source = '[720p]{English}en.mp4;{Russian}ru.mp4';

  it('applies defaultAudio and renames labels in the menu', async () => {
    const { player, host, fp } = createTestPlayer({
      plugins: [audioTracksPlugin({ defaultAudio: 'Russian', renameAudio: { English: 'Английский', 1: 'Русский' } })],
      source,
    });
    await flush();
    expect(fp.loads[0]!.url).toBe('ru.mp4');
    host.querySelector<HTMLButtonElement>('.vp-settings')!.click();
    expect(menuLabels(host)).toEqual(['Английский', 'Русский']);
    host.querySelector<HTMLButtonElement>('.vp-menu-item')!.click();
    await flush();
    expect(player.state.audioTrack).toBe(0);
    expect(fp.loads[fp.loads.length - 1]!.url).toBe('en.mp4');
  });

  it('is hidden with a single track', async () => {
    const { host } = createTestPlayer({ plugins: [audioTracksPlugin()], source: 'a.mp4' });
    await flush();
    expect(host.querySelector('.vp-settings')!.classList.contains('vp-hidden')).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/plugins/speed-audio.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `src/plugins/speed.ts`**

```ts
import type { CommandContext, Plugin } from '../types';

declare module '../types' {
  interface PlayerState {
    speeds?: number[];
  }
  interface PlayerOptions {
    speeds?: number[];
    /** PlayerJS: default_speed. */
    defaultSpeed?: number;
  }
  interface PlayerCommands {
    /** Index into `state.speeds` (PlayerJS `api('speed', i)`). */
    setSpeedIndex(index: number): void;
  }
}

export interface SpeedPluginOptions {
  speeds?: number[];
  defaultSpeed?: number;
}

const USER: CommandContext = { source: 'user' };
export const DEFAULT_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function speedPlugin(o: SpeedPluginOptions = {}): Plugin {
  return {
    name: 'speed',
    setup(ctx) {
      const speeds = o.speeds ?? ctx.options.speeds ?? DEFAULT_SPEEDS;
      const defaultSpeed = o.defaultSpeed ?? ctx.options.defaultSpeed;
      ctx.store.set({ speeds });

      const offs = [
        ctx.commands.register('setSpeedIndex', ([index]) => {
          const rate = speeds[index];
          if (rate) ctx.commands.run('setRate', [rate]);
        }),
        ctx.registerMenu({
          id: 'speed',
          label: 'speed',
          order: 20,
          visible: () => speeds.length > 1,
          options: () => speeds.map((rate) => ({ label: rate === 1 ? ctx.t('normal') : `${rate}x`, value: rate })),
          current: (s) => s.rate,
          select: (value) => ctx.commands.run('setRate', [value as number], USER),
        }),
        ctx.events.on('init', () => {
          if (defaultSpeed && defaultSpeed > 0) ctx.commands.run('setRate', [defaultSpeed]);
        }),
      ];
      return () => offs.forEach((off) => off());
    },
  };
}
```

- [ ] **Step 4: Implement `src/plugins/audiotracks.ts`**

```ts
import type { CommandContext, Plugin } from '../types';

declare module '../types' {
  interface PlayerOptions {
    /** Track label to start with. PlayerJS: default_audio. */
    defaultAudio?: string;
    /** Rename menu labels by original label or index. PlayerJS: rename_audio. */
    renameAudio?: Record<string, string>;
  }
}

export interface AudioTracksPluginOptions {
  defaultAudio?: string;
  renameAudio?: Record<string | number, string>;
}

const USER: CommandContext = { source: 'user' };

export function audioTracksPlugin(o: AudioTracksPluginOptions = {}): Plugin {
  return {
    name: 'audiotracks',
    setup(ctx) {
      const wanted = o.defaultAudio ?? ctx.options.defaultAudio;
      const rename: Record<string, string> = { ...(ctx.options.renameAudio ?? {}), ...(o.renameAudio ?? {}) };
      const display = (label: string, index: number) => rename[label] ?? rename[String(index)] ?? (label || String(index + 1));

      const offTransform = ctx.addSourceTransform((spec, sel) => {
        if (!wanted) return sel;
        const index = (spec.qualities[sel.quality]?.tracks ?? []).findIndex((t) => t.label === wanted);
        return index >= 0 ? { ...sel, audio: index } : sel;
      });

      const offMenu = ctx.registerMenu({
        id: 'audio',
        label: 'audio',
        order: 40,
        visible: (s) => s.audioTracks.length > 1,
        options: (s) => s.audioTracks.map((t, i) => ({ label: display(t.label, i), value: i })),
        current: (s) => s.audioTrack,
        select: (value) => ctx.commands.run('setAudioTrack', [value as number], USER),
      });

      return () => {
        offTransform();
        offMenu();
      };
    },
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/plugins/speed-audio.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/plugins/speed.ts src/plugins/audiotracks.ts tests/plugins/speed-audio.test.ts
git commit -m "feat(plugins): add speed and audio track plugins"
```

### Task 6.4: Hotkeys plugin

**Files:**
- Create: `src/plugins/hotkeys.ts`
- Test: `tests/plugins/hotkeys.test.ts`

Uses `KeyboardEvent.code` so shortcuts work in any keyboard layout (e.g. Russian `а` is `KeyF`). Ignores events already handled (`defaultPrevented`), modifier chords, text inputs, and Space/Enter on focused buttons (the button handles them natively).

- [ ] **Step 1: Write the failing test `tests/plugins/hotkeys.test.ts`**

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { hotkeysPlugin, type HotkeysOptions } from '../../src/plugins/hotkeys';
import { speedPlugin } from '../../src/plugins/speed';
import { qualityPlugin } from '../../src/plugins/quality';
import { createTestPlayer } from '../helpers/player-harness';
import type { CommandName, Player, Plugin, PlayerState, Store } from '../../src/types';

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

  it('changes volume with the wheel only in fullscreen', () => {
    player.root.dispatchEvent(new WheelEvent('wheel', { deltaY: -1, cancelable: true }));
    expect(calls).toEqual([]);
    store.set({ fullscreen: true });
    player.root.dispatchEvent(new WheelEvent('wheel', { deltaY: -1, cancelable: true }));
    player.root.dispatchEvent(new WheelEvent('wheel', { deltaY: 1, cancelable: true }));
    expect(calls).toEqual([
      ['setVolume', ['+0.1'], 'user'],
      ['setVolume', ['-0.1'], 'user'],
    ]);
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/plugins/hotkeys.test.ts`
Expected: FAIL — cannot resolve `../../src/plugins/hotkeys`.

- [ ] **Step 3: Implement `src/plugins/hotkeys.ts`**

```ts
import type { CommandArgs, CommandContext, CommandName, Plugin } from '../types';

export interface HotkeysOptions {
  seekStep?: number;
  volumeStep?: number;
  enter?: boolean;
  numbers?: boolean;
  wheel?: boolean;
  /** Also handle keys on the document while the pointer is over the player. */
  global?: boolean;
}

declare module '../types' {
  interface PlayerOptions {
    hotkeys?: HotkeysOptions | false;
  }
}

const USER: CommandContext = { source: 'user' };
const DEFAULTS: Required<HotkeysOptions> = { seekStep: 5, volumeStep: 0.1, enter: false, numbers: true, wheel: true, global: false };
const TEXT_INPUT = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';

export function hotkeysPlugin(o?: HotkeysOptions | false): Plugin {
  return {
    name: 'hotkeys',
    setup(ctx) {
      if (o === false || ctx.options.hotkeys === false) return;
      const cfg: Required<HotkeysOptions> = { ...DEFAULTS, ...(ctx.options.hotkeys || {}), ...(o ?? {}) };
      let hovered = false;

      const user = <K extends CommandName>(name: K, ...args: CommandArgs<K>) => {
        const result = ctx.commands.run(name, args, USER);
        if (result instanceof Promise) result.catch((e) => ctx.log.warn(`hotkey "${name}" rejected`, e));
      };

      const actionFor = (e: KeyboardEvent): (() => void) | null => {
        const code = e.code || e.key;
        switch (code) {
          case 'Space':
          case ' ':
            return () => user('toggle');
          case 'Enter':
            return cfg.enter ? () => user('toggle') : null;
          case 'KeyF':
            return () => user('toggleFullscreen');
          case 'KeyM':
            return () => user('toggleMute');
          case 'ArrowLeft':
            return () => user('seek', `-${cfg.seekStep}`);
          case 'ArrowRight':
            return () => user('seek', `+${cfg.seekStep}`);
          case 'ArrowUp':
            return () => user('setVolume', `+${cfg.volumeStep}`);
          case 'ArrowDown':
            return () => user('setVolume', `-${cfg.volumeStep}`);
        }
        const digit = code.match(/^(?:Digit|Numpad)(\d)$/);
        if (digit && cfg.numbers) {
          const duration = ctx.store.get().duration;
          if (!(duration > 0)) return null;
          const n = Number(digit[1]);
          return () => user('seek', (duration * n) / 10);
        }
        return null;
      };

      const onKey = (e: KeyboardEvent) => {
        if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
        const target = e.target as Element | null;
        if (target?.closest?.(TEXT_INPUT) || target?.closest?.('[role="menu"]')) return;
        const code = e.code || e.key;
        if ((code === 'Space' || code === ' ' || code === 'Enter') && target?.closest?.('button')) return;
        const action = actionFor(e);
        if (!action) return;
        e.preventDefault();
        action();
      };

      const onDocumentKey = (e: KeyboardEvent) => {
        if (!hovered || ctx.root.contains(e.target as Node)) return;
        onKey(e);
      };

      const onWheel = (e: WheelEvent) => {
        if (!cfg.wheel || !ctx.store.get().fullscreen) return;
        e.preventDefault();
        user('setVolume', e.deltaY < 0 ? `+${cfg.volumeStep}` : `-${cfg.volumeStep}`);
      };

      const onEnter = () => (hovered = true);
      const onLeave = () => (hovered = false);

      ctx.root.addEventListener('keydown', onKey);
      ctx.root.addEventListener('wheel', onWheel, { passive: false });
      ctx.root.addEventListener('pointerenter', onEnter);
      ctx.root.addEventListener('pointerleave', onLeave);
      if (cfg.global) document.addEventListener('keydown', onDocumentKey);

      return () => {
        ctx.root.removeEventListener('keydown', onKey);
        ctx.root.removeEventListener('wheel', onWheel);
        ctx.root.removeEventListener('pointerenter', onEnter);
        ctx.root.removeEventListener('pointerleave', onLeave);
        document.removeEventListener('keydown', onDocumentKey);
      };
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/plugins/hotkeys.test.ts`
Expected: PASS. (`setup()` in the tests creates a new player per call; the harness clears `document.body`, so earlier players' root listeners are detached from the DOM. Document listeners from an earlier `global` player are not removed — the tests only enable `global` once per test.)

- [ ] **Step 5: Commit**

```bash
git add src/plugins/hotkeys.ts tests/plugins/hotkeys.test.ts
git commit -m "feat(plugins): add hotkeys plugin"
```

### Task 6.5: Autoplay plugin

**Files:**
- Create: `src/plugins/autoplay.ts`
- Test: `tests/plugins/autoplay.test.ts`

Autoplay applies to the **first source only** (the page-load source), on its first `metadata` (spec §3.4 "play after load"). Later loads decide for themselves: `api('play', url)`, playlist `playItem(id, true)` and autonext play explicitly, while `api('file', url)` / `api('find', id)` must *not* start playback. `NotAllowedError` → mute and retry. After a muted autoplay, the first user `toggle` unmutes instead of pausing.

- [ ] **Step 1: Write the failing test `tests/plugins/autoplay.test.ts`**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { autoplayPlugin } from '../../src/plugins/autoplay';
import { createTestPlayer } from '../helpers/player-harness';
import { flush } from '../helpers/flush';

const notAllowed = () => new DOMException('autoplay blocked', 'NotAllowedError');

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('autoplayPlugin', () => {
  it('does nothing without the autoplay option', async () => {
    const { media } = createTestPlayer({ plugins: [autoplayPlugin()], source: 'a.mp4' });
    await flush();
    expect(media.play).not.toHaveBeenCalled();
  });

  it('plays the first source after metadata, and not later loads', async () => {
    const { player, media } = createTestPlayer({ plugins: [autoplayPlugin()], autoplay: true, source: '[a]a.mp4,[b]b.mp4' });
    await flush();
    expect(media.play).toHaveBeenCalledTimes(1);
    expect(player.state.status).toBe('playing');
    player.command('setQuality', 0);
    await flush();
    expect(media.play).toHaveBeenCalledTimes(2); // resume after switch (core), not autoplay
    player.pause();
    player.api('file', 'c.mp4');
    await flush();
    expect(media.play).toHaveBeenCalledTimes(2);
  });

  it('falls back to muted autoplay and unmutes on the first user toggle', async () => {
    const { player, media, host } = createTestPlayer({ plugins: [autoplayPlugin()], autoplay: true });
    media.rejectNextPlay(notAllowed());
    player.load('a.mp4');
    await flush();
    expect(player.state.muted).toBe(true);
    expect(player.state.status).toBe('playing');
    host.querySelector<HTMLElement>('.vp-click-layer')!.click();
    expect(player.state.muted).toBe(false);
    expect(player.state.status).toBe('playing');
    host.querySelector<HTMLElement>('.vp-click-layer')!.click();
    expect(player.state.status).toBe('paused');
  });

  it('does not mute when the fallback is disabled', async () => {
    const { player, media } = createTestPlayer({ plugins: [autoplayPlugin({ muteFallback: false })], autoplay: true });
    media.rejectNextPlay(notAllowed());
    player.load('a.mp4');
    await flush();
    expect(player.state.muted).toBe(false);
    expect(console.warn).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/plugins/autoplay.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/plugins/autoplay.ts`**

```ts
import type { Plugin } from '../types';

declare module '../types' {
  interface PlayerOptions {
    /** Retry muted when the browser blocks autoplay with sound (default true). */
    autoplayMuteFallback?: boolean;
  }
}

export interface AutoplayPluginOptions {
  muteFallback?: boolean;
}

const isNotAllowed = (e: unknown) => (e as { name?: string } | null)?.name === 'NotAllowedError';

export function autoplayPlugin(o: AutoplayPluginOptions = {}): Plugin {
  return {
    name: 'autoplay',
    setup(ctx) {
      if (!ctx.options.autoplay) return;
      const muteFallback = o.muteFallback ?? ctx.options.autoplayMuteFallback ?? true;
      let armed = false;
      let firstSource = true;
      let mutedByAutoplay = false;

      const attempt = () => {
        ctx.player.play().catch((err) => {
          if (muteFallback && isNotAllowed(err) && !ctx.store.get().muted) {
            mutedByAutoplay = true;
            ctx.commands.run('mute', []);
            ctx.player.play().catch((e) => ctx.log.warn('muted autoplay failed', e));
          } else {
            ctx.log.warn('autoplay failed', err);
          }
        });
      };

      const offs = [
        ctx.events.on('new', () => {
          armed = firstSource;
          firstSource = false;
        }),
        ctx.events.on('metadata', () => {
          if (!armed) return;
          armed = false;
          attempt();
        }),
        ctx.events.on('unmute', () => {
          mutedByAutoplay = false;
        }),
        ctx.commands.before('toggle', (_args, c) => {
          if (!mutedByAutoplay || c.source !== 'user' || ctx.store.get().status !== 'playing') return;
          mutedByAutoplay = false;
          ctx.commands.run('unmute', []);
          return false;
        }),
      ];
      return () => offs.forEach((off) => off());
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/plugins/autoplay.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/plugins/autoplay.ts tests/plugins/autoplay.test.ts
git commit -m "feat(plugins): add autoplay plugin with muted fallback"
```

## Chunk 6b: Memory plugin

### Task 6.6: Memory plugin (continue playback and preferences)

**Files:**
- Create: `src/plugins/memory.ts`
- Test: `tests/plugins/memory.test.ts`

Persists to `localStorage` (spec §7): position per source (`vp:t:<key>`, JSON `{ t, d }`), and global preferences `vp:volume`, `vp:muted`, `vp:speed`, `vp:quality`, `vp:audio`, `vp:subtitle`. Restores volume/mute/speed/subtitle preference on `init`, and position/quality/audio through a `SourceTransform` (registered after the quality/audio plugins, so saved values win over `default_*`). Storage errors (private mode, quota) are swallowed.

Mute is persisted only when it comes from an explicit `mute`/`toggleMute` command (`api` or `user` source) — a muted *autoplay fallback* (internal) must not make every later visit start muted. Unmute is always persisted.

**User contribution (learning mode):** `shouldRestorePosition(saved, duration)` decides whether to resume. It is a UX decision (resume a few seconds in? near the end?), so Step 4 asks the human to write it (after Step 3 created the file with the reference rule). The reference rule — resume only if more than 5 s in and more than 10 s before the recorded end (or the duration is unknown) — is given for when they decline; the tests below encode the reference rule and should be adjusted if the human chooses differently.

- [ ] **Step 1: Write the failing test `tests/plugins/memory.test.ts`**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryPlugin, shouldRestorePosition } from '../../src/plugins/memory';
import { speedPlugin } from '../../src/plugins/speed';
import { createTestPlayer } from '../helpers/player-harness';
import { flush } from '../helpers/flush';
import type { CommandRegistry, Plugin } from '../../src/types';

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('shouldRestorePosition (reference rule)', () => {
  it('restores in the middle and when the duration is unknown', () => {
    expect(shouldRestorePosition(30, 100)).toBe(true);
    expect(shouldRestorePosition(30, NaN)).toBe(true);
  });
  it('skips the very beginning and the last 10 seconds', () => {
    expect(shouldRestorePosition(3, 100)).toBe(false);
    expect(shouldRestorePosition(95, 100)).toBe(false);
  });
});

describe('memoryPlugin preferences', () => {
  it('restores volume, mute, speed and preferred subtitle on init', () => {
    localStorage.setItem('vp:volume', '0.3');
    localStorage.setItem('vp:muted', '1');
    localStorage.setItem('vp:speed', '1.5');
    localStorage.setItem('vp:subtitle', 'Ru');
    const { player } = createTestPlayer({ plugins: [memoryPlugin()] });
    expect(player.state.volume).toBe(0.3);
    expect(player.state.muted).toBe(true);
    expect(player.state.rate).toBe(1.5);
    expect(player.state.preferredSubtitle).toBe('Ru');
  });

  it('saves volume, speed, quality, audio and subtitle changes', async () => {
    const { player, fp } = createTestPlayer({ plugins: [memoryPlugin()], source: '[a]{En}a.mp4;{Ru}ar.mp4,[b]{En}b.mp4;{Ru}br.mp4' });
    await flush();
    player.command('setVolume', 0.6);
    player.command('setRate', 2);
    player.command('setQuality', 0);
    player.command('setAudioTrack', 1);
    await flush();
    expect(localStorage.getItem('vp:volume')).toBe('0.6');
    expect(localStorage.getItem('vp:speed')).toBe('2');
    expect(localStorage.getItem('vp:quality')).toBe('a');
    expect(localStorage.getItem('vp:audio')).toBe('Ru');
    player.load('[a]{En}a.mp4;{Ru}ar.mp4,[b]{En}b.mp4;{Ru}br.mp4');
    await flush();
    expect(fp.loads[fp.loads.length - 1]!.url).toBe('ar.mp4');
  });

  it('persists explicit mute but not internal (autoplay) mute', () => {
    let commands!: CommandRegistry;
    const grab: Plugin = { name: 'grab', setup: (ctx) => void (commands = ctx.commands) };
    const { player } = createTestPlayer({ plugins: [grab, memoryPlugin()] });
    commands.run('mute', []);
    expect(localStorage.getItem('vp:muted')).toBeNull();
    player.command('unmute');
    expect(localStorage.getItem('vp:muted')).toBe('0');
    player.command('toggleMute');
    expect(localStorage.getItem('vp:muted')).toBe('1');
  });

  it('saved speed wins over defaultSpeed from the speed plugin', () => {
    localStorage.setItem('vp:speed', '2');
    const { player } = createTestPlayer({ plugins: [speedPlugin(), memoryPlugin()], defaultSpeed: 1.5 });
    expect(player.state.rate).toBe(2);
    expect(localStorage.getItem('vp:speed')).toBe('2');
  });

  it('can be disabled', () => {
    localStorage.setItem('vp:volume', '0.2');
    const { player } = createTestPlayer({ plugins: [memoryPlugin()], memory: false });
    expect(player.state.volume).toBe(1);
  });

  it('survives a localStorage getter that throws (sandboxed iframe)', () => {
    const spy = vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { player } = createTestPlayer({ plugins: [memoryPlugin()], cuid: 'x' });
    player.command('setVolume', 0.4);
    expect(player.state.volume).toBe(0.4);
    expect(error).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('survives a throwing storage', async () => {
    const storage = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    } as unknown as Storage;
    const { player } = createTestPlayer({ plugins: [memoryPlugin({ storage })], source: 'a.mp4' });
    await flush();
    player.command('setVolume', 0.5);
    expect(player.state.volume).toBe(0.5);
  });
});

describe('memoryPlugin position', () => {
  it('saves every 5 seconds and on pause, and clears on end', async () => {
    const { player, media } = createTestPlayer({ plugins: [memoryPlugin()], cuid: 'v1', source: 'a.mp4' });
    await flush();
    media.setDuration(100);
    media.timeTo(12);
    expect(JSON.parse(localStorage.getItem('vp:t:v1')!)).toEqual({ t: 12, d: 100 });
    media.timeTo(14);
    expect(JSON.parse(localStorage.getItem('vp:t:v1')!).t).toBe(12);
    media.timeTo(18);
    expect(JSON.parse(localStorage.getItem('vp:t:v1')!).t).toBe(18);
    await player.play();
    media.timeTo(19);
    player.pause();
    expect(JSON.parse(localStorage.getItem('vp:t:v1')!).t).toBe(19);
    media.end();
    expect(localStorage.getItem('vp:t:v1')).toBeNull();
  });

  it('restores a saved position through the source transform', async () => {
    localStorage.setItem('vp:t:v2', JSON.stringify({ t: 30, d: 100 }));
    const { fp } = createTestPlayer({ plugins: [memoryPlugin()], cuid: 'v2', source: 'a.mp4' });
    await flush();
    expect(fp.loads[0]!.start).toBe(30);
  });

  it('does not restore near the end', async () => {
    localStorage.setItem('vp:t:v3', JSON.stringify({ t: 95, d: 100 }));
    const { fp } = createTestPlayer({ plugins: [memoryPlugin()], cuid: 'v3', source: 'a.mp4' });
    await flush();
    expect(fp.loads[0]!.start).toBe(0);
  });

  it('keys by page, player id and source without cuid, and setCuid switches the key', async () => {
    const { player, media } = createTestPlayer({ plugins: [memoryPlugin()], source: 'a.mp4' });
    await flush();
    media.setDuration(100);
    media.timeTo(20);
    expect(localStorage.getItem(`vp:t:${location.pathname}#p#a.mp4`)).not.toBeNull();
    player.command('setCuid', 'custom');
    expect(player.state.cuid).toBe('custom');
    expect(player.api('cuid')).toBe('custom');
  });

  it('does not save live streams', async () => {
    const { media } = createTestPlayer({ plugins: [memoryPlugin()], cuid: 'live', source: 'a.m3u8' });
    await flush();
    media.setDuration(Infinity);
    media.timeTo(50);
    expect(localStorage.getItem('vp:t:live')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/plugins/memory.test.ts`
Expected: FAIL — cannot resolve `../../src/plugins/memory`.

- [ ] **Step 3: Implement `src/plugins/memory.ts` (with the reference rule)**

```ts
import type { CommandContext, Plugin } from '../types';
import { sourceKey } from '../source/parse';

export interface MemoryOptions {
  position?: boolean;
  volume?: boolean;
  quality?: boolean;
  speed?: boolean;
  subtitle?: boolean;
  audio?: boolean;
  /** Defaults to window.localStorage; `null` disables persistence. */
  storage?: Storage | null;
}

declare module '../types' {
  interface PlayerOptions {
    memory?: Omit<MemoryOptions, 'storage'> | false;
    /** Stable id for remembering the position. PlayerJS: cuid. */
    cuid?: string;
  }
  interface PlayerState {
    cuid?: string;
  }
  interface PlayerCommands {
    setCuid(id: string): void;
  }
}

const KEYS = {
  volume: 'vp:volume',
  muted: 'vp:muted',
  speed: 'vp:speed',
  quality: 'vp:quality',
  audio: 'vp:audio',
  subtitle: 'vp:subtitle',
} as const;
const SAVE_EVERY_SECONDS = 5;

/**
 * Whether to resume from a saved position.
 * @param saved    saved playback position, seconds
 * @param duration duration recorded with the position (NaN when unknown)
 */
export function shouldRestorePosition(saved: number, duration: number): boolean {
  // Step 3: written by the human, or the reference rule below.
  return saved > 5 && (!(duration > 0) || saved < duration - 10);
}

const explicit = (c: CommandContext) => c.source !== 'internal';

/** Reading `localStorage` itself throws SecurityError in opaque origins (sandboxed iframes, blocked storage). */
function defaultStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function memoryPlugin(o: MemoryOptions = {}): Plugin {
  return {
    name: 'memory',
    setup(ctx) {
      if (ctx.options.memory === false) return;
      const cfg = { position: true, volume: true, quality: true, speed: true, subtitle: true, audio: true, ...(ctx.options.memory || {}), ...o };
      const storage = o.storage !== undefined ? o.storage : defaultStorage();

      const get = (key: string): string | null => {
        try {
          return storage?.getItem(key) ?? null;
        } catch {
          return null;
        }
      };
      const set = (key: string, value: string) => {
        try {
          storage?.setItem(key, value);
        } catch {
          /* private mode or quota exceeded */
        }
      };
      const remove = (key: string) => {
        try {
          storage?.removeItem(key);
        } catch {
          /* ignore */
        }
      };
      const num = (value: string | null) => {
        if (value === null) return null;
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
      };
      const readPosition = (key: string): { t: number; d: number } | null => {
        try {
          const value = JSON.parse(get(key) ?? 'null') as { t?: unknown; d?: unknown } | null;
          return value && typeof value.t === 'number' ? { t: value.t, d: typeof value.d === 'number' ? value.d : NaN } : null;
        } catch {
          return null;
        }
      };

      ctx.store.set({ cuid: ctx.options.cuid });
      const saved = {
        volume: num(get(KEYS.volume)),
        muted: get(KEYS.muted),
        speed: num(get(KEYS.speed)),
        subtitle: get(KEYS.subtitle),
      };
      let positionKey: string | null = null;
      let lastSaved = -Infinity;

      const savePosition = () => {
        const s = ctx.store.get();
        if (!positionKey || s.live || !(s.currentTime > 0)) return;
        lastSaved = s.currentTime;
        set(positionKey, JSON.stringify({ t: s.currentTime, d: s.duration }));
      };

      const offs: Array<() => void> = [
        ctx.commands.register('setCuid', ([id]) => ctx.store.set({ cuid: id })),

        ctx.events.on('init', () => {
          // Apply the snapshot taken in setup: other plugins' init handlers (e.g. speed's defaultSpeed)
          // may already have fired change events that this plugin persisted.
          if (cfg.volume) {
            if (saved.volume !== null) ctx.commands.run('setVolume', [saved.volume]);
            if (saved.muted === '1') ctx.commands.run('mute', []);
          }
          if (cfg.speed && saved.speed !== null && saved.speed > 0) ctx.commands.run('setRate', [saved.speed]);
          if (cfg.subtitle && saved.subtitle !== null) ctx.store.set({ preferredSubtitle: saved.subtitle });
        }),

        ctx.addSourceTransform((spec, sel) => {
          let next = sel;
          const id = ctx.store.get().cuid ?? `${location.pathname}#${ctx.player.id}#${sourceKey(spec)}`;
          positionKey = cfg.position ? `vp:t:${id}` : null;
          lastSaved = -Infinity;
          if (positionKey) {
            const saved = readPosition(positionKey);
            if (saved && shouldRestorePosition(saved.t, saved.d)) next = { ...next, start: saved.t };
          }
          if (cfg.quality) {
            const label = get(KEYS.quality);
            const index = label === null ? -1 : spec.qualities.findIndex((q) => q.label === label);
            if (index >= 0) next = { ...next, quality: index };
          }
          if (cfg.audio) {
            const label = get(KEYS.audio);
            const tracks = spec.qualities[next.quality]?.tracks ?? [];
            const index = label === null ? -1 : tracks.findIndex((t) => t.label === label);
            if (index >= 0) next = { ...next, audio: index };
          }
          return next;
        }),

        ctx.events.on('time', (t) => {
          if (Math.abs(t - lastSaved) >= SAVE_EVERY_SECONDS) savePosition();
        }),
        ctx.events.on('pause', savePosition),
        ctx.events.on('end', () => {
          if (positionKey) remove(positionKey);
        }),

        ctx.events.on('volume', (v) => {
          if (cfg.volume) set(KEYS.volume, String(v));
        }),
        ctx.commands.before('mute', (_args, c) => {
          if (cfg.volume && explicit(c)) set(KEYS.muted, '1');
        }),
        ctx.commands.before('toggleMute', (_args, c) => {
          if (cfg.volume && explicit(c)) set(KEYS.muted, ctx.store.get().muted ? '0' : '1');
        }),
        ctx.events.on('unmute', () => {
          if (cfg.volume) set(KEYS.muted, '0');
        }),
        ctx.events.on('speed', (rate) => {
          if (cfg.speed) set(KEYS.speed, String(rate));
        }),
        ctx.events.on('quality', (label) => {
          if (cfg.quality) set(KEYS.quality, label);
        }),
        ctx.events.on('audiotrack', (label) => {
          if (cfg.audio) set(KEYS.audio, label);
        }),
        ctx.events.on('subtitle', (label) => {
          if (cfg.subtitle) set(KEYS.subtitle, label);
        }),
      ];
      return () => offs.forEach((off) => off());
    },
  };
}
```

- [ ] **Step 4: User contribution — `shouldRestorePosition`**

Now hand the function to the human: ask them to replace the body of `shouldRestorePosition(saved: number, duration: number): boolean` in `src/plugins/memory.ts` (5–10 lines). Trade-offs to mention: resuming at 0:03 is pointless; resuming in the credits annoys; `duration` may be `NaN` when the source was never fully loaded. If they decline, keep the reference body already in the file:

```ts
  return saved > 5 && (!(duration > 0) || saved < duration - 10);
```

If they choose different thresholds, update the two `shouldRestorePosition` tests and the "does not restore near the end" test to match.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/plugins/memory.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the whole suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: all pass; typecheck exits 0.

- [ ] **Step 7: Commit**

```bash
git add src/plugins/memory.ts tests/plugins/memory.test.ts
git commit -m "feat(plugins): add memory plugin for position and preferences"
```
