import type { Plugin, SourceSpecInput } from '../../types.js';
import { isPlaylistInput, isSourceSpecInput, parseSource, parseSubtitleList } from '../../source/parse.js';
import { createIconButton } from '../../ui/button.js';
import { findIndex, flattenPlaylist, loadPlaylistInput, normalizePlaylist, type PlaylistItem, type PlaylistState } from './model.js';
import { playlistPanelComponent } from './panel.js';

export type { PlaylistItem, PlaylistState } from './model.js';

declare module '../../types.js' {
  interface PlayerState {
    playlist?: PlaylistState;
    autonext?: boolean;
    playlistLoop?: boolean;
  }
  interface PlayerOptions {
    /** Play the next item at the end (default true). */
    autonext?: boolean;
    /** Wrap around at the ends. PlayerJS: playlistloop. */
    playlistLoop?: boolean;
    /** Item id to start with. PlayerJS: plstart. */
    plstart?: string;
    /** Keep the panel closed initially (default true). PlayerJS: hideplaylist. */
    hidePlaylist?: boolean;
  }
  interface PlayerCommands {
    next(): void;
    prev(): void;
    playItem(idOrIndex: string | number, autoplay?: boolean): void;
    push(items: PlaylistItem[]): void;
    setPlaylist(input: string | PlaylistItem[]): void;
    togglePlaylist(): void;
    setAutonext(on: boolean): void;
    setPlaylistLoop(on: boolean): void;
  }
}

export interface PlaylistPluginOptions {
  autonext?: boolean;
  playlistLoop?: boolean;
  plstart?: string;
  hidePlaylist?: boolean;
  fetch?: typeof fetch;
}

export function playlistPlugin(o: PlaylistPluginOptions = {}): Plugin {
  return {
    name: 'playlist',
    setup(ctx) {
      const fetchFn = o.fetch ?? fetch.bind(globalThis);
      const startOpen = (o.hidePlaylist ?? ctx.options.hidePlaylist ?? true) === false;
      let plstart = o.plstart ?? ctx.options.plstart;
      let itemThumbs = false;
      /** True while the plugin itself issues `load`, so the before-hook can tell it from a direct load. */
      let internal = false;
      /** The exact input `playIndex` last passed to `load`; `reload` replays it and must not drop the playlist. */
      let lastItemInput: SourceSpecInput | null = null;
      /** Bumped by every navigation or direct load; deferred steps (autonext) check it before running. */
      let epoch = 0;
      let cancelPlay: (() => void) | null = null;
      ctx.store.set({ autonext: o.autonext ?? ctx.options.autonext ?? true, playlistLoop: o.playlistLoop ?? ctx.options.playlistLoop ?? false });

      const current = () => ctx.store.get().playlist;
      const setOpen = (open: boolean) => {
        const pl = current();
        if (pl) ctx.store.set({ playlist: { ...pl, open } });
      };

      /** Spec §3.4: play after the provider loaded the item; cancelled by the next load or an error. */
      const playAfterLoad = () => {
        cancelPlay?.();
        const offs: Array<() => void> = [];
        const cleanup = () => {
          offs.forEach((off) => off());
          if (cancelPlay === cleanup) cancelPlay = null;
        };
        cancelPlay = cleanup;
        offs.push(
          ctx.events.once('metadata', () => {
            cleanup();
            ctx.player.play().catch((e) => ctx.log.warn('playlist play rejected', e));
          }),
          ctx.events.once('new', cleanup),
          ctx.events.once('error', cleanup),
        );
      };

      const playIndex = (index: number, autoplay: boolean) => {
        const pl = current();
        const entry = pl?.flat[index];
        if (!pl || !entry) return;
        epoch++;
        const item = entry.item;
        const startTime = item.start === 'continue' ? ctx.store.get().currentTime : typeof item.start === 'number' ? item.start : undefined;
        ctx.store.set({ playlist: { ...pl, index } });
        ctx.commands.run('setTitle', [item.title !== undefined ? String(item.title) : '']);
        ctx.commands.run('setPoster', [item.poster !== undefined ? String(item.poster) : '']);
        if (ctx.commands.has('setThumbnails') && (item.thumbnails || itemThumbs)) {
          itemThumbs = !!item.thumbnails;
          ctx.commands.run('setThumbnails', [item.thumbnails ? String(item.thumbnails) : (ctx.options.thumbnails ?? '')]);
        }
        const spec = parseSource(String(item.file), { qualities: ctx.options.qualities });
        const input: SourceSpecInput = {
          ...spec,
          subtitles: [...spec.subtitles, ...(item.subtitle ? parseSubtitleList(String(item.subtitle)) : [])],
        };
        const start = startTime ?? spec.start;
        if (start !== undefined) input.start = start;
        else delete input.start;
        lastItemInput = input;
        internal = true;
        try {
          ctx.commands.run('load', [input]);
        } finally {
          internal = false;
        }
        if (autoplay) playAfterLoad();
      };

      const setItems = (items: PlaylistItem[], load = true) => {
        const flat = flattenPlaylist(items);
        ctx.store.set({ playlist: { items, flat, index: -1, open: current()?.open ?? startOpen } });
        ctx.events.emit('playlist', items);
        if (!load || !flat.length) return;
        const startIndex = plstart !== undefined ? Math.max(0, findIndex(flat, plstart)) : 0;
        plstart = undefined;
        playIndex(startIndex, false);
      };

      let request = 0;
      const open = (input: string | PlaylistItem[]) => {
        const id = ++request;
        const loading = typeof input === 'string' ? loadPlaylistInput(input, fetchFn) : Promise.resolve().then(() => normalizePlaylist(input));
        loading.then((items) => {
          if (id === request) setItems(items);
        }).catch((e: unknown) => {
          ctx.log.warn('playlist failed to load', e);
          ctx.events.emit('loaderror', { url: typeof input === 'string' ? input : '', error: { kind: 'network', message: String(e) } });
        });
      };

      const neighbour = (step: 1 | -1): number | null => {
        const pl = current();
        if (!pl || !pl.flat.length) return null;
        const next = pl.index + step;
        if (next >= 0 && next < pl.flat.length) return next;
        return ctx.store.get().playlistLoop ? (next + pl.flat.length) % pl.flat.length : null;
      };

      // Components
      ctx.registerComponent('prev', (ui) => {
        const b = createIconButton(ui, 'vp-prev', () => ui.user('prev'));
        b.setIcon('prev');
        b.setLabel('prev');
        return { el: b.el };
      });
      ctx.registerComponent('next', (ui) => {
        const b = createIconButton(ui, 'vp-next', () => ui.user('next'));
        b.setIcon('next');
        b.setLabel('next');
        return { el: b.el };
      });
      ctx.registerComponent('playlist-button', (ui) => {
        const b = createIconButton(ui, 'vp-playlist-button', () => ui.user('togglePlaylist'));
        b.setIcon('playlist');
        b.setLabel('playlist');
        b.el.setAttribute('aria-controls', `${ui.player.id}_playlist`);
        ui.select((s) => !!s.playlist?.open, (isOpen) => b.el.setAttribute('aria-expanded', String(isOpen)), { immediate: true });
        return { el: b.el };
      });
      ctx.registerComponent(
        'playlist-panel',
        playlistPanelComponent(
          (index) => {
            setOpen(false);
            playIndex(index, true);
          },
          () => setOpen(false),
        ),
      );

      // Hide rules
      ctx.registerHideRule('first-item', () => ({
        test: (s) => !s.playlist || s.playlist.flat.length < 2 || (s.playlist.index <= 0 && !s.playlistLoop),
      }));
      ctx.registerHideRule('last-item', () => ({
        test: (s) => !s.playlist || s.playlist.flat.length < 2 || (s.playlist.index >= s.playlist.flat.length - 1 && !s.playlistLoop),
      }));
      ctx.registerHideRule('no-playlist', () => ({ test: (s) => !s.playlist || s.playlist.flat.length < 2 }));
      ctx.registerHideRule('playlist-closed', () => ({ test: (s) => !s.playlist?.open }));

      const offs: Array<() => void> = [
        ctx.addLayer({ type: 'playlist-panel', hide: ['playlist-closed'] }, 'above-ui'),

        ctx.commands.before('load', ([input]) => {
          if (!isPlaylistInput(input)) {
            // Invalid input is rejected by the media controller and must not drop the playlist.
            if (internal || input === lastItemInput || (typeof input !== 'string' && !isSourceSpecInput(input))) return;
            // A direct load supersedes a playlist that is still loading, and makes the current one stale.
            request++;
            epoch++;
            if (current()) ctx.store.set({ playlist: undefined });
            return;
          }
          open(input as string | PlaylistItem[]); // normalizePlaylist also unwraps item / `{ playlist }` objects
          return false;
        }),

        ctx.commands.register('setPlaylist', ([input]) => open(input)),
        ctx.commands.register('playItem', ([idOrIndex, autoplay = true]) => {
          const pl = current();
          if (!pl) return;
          const index = findIndex(pl.flat, idOrIndex);
          if (index >= 0) playIndex(index, autoplay);
        }),
        ctx.commands.register('next', () => {
          const index = neighbour(1);
          if (index === null) return;
          playIndex(index, true);
          ctx.events.emit('next');
        }),
        ctx.commands.register('prev', () => {
          const index = neighbour(-1);
          if (index === null) return;
          playIndex(index, true);
          ctx.events.emit('previous');
        }),
        ctx.commands.register('push', ([items]) => {
          request++; // supersedes an in-flight setPlaylist
          const pl = current();
          const added = normalizePlaylist(items);
          if (!pl) {
            // Don't hijack a player that already has a source.
            setItems(added, ctx.store.get().status === 'idle');
            return;
          }
          const merged = [...pl.items, ...added];
          ctx.store.set({ playlist: { ...pl, items: merged, flat: flattenPlaylist(merged) } });
          ctx.events.emit('playlist', merged);
        }),
        ctx.commands.register('togglePlaylist', () => setOpen(!current()?.open)),
        ctx.commands.register('setAutonext', ([on]) => ctx.store.set({ autonext: on })),
        ctx.commands.register('setPlaylistLoop', ([on]) => ctx.store.set({ playlistLoop: on })),

        ctx.events.on('end', () => {
          if (!ctx.store.get().autonext) return;
          // Defer so every other `end` handler (e.g. memory forgetting the finished item) runs first.
          const mark = epoch;
          queueMicrotask(() => {
            if (mark !== epoch || !ctx.store.get().autonext) return;
            const index = neighbour(1);
            if (index !== null) playIndex(index, true);
          });
        }),
      ];

      return () => {
        request++;
        epoch++;
        cancelPlay?.();
        offs.forEach((off) => off());
      };
    },
  };
}
