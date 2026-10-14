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
