import type { Plugin, SourceSpecInput } from '../../types';
import { isPlaylistInput, parseSource, parseSubtitleList } from '../../source/parse';
import { createIconButton } from '../../ui/button';
import { findIndex, flattenPlaylist, loadPlaylistInput, normalizePlaylist, type PlaylistItem, type PlaylistState } from './model';
import { playlistPanelComponent } from './panel';

export type { PlaylistItem, PlaylistState } from './model';

declare module '../../types' {
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
      ctx.store.set({ autonext: o.autonext ?? ctx.options.autonext ?? true, playlistLoop: o.playlistLoop ?? ctx.options.playlistLoop ?? false });

      const current = () => ctx.store.get().playlist;
      const setOpen = (open: boolean) => {
        const pl = current();
        if (pl) ctx.store.set({ playlist: { ...pl, open } });
      };

      /** Spec §3.4: play after the provider loaded the item; cancelled by the next load or an error. */
      const playAfterLoad = () => {
        const offs: Array<() => void> = [];
        const cleanup = () => offs.forEach((off) => off());
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
        ctx.commands.run('load', [input]);
        if (autoplay) playAfterLoad();
      };

      const setItems = (items: PlaylistItem[]) => {
        const flat = flattenPlaylist(items);
        const startIndex = plstart !== undefined ? Math.max(0, findIndex(flat, plstart)) : 0;
        plstart = undefined;
        ctx.store.set({ playlist: { items, flat, index: -1, open: current()?.open ?? startOpen } });
        ctx.events.emit('playlist', items);
        if (flat.length) playIndex(startIndex, false);
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
      ctx.registerHideRule('first-item', () => ({ test: (s) => !s.playlist || (s.playlist.index <= 0 && !s.playlistLoop) }));
      ctx.registerHideRule('last-item', () => ({ test: (s) => !s.playlist || (s.playlist.index >= s.playlist.flat.length - 1 && !s.playlistLoop) }));
      ctx.registerHideRule('no-playlist', () => ({ test: (s) => !s.playlist || s.playlist.flat.length < 2 }));
      ctx.registerHideRule('playlist-closed', () => ({ test: (s) => !s.playlist?.open }));

      const offs: Array<() => void> = [
        ctx.addLayer({ type: 'playlist-panel', hide: ['playlist-closed'] }, 'above-ui'),

        ctx.commands.before('load', ([input]) => {
          if (!isPlaylistInput(input)) {
            request++; // a direct load supersedes a playlist that is still loading
            return;
          }
          open(input as string);
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
          const pl = current();
          const added = normalizePlaylist(items);
          if (!pl) {
            setItems(added);
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
          const index = neighbour(1);
          if (index !== null) playIndex(index, true);
        }),
      ];

      return () => offs.forEach((off) => off());
    },
  };
}
