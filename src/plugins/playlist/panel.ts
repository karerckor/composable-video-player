import type { ComponentFactory } from '../../types';
import { h } from '../../ui/dom';
import { createIconButton } from '../../ui/button';
import type { PlaylistItem, PlaylistState } from './model';

export function playlistPanelComponent(onSelect: (index: number) => void, onClose: () => void): ComponentFactory {
  return (ctx) => {
    const list = h('div', { class: 'vp-playlist-list' });
    const close = createIconButton(ctx, 'vp-playlist-close', onClose);
    close.setIcon('back');
    close.setLabel('close');
    const el = h(
      'div',
      { class: 'vp-playlist', id: `${ctx.player.id}_playlist`, role: 'dialog', 'aria-label': ctx.t('playlist') },
      h('div', { class: 'vp-playlist-header' }, close.el, h('span', { class: 'vp-playlist-heading' }, ctx.t('playlist'))),
      list,
    );
    ctx.listen(el, 'click', (e) => e.stopPropagation());
    ctx.listen(el, 'keydown', (e) => {
      if ((e as KeyboardEvent).key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    });

    const render = (pl: PlaylistState | undefined) => {
      list.replaceChildren();
      if (!pl) return;
      const indexOf = new Map(pl.flat.map((f) => [f.item, f.index]));
      const build = (items: PlaylistItem[], container: HTMLElement) => {
        for (const item of items) {
          if (Array.isArray(item.folder)) {
            const details = h('details', { class: 'vp-playlist-folder', open: true }, h('summary', {}, String(item.title ?? '')));
            build(item.folder, details);
            container.append(details);
          } else if (item.file) {
            const index = indexOf.get(item)!;
            const button = h(
              'button',
              { class: `vp-playlist-item${index === pl.index ? ' vp-active' : ''}`, type: 'button', 'aria-current': index === pl.index ? 'true' : undefined },
              item.poster ? h('img', { class: 'vp-playlist-poster', src: String(item.poster), alt: '', loading: 'lazy' }) : null,
              h('span', { class: 'vp-playlist-title' }, String(item.title ?? item.file)),
            );
            button.addEventListener('click', (e) => {
              e.stopPropagation();
              onSelect(index);
            });
            container.append(button);
          }
        }
      };
      build(pl.items, list);
    };

    ctx.select((s) => s.playlist, render, {
      immediate: true,
      equals: (a, b) => a?.items === b?.items && a?.index === b?.index,
    });
    // Keyboard focus follows the panel: into it on open (only if focus was in the player), back to the button on close.
    ctx.select(
      (s) => !!s.playlist?.open,
      (open) => {
        const active = el.ownerDocument.activeElement;
        if (open) {
          if (!active || !ctx.root.contains(active)) return;
          // Deferred: the layout un-hides the panel in a later subscriber, and hidden elements can't take focus.
          queueMicrotask(() => (list.querySelector<HTMLElement>('.vp-playlist-item.vp-active') ?? list.querySelector<HTMLElement>('.vp-playlist-item'))?.focus());
        } else if (active && el.contains(active)) {
          ctx.root.querySelector<HTMLElement>('.vp-playlist-button')?.focus();
        }
      },
    );
    return { el };
  };
}
