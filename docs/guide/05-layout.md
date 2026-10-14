# Layout

The player UI is a tree of plain objects (`LayoutNode`). Each node names a registered component `type`, can set [shared props](#shared-props), and can contain `children`. You pass the tree as the `layout` option, or swap it at runtime with `player.command('layout', node)`.

```ts
import { createPlayer, type LayoutNode } from 'composable-video-player';

const layout: LayoutNode = {
  type: 'root',
  children: [
    { type: 'media-click-layer' },
    {
      type: 'overlay',
      children: [
        { type: 'big-play', anchor: 'center', hide: ['started', 'error'] },
        { type: 'buffering', anchor: 'center', hide: ['not-waiting'] },
        { type: 'error-overlay', anchor: 'center', hide: ['not-error'] },
      ],
    },
    {
      type: 'toolbar',
      hide: ['idle'],
      children: [
        {
          type: 'group',
          direction: 'row',
          children: [{ type: 'play' }, { type: 'timeline', flex: 1, margin: '0 8' }, { type: 'fullscreen' }],
        },
      ],
    },
  ],
};

createPlayer({ container: 'player', source: 'https://example.com/video.mp4', layout });
```

## How it renders

```text
.vp-root
├─ .vp-media > video
└─ .vp-ui
   ├─ .vp-layer-below   plugin layers below the controls (subtitles)
   ├─ .vp-layout        your layout tree
   └─ .vp-layer-above   plugin layers above the controls (thumbnail preview, playlist panel, settings menu)
```

- The tree is built once, top-down. A node with an unknown `type` is skipped with a warning. Set `optional: true` to skip it silently, which is useful for components that come from optional plugins.
- Each component subscribes to the state it needs, so updates are granular. Nothing is re-rendered wholesale.
- Do **not** put `subtitles-layer`, `thumbnail-preview`, or `playlist-panel` in your layout. Their plugins mount them as layers automatically.

## Starting from `defaultLayout`

`defaultLayout` is the built-in PlayerJS-like UI:

```ts
{
  type: 'root',
  children: [
    { type: 'media-click-layer' },
    {
      type: 'overlay',
      children: [
        { type: 'title', anchor: 'top-left', hide: ['idle'] },
        { type: 'buffering', anchor: 'center', hide: ['not-waiting'] },
        { type: 'big-play', anchor: 'center', hide: ['started', 'error'] },
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
}
```

Deep-clone it before editing, because it is a shared object:

```ts
import { createPlayer, defaultLayout, type LayoutNode } from 'composable-video-player';

const layout = structuredClone(defaultLayout);
const toolbar = layout.children!.find((n) => n.type === 'toolbar')!;
const controls = toolbar.children!.find((n) => n.className === 'vp-controls')!.children!;

// "-10 s" / "+10 s" text buttons after play
const playAt = controls.findIndex((n) => n.type === 'play');
controls.splice(playAt + 1, 0,
  { type: 'text', text: '−10', action: 'api:seek,-10', hint: 'Back 10 s', className: 'vp-button' },
  { type: 'text', text: '+10', action: 'api:seek,+10', hint: 'Forward 10 s', className: 'vp-button' },
);
// drop the volume slider
controls.splice(controls.findIndex((n) => n.type === 'volume'), 1);

createPlayer({ container: 'player', source: 'https://example.com/video.mp4', layout });
```

## Headless mode

`layout: false` builds no UI. The video still renders, and plugin layers (subtitles, thumbnails, playlist panel) and hotkeys still work. You drive everything through the API:

```ts
import { createPlayer, formatTime } from 'composable-video-player';

const player = createPlayer({ container: 'player', source: 'https://example.com/video.mp4', layout: false });

document.querySelector('#my-play')!.addEventListener('click', () => player.command('toggle'));
player.on('time', (t) => (document.querySelector('#my-time')!.textContent = formatTime(t, player.state.duration)));
```

## Built-in components

### Containers

| Type | Own props | Description |
| --- | --- | --- |
| `root` | — | Full-size container for the whole layout (`.vp-layout-root`). |
| `overlay` | — | Full-size layer that ignores pointer events (its children receive them). Use it with `anchor`ed children (`.vp-overlay`). |
| `toolbar` | — | Bottom bar with the `--vp-toolbar-bg` background. Stacks its children vertically (`.vp-toolbar`). |
| `group` | `direction?: 'row' \| 'column'` (default `'row'`) | Flex container. Hidden children collapse instead of leaving gaps (`.vp-group`, `.vp-group-row` / `.vp-group-column`). |
| `spacer` | — | Flexible empty space (`flex: 1 1 auto`) that pushes neighbours apart. |
| `text` | `text?: string` | Static or templated text (`span.vp-text`). See [text templates](#text-templates). |

### Controls and indicators

| Type | Description |
| --- | --- |
| `media-click-layer` | Transparent full-size layer over the video. A click toggles playback and a double click toggles fullscreen. On touch devices, the first tap while the controls are hidden only shows them. |
| `play` | Play/pause button. Shows a replay icon at the end. |
| `big-play` | Large round play button (usually centered with `hide: ['started', 'error']`). |
| `mute` | Mute toggle. The icon follows the volume level. Scrolling the wheel over it changes the volume by 5% per step. |
| `volume` | Volume slider (drag, click, arrow keys, wheel). |
| `timeline` | Seek bar with buffered range, progress, [markers](07-plugins.md#timeline-markers), and hover preview events. Drag or click to seek. With focus, ←/→ seek by 5 s and Home/End jump to the start or end. Hidden automatically for live streams. |
| `time` | Current time (`m:ss` or `h:mm:ss`). |
| `duration` | Duration. |
| `title` | `state.title`. Takes no space when empty. |
| `buffering` | Spinner. Pair it with `hide: ['not-waiting']`. |
| `live` | "LIVE" badge. Pair it with `hide: ['not-live']`. |
| `fullscreen` | Fullscreen toggle. |
| `settings` | Opens the settings menu (quality, speed, subtitles, audio, and plugin menus). Pair it with `hide: ['no-menus']`. |
| `error-overlay` | Error message (by `error.kind`, translated) and a **Retry** button that reloads. Pair it with `hide: ['not-error']`. |

### Components from default plugins

| Type | Plugin | Description |
| --- | --- | --- |
| `prev` / `next` | playlist | Previous/next item buttons. Pair them with `hide: ['first-item']` / `['last-item']`. |
| `playlist-button` | playlist | Opens the playlist panel. Pair it with `hide: ['no-playlist']`. |
| `playlist-panel` | playlist | Side panel. Mounted automatically as a layer, so don't add it to your layout. |
| `subtitles-layer` | subtitles | Subtitle text. Mounted automatically. |
| `thumbnail-preview` | thumbnails | Hover preview bubble. Mounted automatically. |

If you build your own plugin list with `createPlayerCore`, mark plugin components `optional: true` when the plugin might be absent.

## Shared props

Every node accepts these `BaseProps`:

| Prop | Type | Effect |
| --- | --- | --- |
| `id` | `string` | Sets the element id to `<playerId>_control_<id>`. |
| `hint` | `string` | Tooltip and `aria-label`. Looked up as an i18n key first (`hint: 'fullscreen'` gives "Fullscreen"), otherwise used as is. Overrides a button's default label. |
| `scale` | `number` | CSS `scale` (e.g. `1.6` for a bigger play button). |
| `margin` | `string` | CSS margin. Unitless numbers become px: `'0 8'` means `0px 8px`. |
| `opacity` | `number` | CSS opacity. |
| `bg` | `string` | CSS background. |
| `color` | `string` | CSS color. |
| `flex` | `number` | CSS `flex-grow` inside a group (e.g. `flex: 1` on a `timeline` or `spacer`). |
| `anchor` | `Anchor` | Absolute position inside the parent, 12 px from the edges: `top-left`, `top`, `top-right`, `left`, `center`, `right`, `bottom-left`, `bottom`, `bottom-right`. Typically used inside `overlay`. |
| `hide` | `HideRuleSpec[]` | Hide the element while **any** of the rules is true. See [hide rules](#hide-rules). |
| `action` | `string` | Run an [action](#actions) on click **instead of** the component's own behavior. |
| `className` | `string` | Extra CSS classes (space-separated). `className: 'vp-button'` gives a `text` node button styling. |

`LayoutNode` also has `type` (required), `children?: LayoutNode[]`, and `optional?: boolean`. Any other key is passed to the component as a prop (e.g. `text`, `direction`).

## Hide rules

A hide rule names a condition under which the element is **hidden**. Hidden elements fade out (`.vp-hidden`: `opacity: 0; visibility: hidden`) and collapse inside groups. A rule is either a string or a one-key object for rules that take an argument.

### Built-in rules

| Rule | Hidden when |
| --- | --- |
| `'idle'` | Playing, with no recent user activity, and controls not locked (auto-hide). |
| `'playing'` / `'paused'` | `status` is `playing` / `paused`. |
| `'started'` / `'not-started'` | Playback has / hasn't started since the last load. |
| `'fullscreen'` / `'not-fullscreen'` | In / not in fullscreen. |
| `'not-waiting'` | Not buffering (use on spinners). |
| `'live'` / `'not-live'` | Live / not live stream. |
| `'error'` / `'not-error'` | `status` is / isn't `error`. |
| `{ minWidth: N }` | Player width ≥ N px. |
| `{ maxWidth: N }` | Player width < N px (e.g. hide the volume slider on narrow players). |
| `'no-menus'` | No settings menu has anything to show. |
| `{ command: 'name' }` | The command is not registered (e.g. its plugin is not installed). |

### Rules from default plugins (playlist)

| Rule | Hidden when |
| --- | --- |
| `'no-playlist'` | No playlist, or fewer than 2 items. |
| `'first-item'` | On the first item (and not looping), or no playlist. |
| `'last-item'` | On the last item (and not looping), or no playlist. |
| `'playlist-closed'` | The playlist panel is closed. |

An unknown rule name logs a warning and never hides.

### Custom rules

Plugins register rules with `ctx.registerHideRule(name, factory)`. The factory receives the rule's argument (from the object form) and the UI context, and returns `{ test(state) }`:

```ts
import type { Plugin } from 'composable-video-player';

const rules: Plugin = {
  name: 'my-rules',
  setup(ctx) {
    ctx.registerHideRule('muted', () => ({ test: (s) => s.muted }));
    // { before: 10 } → hidden during the first 10 seconds
    ctx.registerHideRule('before', (arg) => ({ test: (s) => s.currentTime < Number(arg) }));
  },
};
// layout: { type: 'text', text: 'Skip intro', action: 'api:seek,90', hide: [{ before: 5 }, 'idle'] }
```

## Actions

`action` makes any element clickable and replaces its own click handling. When actions are nested, only the innermost one runs.

| Action | Effect |
| --- | --- |
| `api:cmd` / `api:cmd,arg` | `player.api(cmd, arg)` (only the first argument is used). Separate several with `;`: `api:seek,0;play`. |
| `js:path.to.fn,arg1,arg2` | Calls a global function (resolved from `window`, `this` is its owner object) with string arguments. Only dotted identifier paths are accepted. `eval`, `Function`, `setTimeout`, `setInterval`, `constructor`, `__proto__`, and `prototype` are refused. |
| `event:name` | Dispatches a bubbling `CustomEvent(name)` on the container with `detail` = the current state. |
| `settings` | Opens the settings menu. |
| `settings:id,id,align` | Opens the menu with only these sections (`quality`, `speed`, `subtitle`, `audio`, or a plugin menu id) and an optional alignment (`left`, `center`, `right`; default right). |
| `https://…`, `http://…`, `//…` | Opens the URL in a new tab (`noopener`). |

Placeholders in action arguments: `{time}` and `{duration}` (whole seconds), `{title}`, and `{file}` (current URL). In URL actions they are URL-encoded.

```ts
{ type: 'text', text: 'Share', className: 'vp-button', action: 'https://twitter.com/intent/tweet?text={title}&url=https://example.com/?t={time}' }
{ type: 'text', text: 'Quality', className: 'vp-button', action: 'settings:quality,left' }
{ type: 'text', text: 'Bookmark', className: 'vp-button', action: 'js:app.bookmark,{time}' }
{ type: 'text', text: '★', className: 'vp-button', action: 'event:favorite' } // container.addEventListener('favorite', e => e.detail.currentTime)
```

## Text templates

The `text` component renders `text` in one of two ways:

- With `{time}`, `{duration}`, or `{title}` placeholders, it updates live. Time values are formatted (`1:23`, or `1:02:03` for long videos): `{ type: 'text', text: '{time} / {duration}' }`.
- Without placeholders, `text` is treated as an i18n key and falls back to the literal string. `{ type: 'text', text: 'live' }` renders "LIVE", and `{ type: 'text', text: 'Hello' }` renders "Hello".

## Examples

**Mobile-style**: centered transport, settings in the corner, thin bottom bar.

```ts
const mobile: LayoutNode = {
  type: 'root',
  children: [
    { type: 'media-click-layer' },
    {
      type: 'overlay',
      children: [
        { type: 'buffering', anchor: 'center', hide: ['not-waiting'] },
        { type: 'error-overlay', anchor: 'center', hide: ['not-error'] },
        { type: 'title', anchor: 'top-left', hide: ['idle'] },
        {
          type: 'group', direction: 'row', anchor: 'center', hide: ['idle', 'error'],
          children: [
            { type: 'text', text: '−10', action: 'api:seek,-10', hint: '−10 s', className: 'vp-button' },
            { type: 'play', scale: 1.6, margin: '0 14' },
            { type: 'text', text: '+10', action: 'api:seek,+10', hint: '+10 s', className: 'vp-button' },
          ],
        },
        { type: 'group', direction: 'row', anchor: 'top-right', hide: ['idle'],
          children: [{ type: 'settings', hide: ['no-menus'] }, { type: 'fullscreen' }] },
      ],
    },
    {
      type: 'toolbar', hide: ['idle'],
      children: [{ type: 'group', direction: 'row',
        children: [{ type: 'time' }, { type: 'timeline', flex: 1, margin: '0 8' }, { type: 'duration' }] }],
    },
  ],
};
```

**Classic**: always-visible solid bar (no `idle` rule) with an inline timeline.

```ts
const classic: LayoutNode = {
  type: 'root',
  children: [
    { type: 'media-click-layer' },
    { type: 'overlay', children: [{ type: 'big-play', anchor: 'center', hide: ['started', 'error'] }] },
    {
      type: 'toolbar',
      bg: '#27272a',
      children: [{ type: 'group', direction: 'row', children: [
        { type: 'play' }, { type: 'mute' },
        { type: 'text', text: '{time}', margin: '0 6' },
        { type: 'timeline', flex: 1 },
        { type: 'text', text: '{duration}', margin: '0 6' },
        { type: 'settings', hide: ['no-menus'] }, { type: 'fullscreen' },
      ] }],
    },
  ],
};
```

**Switch layouts at runtime**:

```ts
player.command('layout', window.innerWidth < 600 ? mobile : classic);
```

The live demo has a gallery of these layouts (minimal, mobile, classic, headless); its source is [demo/customization.ts](https://github.com/karerckor/composable-video-player/blob/main/demo/customization.ts). To write your own component types, see [Plugins](07-plugins.md#components).
