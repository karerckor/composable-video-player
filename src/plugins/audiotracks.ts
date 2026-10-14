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
