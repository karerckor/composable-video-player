# Theming

The player is styled with CSS custom properties on its root element (`.vp-root`). You can set them with the `theme` option, from your own CSS, or live from JavaScript. The stylesheet is injected once into `<head>` as `<style id="vp-styles">` when the first player is created.

## Theme variables

| `theme` key | CSS variable | Default | Used for |
| --- | --- | --- | --- |
| `color1` | `--vp-color-1` | `#00a3ff` | Accent: progress bar, timeline handle, active menu and playlist items, focus outlines, big play button on hover. |
| `color2` | `--vp-color-2` | `#ffffff` | Foreground: text, icons, volume fill. Translucent tints (track backgrounds, hover highlights, borders) are mixed from it. |
| `color3` | `--vp-color-3` | `rgba(18, 18, 18, 0.94)` | Surfaces: settings menu, playlist panel, error box, big play button background, thumbnail time label, gaps at timeline markers. |
| `toolbarBg` | `--vp-toolbar-bg` | `linear-gradient(to top, rgba(0, 0, 0, 0.8), rgba(0, 0, 0, 0))` | Toolbar background (any CSS background). |
| `font` | `--vp-font` | `system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif` | Font family. |
| `fontSize` | `--vp-font-size` | `14px` | Base font size. |
| `radius` | `--vp-radius` | `6px` | Corner radius of buttons, menus, and the error box. |
| `iconSize` | `--vp-icon-size` | `24px` | Icon size. |
| `timelineHeight` | `--vp-timeline-height` | `4px` | Timeline track height (×1.6 on hover and while dragging). |
| `subColor` | `--vp-sub-color` | `#ffffff` | Subtitle text color. |
| `subBg` | `--vp-sub-bg` | `rgba(0, 0, 0, 0.6)` | Subtitle background. |
| `subSize` | `--vp-sub-size` | `1.4em` | Subtitle font size. |

Naming rule: camelCase becomes kebab-case and numbers are split off, so `color1` becomes `--vp-color-1` and `toolbarBg` becomes `--vp-toolbar-bg`.

Because the tints are derived from `color2` and `color3` with `color-mix()`, you only need to change those two to invert the palette.

In players narrower than 480 px, a container query sets `--vp-icon-size: 20px` and `--vp-font-size: 13px` on `.vp-ui`. Those values win over values set on the root. If you need fixed sizes, set them on `.vp-ui` too.

## The `theme` option

```ts
createPlayer({
  container: 'player',
  source: 'https://example.com/video.mp4',
  theme: { color1: '#facc15', color3: 'rgba(30, 27, 75, 0.95)', radius: '12px' },
});
```

The values are written as inline custom properties on `player.root`.

## From CSS

```css
#player .vp-root {
  --vp-color-1: #e11d48;
  --vp-toolbar-bg: #18181b;
  --vp-radius: 2px;
}
```

Use a selector **more specific than `.vp-root`** (e.g. scope it by the container). The player's `<style>` is appended to the end of `<head>` at runtime, usually after your stylesheets, so a plain `.vp-root { … }` rule in your CSS would lose the tie.

## Live theming

```ts
player.root.style.setProperty('--vp-color-1', '#22c55e');
player.root.style.removeProperty('--vp-color-1'); // back to the default
```

The demo's theme builder works this way. See the [live demo](https://karerckor.github.io/composable-video-player/demo/) and [demo/customization.ts](https://github.com/karerckor/composable-video-player/blob/main/demo/customization.ts).

## Light theme

```ts
createPlayer({
  container: 'player',
  source: 'https://example.com/video.mp4',
  theme: {
    color1: '#2563eb',
    color2: '#18181b', // dark foreground
    color3: 'rgba(255, 255, 255, 0.96)', // light surfaces
    toolbarBg: 'linear-gradient(to top, rgba(255, 255, 255, 0.92), rgba(255, 255, 255, 0))',
    subColor: '#18181b',
    subBg: 'rgba(255, 255, 255, 0.85)',
  },
});
```

## CSS class hooks

All classes are prefixed with `vp-`. Useful hooks:

| Class | Element |
| --- | --- |
| `.vp-root` | Player root (the place for variables). Has `.vp-idle` while controls are auto-hidden (the cursor is hidden too). Matches `:fullscreen` in fullscreen. |
| `.vp-media` | Wrapper of the `<video>`. |
| `.vp-ui`, `.vp-layer-below`, `.vp-layout`, `.vp-layer-above` | UI layers (see [Layout](05-layout.md#how-it-renders)). |
| `.vp-layout-root`, `.vp-overlay`, `.vp-toolbar`, `.vp-group` (`.vp-group-row`, `.vp-group-column`), `.vp-spacer`, `.vp-text` | Containers. The default controls row also has `.vp-controls`. |
| `.vp-button` | Every icon button. Specific ones: `.vp-play`, `.vp-big-play`, `.vp-mute`, `.vp-fullscreen`, `.vp-settings`, `.vp-prev`, `.vp-next`, `.vp-playlist-button`. |
| `.vp-icon` | Icon wrapper (`span > svg`), sized by `--vp-icon-size`. |
| `.vp-timeline` | Seek bar. Parts: `.vp-timeline-track`, `.vp-timeline-buffered`, `.vp-timeline-progress`, `.vp-timeline-markers` > `.vp-timeline-marker`, `.vp-timeline-thumb`. State: `.vp-dragging`, `.vp-timeline-live`. |
| `.vp-slider.vp-volume` | Volume slider (`.vp-slider-track`, `.vp-slider-fill`). |
| `.vp-time`, `.vp-duration`, `.vp-time-sep`, `.vp-title`, `.vp-live` (`.vp-live-dot`), `.vp-buffering` | Indicators. |
| `.vp-error`, `.vp-error-message`, `.vp-error-retry` | Error overlay. |
| `.vp-click-layer` | The media click layer. |
| `.vp-menu` (`.vp-menu-left`, `.vp-menu-center`, `.vp-menu-right`) | Settings menu. Items: `.vp-menu-item`, `.vp-menu-main`, `.vp-menu-back`, `.vp-menu-title`, `.vp-menu-label`, `.vp-menu-value`, `.vp-menu-check`. The selected item has `.vp-active`. |
| `.vp-subtitles`, `.vp-subtitles-text`, `.vp-subtitles-raised` | Subtitles (raised while the controls are visible). |
| `.vp-thumb`, `.vp-thumb-image`, `.vp-thumb-time` | Timeline hover preview. |
| `.vp-playlist`, `.vp-playlist-header`, `.vp-playlist-heading`, `.vp-playlist-close`, `.vp-playlist-list`, `.vp-playlist-folder`, `.vp-playlist-item` (`.vp-active`), `.vp-playlist-poster`, `.vp-playlist-title` | Playlist panel. |
| `.vp-hidden` | Applied by [hide rules](05-layout.md#hide-rules). |
| `.vp-anchor`, `.vp-anchor-<position>` | Applied by `anchor`. |

Add your own classes to any layout node with `className`.

```css
/* thicker markers, rounded big play button */
#player .vp-timeline-marker { width: 4px; }
#player .vp-big-play { border-radius: 16px; }
```

## Icons

Replace built-in icons with the `icons` option. The values are SVG markup strings:

```ts
createPlayer({
  container: 'player',
  source: 'https://example.com/video.mp4',
  icons: {
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4v16l13-8z"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="4"/></svg>',
  },
});
```

Icon names (`IconName`): `play`, `pause`, `replay`, `volume-high`, `volume-low`, `volume-mute`, `fullscreen`, `fullscreen-exit`, `settings`, `playlist`, `prev`, `next`, `check`, `back`. The built-in set is exported as `defaultIcons`.

- Use `fill="currentColor"` (or `stroke="currentColor"`) so icons follow `color2`.
- The markup is parsed as SVG (never as HTML) and sanitized. Only SVG shape and paint elements are kept (`svg`, `g`, `path`, `circle`, `rect`, `line`, `polyline`, `polygon`, `ellipse`, `defs`, gradients, `stop`, `clipPath`, `mask`, `symbol`, `title`, `desc`). Event handler attributes, `href`, `javascript:` values, and `url()` in `style` are removed. Invalid markup renders an empty icon.
- Icons for your own buttons: see `iconEl()` and `createIconButton()` in [Plugins](07-plugins.md#components).

## UI text and languages

`lang` selects the built-in dictionary: `'en'` (default) or `'ru'`. `i18n` overrides individual keys:

```ts
createPlayer({
  container: 'player',
  source: 'https://example.com/video.mp4',
  lang: 'en',
  i18n: { quality: 'Resolution', 'error.network': 'Check your connection and try again' },
});
```

German, or any other language, is a full `i18n` override:

```ts
const de = { play: 'Abspielen', pause: 'Pause', mute: 'Stumm', unmute: 'Ton an', settings: 'Einstellungen', quality: 'Qualität', speed: 'Geschwindigkeit', subtitles: 'Untertitel', off: 'Aus', normal: 'Normal' /* … */ };
createPlayer({ container: 'player', source: 'https://example.com/video.mp4', i18n: de });
```

| Key | English | Russian |
| --- | --- | --- |
| `play` | Play | Воспроизвести |
| `pause` | Pause | Пауза |
| `replay` | Replay | Повторить |
| `mute` | Mute | Выключить звук |
| `unmute` | Unmute | Включить звук |
| `volume` | Volume | Громкость |
| `fullscreen` | Fullscreen | Полный экран |
| `exitFullscreen` | Exit fullscreen | Выйти из полноэкранного режима |
| `settings` | Settings | Настройки |
| `playlist` | Playlist | Плейлист |
| `prev` | Previous | Предыдущий |
| `next` | Next | Следующий |
| `timeline` | Seek | Перемотка |
| `quality` | Quality | Качество |
| `speed` | Speed | Скорость |
| `subtitles` | Subtitles | Субтитры |
| `audio` | Audio | Аудио |
| `off` | Off | Выкл |
| `auto` | Auto | Авто |
| `normal` | Normal | Обычная |
| `back` | Back | Назад |
| `live` | LIVE | LIVE |
| `retry` | Retry | Повторить |
| `close` | Close | Закрыть |
| `buffering` | Loading | Загрузка |
| `error.network` | Network error | Ошибка сети |
| `error.decode` | The video could not be decoded | Не удалось декодировать видео |
| `error.not-found` | Video not found | Видео не найдено |
| `error.unsupported` | Format not supported | Формат не поддерживается |
| `error.unknown` | Playback error | Ошибка воспроизведения |

Unknown keys fall back to the key itself. Layout `hint` and `text` values, plugin menu labels, and `ctx.t()` calls all go through the same lookup, so you can localize custom UI by adding your own keys to `i18n`:

```ts
// layout: { type: 'text', text: 'skipIntro', action: 'api:seek,90', className: 'vp-button' }
createPlayer({ container: 'player', source: '…', layout, i18n: { skipIntro: 'Skip intro' } });
```

The dictionaries are exported as `dictionaries`. The PlayerJS-compatible `new Playerjs({...})` always uses Russian (see [PlayerJS compatibility](08-playerjs-compat.md#differences-from-playerjs)).
