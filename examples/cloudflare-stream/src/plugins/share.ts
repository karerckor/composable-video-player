import { createIconButton, defaultLayout, formatTime, iconEl, type LayoutNode, type Plugin } from 'composable-video-player';
import { parseTimestamp } from '../content.js';

declare module 'composable-video-player' {
  interface PlayerCommands { openShare(withTime?: boolean): void }
}

export interface SharePluginOptions { url?: () => string; startTime?: string | null; param?: string }

export function buildShareUrl(base: string, time: number | null, param = 't'): string {
  const url = new URL(base);
  url.hash = '';
  url.searchParams.delete(param);
  if (time !== null && Number.isFinite(time) && time >= 0) url.searchParams.set(param, String(Math.floor(time)));
  return url.href;
}

export function withShareButton(): LayoutNode {
  const layout: LayoutNode = structuredClone(defaultLayout);
  function insert(node: LayoutNode): boolean {
    const index = node.children?.findIndex(child => child.type === 'settings') ?? -1;
    if (index >= 0) { node.children!.splice(index, 0, { type: 'share' }); return true; }
    return node.children?.some(insert) ?? false;
  }
  insert(layout);
  return layout;
}

/** A toolbar component, a player layer, a typed command and a source transform. */
export function sharePlugin(options: SharePluginOptions = {}): Plugin {
  const param = options.param ?? 't';
  const pageUrl = options.url ?? (() => location.href);
  return {
    name: 'share',
    setup(ctx) {
      let panel: { open(withTime: boolean): void } | undefined;
      let trigger: HTMLButtonElement | undefined;
      ctx.registerComponent('share', ui => {
        const control = createIconButton(ui, 'library-share-button', () => ui.user('openShare', false));
        control.setLabel('Share');
        control.el.setAttribute('aria-haspopup', 'dialog');
        control.el.setAttribute('aria-expanded', 'false');
        control.el.replaceChildren(iconEl('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m8 12 8-6M8 12l8 6"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="5" r="3"/><circle cx="18" cy="19" r="3"/></svg>'));
        trigger = control.el;
        return { el: control.el, dispose() { trigger = undefined; } };
      });
      ctx.registerComponent('share-panel', ui => {
        const el = document.createElement('div'); el.className = 'library-share-panel vp-hidden';
        el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Share this video');
        const header = document.createElement('div'); header.className = 'library-share-heading';
        const title = document.createElement('strong'); title.textContent = ui.t('Share this video');
        const close = document.createElement('button'); close.type = 'button'; close.className = 'vp-button library-share-close'; close.textContent = '×'; close.setAttribute('aria-label', 'Close share dialog');
        header.append(title, close);
        const input = document.createElement('input'); input.type = 'url'; input.readOnly = true; input.className = 'library-share-url'; input.setAttribute('aria-label', 'Share link');
        const label = document.createElement('label'); label.className = 'library-share-time';
        const at = document.createElement('input'); at.type = 'checkbox';
        const atText = document.createElement('span'); label.append(at, atText);
        const copy = document.createElement('button'); copy.type = 'button'; copy.className = 'library-share-copy'; copy.textContent = ui.t('Copy link');
        const status = document.createElement('p'); status.className = 'library-share-status'; status.setAttribute('role', 'status');
        el.append(header, input, label, copy, status);
        let time = 0;
        let opener: HTMLElement | null = null;
        const render = () => { input.value = buildShareUrl(pageUrl(), at.checked ? time : null, param); atText.textContent = `${ui.t('Start at')} ${formatTime(time)}`; status.textContent = ''; };
        const hide = (restoreFocus = true) => {
          el.classList.add('vp-hidden'); ui.store.set({ controlsLocked: false }); trigger?.setAttribute('aria-expanded', 'false');
          if (restoreFocus && opener?.isConnected) opener.focus();
        };
        panel = { open(withTime) {
          opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          time = ui.player.state.currentTime; at.checked = withTime; render();
          el.classList.remove('vp-hidden'); ui.store.set({ controlsLocked: true }); trigger?.setAttribute('aria-expanded', 'true'); input.focus(); input.select();
        } };
        ui.listen(close, 'click', () => hide());
        ui.listen(at, 'change', render);
        ui.listen(document, 'keydown', event => {
          if ((event as KeyboardEvent).key === 'Escape' && !el.classList.contains('vp-hidden')) { event.preventDefault(); event.stopPropagation(); hide(); }
        });
        ui.listen(document, 'pointerdown', event => {
          if (!el.classList.contains('vp-hidden') && event.target instanceof Node && !el.contains(event.target) && !trigger?.contains(event.target)) hide(false);
        });
        ui.listen(copy, 'click', () => {
          const fallback = () => { if (!el.isConnected || el.classList.contains('vp-hidden')) return; input.focus(); input.select(); status.textContent = ui.t('Select and copy the link with ⌘C / Ctrl+C.'); };
          if (!navigator.clipboard?.writeText) return fallback();
          navigator.clipboard.writeText(input.value).then(() => { if (el.isConnected) status.textContent = ui.t('Link copied'); }, fallback);
        });
        return { el, dispose() { panel = undefined; ui.store.set({ controlsLocked: false }); } };
      });
      // Registered after memory: the explicit link time (including zero) wins once.
      let pending = parseTimestamp(options.startTime === undefined ? new URL(pageUrl()).searchParams.get(param) : options.startTime);
      const cleanup = [
        ctx.commands.register('openShare', ([withTime = false]) => panel?.open(withTime)),
        ctx.addLayer({ type: 'share-panel' }, 'above-ui'),
        ctx.addSourceTransform((_spec, selection) => {
          if (pending === null) return selection;
          const start = pending; pending = null; return { ...selection, start };
        }),
      ];
      return () => cleanup.forEach(dispose => dispose());
    },
  };
}
