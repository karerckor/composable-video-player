import type { CommandContext, Plugin, SubtitleRef } from '../../types';
import { h } from '../../ui/dom';
import { controlsVisible } from '../../ui/activity';
import { parseSubtitleList } from '../../source/parse';
import { activeText, cueNodes, parseSubtitles, shiftCues, shiftFromUrl, type Cue } from './parse';

declare module '../../types' {
  interface PlayerOptions {
    /** `[Label]url,[Label]url` for the first source. PlayerJS: subtitle. */
    subtitle?: string;
    /** Label to show initially. PlayerJS: default_subtitle. */
    defaultSubtitle?: string;
    /** `false` starts with subtitles off. PlayerJS: subtitle_start:0. */
    subtitleStart?: boolean;
    /** Shift in tenths of a second. PlayerJS: subshift. */
    subshift?: number;
  }
  interface PlayerCommands {
    setTextTrack(index: number): void;
    toggleSubtitles(): void;
    addSubtitle(label: string, url: string, select?: boolean): void;
  }
}

export interface SubtitlesPluginOptions {
  subtitle?: string;
  defaultSubtitle?: string;
  subtitleStart?: boolean;
  subshift?: number;
  fetch?: typeof fetch;
}

interface Track {
  label: string;
  url: string;
  shift: number;
  cues: Cue[] | null;
  loading: Promise<void> | null;
}

const USER: CommandContext = { source: 'user' };

export function subtitlesPlugin(o: SubtitlesPluginOptions = {}): Plugin {
  return {
    name: 'subtitles',
    setup(ctx) {
      const fetchText = o.fetch ?? fetch.bind(globalThis);
      const optionList = o.subtitle ?? ctx.options.subtitle;
      const defaultLabel = o.defaultSubtitle ?? ctx.options.defaultSubtitle;
      const startOn = (o.subtitleStart ?? ctx.options.subtitleStart) !== false;
      const shiftTenths = o.subshift ?? ctx.options.subshift ?? 0;

      let tracks: Track[] = [];
      let lastEnabled = 0;
      let firstSource = true;

      const toTrack = (ref: SubtitleRef): Track => ({ label: ref.label, url: ref.url, shift: shiftFromUrl(ref.url, shiftTenths), cues: null, loading: null });
      const publish = () => ctx.store.set({ textTracks: tracks.map((t) => ({ label: t.label })) });

      const load = (track: Track) => {
        if (track.cues || track.loading) return;
        track.loading = fetchText(track.url)
          .then((response) => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.text();
          })
          .then((text) => {
            track.cues = shiftCues(parseSubtitles(text), track.shift);
          })
          .catch((e: unknown) => {
            track.cues = [];
            ctx.log.warn(`subtitles "${track.url}" failed to load`, e);
            ctx.events.emit('loaderror', { url: track.url, error: { kind: 'network', message: String(e) } });
          })
          .finally(publish); // new textTracks array → the layer re-renders
      };

      const select = (index: number, emit: boolean) => {
        const i = index >= 0 && index < tracks.length ? index : -1;
        if (i >= 0) {
          lastEnabled = i;
          load(tracks[i]!);
        }
        ctx.store.set({ textTrack: i });
        if (emit) ctx.events.emit('subtitle', i >= 0 ? tracks[i]!.label : 'off');
      };

      /** Preference (memory) → default label → off if subtitleStart:false → first track. */
      const initialIndex = () => {
        for (const wanted of [ctx.store.get().preferredSubtitle, defaultLabel]) {
          if (wanted === 'off') return -1;
          const byLabel = wanted ? tracks.findIndex((t) => t.label === wanted) : -1;
          if (byLabel >= 0) return byLabel;
        }
        return startOn && tracks.length ? 0 : -1;
      };

      ctx.registerComponent('subtitles-layer', (ui) => {
        const line = h('div', { class: 'vp-subtitles-text' });
        const el = h('div', { class: 'vp-subtitles', 'aria-live': 'polite' }, line);
        ui.select(
          (s) => {
            const track = s.textTrack >= 0 ? tracks[s.textTrack] : undefined;
            return track?.cues ? activeText(track.cues, s.currentTime) : '';
          },
          (text) => line.replaceChildren(...cueNodes(text)),
          { immediate: true },
        );
        ui.select(controlsVisible, (raised) => el.classList.toggle('vp-subtitles-raised', raised), { immediate: true });
        return { el };
      });

      const offs: Array<() => void> = [
        ctx.addLayer({ type: 'subtitles-layer' }, 'below-ui'),

        ctx.events.on('new', ({ spec }) => {
          const refs = [...spec.subtitles, ...(firstSource && optionList ? parseSubtitleList(optionList) : [])];
          firstSource = false;
          tracks = refs.map(toTrack);
          lastEnabled = 0;
          publish();
          select(initialIndex(), false);
        }),

        ctx.commands.register('setTextTrack', ([index]) => select(index, true)),
        ctx.commands.register('toggleSubtitles', () => {
          if (ctx.store.get().textTrack >= 0) select(-1, true);
          else select(lastEnabled < tracks.length ? lastEnabled : 0, true);
        }),
        ctx.commands.register('addSubtitle', ([label, url, selectIt]) => {
          tracks.push(toTrack({ label, url }));
          publish();
          if (selectIt) select(tracks.length - 1, true);
        }),

        ctx.registerMenu({
          id: 'subtitle',
          label: 'subtitles',
          order: 30,
          visible: (s) => s.textTracks.length > 0,
          options: (s) => [{ label: ctx.t('off'), value: -1 }, ...s.textTracks.map((t, i) => ({ label: t.label || String(i + 1), value: i }))],
          current: (s) => s.textTrack,
          select: (value) => ctx.commands.run('setTextTrack', [value as number], USER),
        }),
      ];
      return () => offs.forEach((off) => off());
    },
  };
}
