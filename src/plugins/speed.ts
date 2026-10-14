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
        ctx.commands.register('setSpeedIndex', ([index], c) => {
          const rate = speeds[index];
          if (rate) ctx.commands.run('setRate', [rate], c);
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
