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
