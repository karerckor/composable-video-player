import type { LayoutNode } from '../types';

/** The default PlayerJS-like layout. Copy and modify it to build your own. */
export const defaultLayout: LayoutNode = {
  type: 'root',
  children: [
    { type: 'media-click-layer' },
    {
      type: 'overlay',
      children: [
        { type: 'title', anchor: 'top-left', hide: ['idle'] },
        { type: 'buffering', anchor: 'center', hide: ['not-waiting'] },
        { type: 'big-play', anchor: 'center', hide: ['started'] },
        { type: 'error-overlay', anchor: 'center', hide: ['not-error'] },
      ],
    },
    {
      type: 'toolbar',
      hide: ['idle'],
      children: [
        { type: 'timeline' },
        {
          type: 'group',
          direction: 'row',
          className: 'vp-controls',
          children: [
            { type: 'prev', optional: true, hide: ['first-item'] },
            { type: 'play' },
            { type: 'next', optional: true, hide: ['last-item'] },
            { type: 'mute' },
            { type: 'volume', hide: [{ maxWidth: 400 }] },
            { type: 'time' },
            { type: 'text', text: '/', className: 'vp-time-sep', hide: ['live'] },
            { type: 'duration', hide: ['live'] },
            { type: 'live', hide: ['not-live'] },
            { type: 'spacer', flex: 1 },
            { type: 'settings', hide: ['no-menus'] },
            { type: 'playlist-button', optional: true, hide: ['no-playlist'] },
            { type: 'fullscreen' },
          ],
        },
      ],
    },
  ],
};
