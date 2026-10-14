# Composable Video Player — дизайн v1

Дата: 2026-10-14
Статус: утверждён в брейншторме, ревизия 3 — одобрена ревью спецификации

## 1. Цель

Веб-плеер на чистом TypeScript по образцу PlayerJS (playerjs.com, docs v22.3.3):
composable (UI и функциональность собираются из независимых частей) и extensible
(новые источники, UI-элементы, пункты меню, команды и правила видимости добавляются
плагинами без изменения ядра).

Принятые решения:

| Вопрос | Решение |
|---|---|
| Объём v1 | Ядро + базовые модули (список в §7). Реклама, DASH, YouTube/Vimeo и пр. — будущие плагины (§9) |
| Публичный API | Типизированный API + отдельный тонкий compat-слой PlayerJS (`new Playerjs`, `api()`, `PlayerjsEvents`) |
| Зависимости | 0 runtime-зависимостей. hls.js грузится динамически только для HLS без нативной поддержки |
| Модель UI | Декларативный layout (JSON) + реестр компонентов |
| Архитектура | Store + плагины + реестры; команды с before-хуками |
| Инструменты | Vite (dev + library build), Vitest + jsdom, `tsc --strict` |

## 2. Структура модулей и границы

```
src/
  types.ts     ВСЕ контракты (только типы, без runtime-кода): PlayerState, PlayerEvents,
               PlayerCommands, PlayerOptions, Player, Plugin, PluginContext, MediaProvider,
               ProviderContext, SourceSpec, Selection, LayoutNode, BaseProps,
               ComponentFactory, UIContext, MenuDefinition, MenuHost, HideRuleFactory, Logger
  core/        Store, EventBus, CommandRegistry, PluginHost, MediaController, logger
  source/      parseSource, isPlaylistInput — file-микросинтаксис → SourceSpec
  providers/   html5 (mp4/webm/ogg/native HLS), hls (ленивый hls.js)
  api/         api-map: PlayerJS-имена команд → вызовы Player (чистая таблица)
  ui/          LayoutEngine, ComponentRegistry, base props, hide-правила, parseAction,
               ActionRunner, MenuHost, UserActivity, icons, i18n
  components/  встроенные компоненты (§6.5)
  plugins/     playlist, subtitles, thumbnails, hotkeys, memory, quality, speed,
               audiotracks, mediasession, autoplay
  compat/      класс Playerjs, маппинг опций, мост событий PlayerjsEvents/DOM, postMessage
  theme/       player.css (CSS custom properties)
  player.ts    createPlayer — composition root
  index.ts     публичные экспорты: createPlayer, defaultPlugins, defaultLayout, плагины,
               компоненты, типы
demo/          index.html + примеры, скрипт генерации тестовых ассетов
tests/         зеркалит src/
```

Правила зависимостей (runtime-импорты; `import type` из `src/types.ts` разрешён всем):

| Модуль | Может импортировать |
|---|---|
| `types.ts` | ничего |
| `core/` | `source/` |
| `source/`, `api/` | ничего (кроме типов) |
| `providers/` | ничего (кроме типов) |
| `ui/` | ничего (кроме типов); всё получает через `UIContext` |
| `components/` | `ui/` (хелперы: слайдер, кнопка, форматирование времени) |
| `plugins/` | `ui/`-хелперы, `source/`; **не** друг друга |
| `compat/` | `player.ts`, `api/`, `plugins/` (для `defaultPlugins`), `ui/` (для `defaultLayout`) |
| `player.ts` | всё, кроме `compat/` |
| `index.ts` | всё (реэкспорт, в т.ч. `compat/` для UMD `window.Playerjs`) |

`components` не трогают `HTMLVideoElement` — только store, события, команды. Плагинам
`PluginContext.video` доступен как запасной выход, но ни один плагин v1 его не использует.

### 2.1 Composition root (`player.ts`)

`createPlayer(options)`:

1. Разрешает `container` (элемент или id). `player.id` = id элемента, а если его нет —
   генерируется `vp1`, `vp2`, … и присваивается элементу. Создаёт внутри DOM-каркас
   `.vp-root > .vp-media(<video playsinline preload="metadata">) + .vp-ui`;
   инжектирует CSS (§6.8).
2. Создаёт `Store`, `EventBus`, `CommandRegistry`, `Logger`, `MediaController`
   (регистрирует команды ядра, слушает `<video>`), `ComponentRegistry`, `MenuHost`,
   реестр hide-правил, `UserActivity`.
3. Регистрирует встроенные провайдеры (`html5Provider`, `hlsProvider`), встроенные
   компоненты и hide-правила; UI-команды `showControls()` (UserActivity: `userActive =
   true` + перезапуск таймера) и `toggleMenu()` (`menus.toggle()`).
4. Собирает объект `Player` (§3.6), включая `player.api = createApi({ player, store,
   commands, options })` из `api/`.
5. Собирает `PluginContext` (§3.5) — его методы `registerComponent/registerMenu/
   registerHideRule/addLayer` делегируют в UI-реестры, созданные на шаге 2.
6. `PluginHost.setupAll(plugins, ctx)`.
7. Если `layout !== false` — `LayoutEngine.build(layout ?? defaultLayout)` в `.vp-layout`.
   Регистрирует команду `layout(node)` (пересборка).
8. Эмит `init` (плагины применяют сохранённые/стартовые значения: громкость, скорость,
   `preferredSubtitle`).
9. Если `source` задан — `player.load(source)`.

Итого порядок событий при старте: `init` → `new` → `metadata` → (`play` …).

Ядро (`core/`) не знает про UI: `PluginContext` и `UIContext` — интерфейсы из `types.ts`,
собранные в composition root.

## 3. Ядро

### 3.1 Store

```ts
interface Store<S> {
  get(): Readonly<S>;
  set(patch: Partial<S>): void;            // поверхностное слияние, уведомляет подписчиков, если выбранное значение изменилось
  select<T>(selector: (s: S) => T, cb: (value: T, prev: T) => void,
            opts?: { immediate?: boolean; equals?: (a: T, b: T) => boolean }): () => void;
}
```

Уведомление синхронное, батчинга в v1 нет. Сравнение по умолчанию — `Object.is`.
Исключение в подписчике ловится и логируется, остальные подписчики выполняются.

### 3.2 PlayerState

```ts
interface PlayerState {
  status: 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'ended' | 'error';
  started: boolean;            // был первый `playing` после последнего load
  currentTime: number; duration: number;
  buffered: number;            // конец буферизованного диапазона, содержащего currentTime, сек
  live: boolean;               // duration === Infinity
  waiting: boolean;            // буферизация
  volume: number; muted: boolean; rate: number;
  fullscreen: boolean;
  userActive: boolean;         // курсор/тач активен (autohide)
  controlsLocked: boolean;     // api toolbar "on" — не скрывать
  width: number; height: number;
  url: string;                 // текущий URL (после выбора)
  qualities: Quality[]; quality: number;           // индекс в qualities; Auto (HLS) — обычный пункт списка
  audioTracks: TrackInfo[]; audioTrack: number;
  textTracks: TrackInfo[]; textTrack: number;      // -1 = выключено (пишет плагин subtitles)
  preferredSubtitle: string | null;                // метка или 'off'; пишет memory, читает subtitles
  title: string; poster: string;
  loop: boolean;
  error: PlayerError | null;
}
interface Quality { label: string; height?: number; bitrate?: number }
interface TrackInfo { label: string; lang?: string }
interface PlayerError { kind: 'network' | 'decode' | 'not-found' | 'unsupported' | 'unknown'; message: string }
```

Плагины расширяют `PlayerState`, `PlayerEvents`, `PlayerCommands`, `PlayerOptions` через
declaration merging (`declare module '../types' { interface PlayerState { … } }`) и
обязаны задать начальные значения своих полей в `setup` (`store.set`).

Переходы `status` (пишет `MediaController`):

| Триггер | status |
|---|---|
| `load` начат | `loading` (сброс `started`, `currentTime`, `duration`, `error`) |
| `provider.load` резолвлен (метаданные есть, стартовая позиция выставлена) | `ready` + эмит `metadata` |
| `play` / `playing` | `playing` (`playing` также `waiting=false`, первый — `started=true`) |
| `pause` (не из-за `ended`) | `paused` |
| `ended` | `ended` |
| `waiting` / `canplay`, `seeked` | `waiting = true` / `false` (status не меняется) |
| фатальная ошибка (§5.3) | `error` |

### 3.3 EventBus

```ts
interface EventBus {
  on<K extends keyof PlayerEvents>(name: K, cb: (data: PlayerEvents[K]) => void): () => void;
  once<K extends keyof PlayerEvents>(name: K, cb: (data: PlayerEvents[K]) => void): () => void;
  off<K extends keyof PlayerEvents>(name: K, cb: (data: PlayerEvents[K]) => void): void;
  emit<K extends keyof PlayerEvents>(name: K, data: PlayerEvents[K]): void;
  onAny(cb: (name: keyof PlayerEvents, data: unknown) => void): () => void;
}
```

Исключение в обработчике ловится и логируется, остальные выполняются.

Публичные события (имена PlayerJS; `PLAYERJS_EVENTS` — константа-список в `types.ts`):

`init, start, new, metadata, play, userplay, pause, userpause, stop, end, finish, time,
quartile, duration, seek, userseek, mute, unmute, volume, quality, audiotrack, subtitle,
speed, fullscreen, exitfullscreen, resize, ui, buffering, buffered, loaderror, error,
playlist, next, previous, line, destroy`.

Внутренние события имеют префикс `ui:` и в `PLAYERJS_EVENTS` не входят:
`ui:timeline-hover { time, x, width }`, `ui:timeline-leave`, `ui:menu { open }`.

Кто эмитит:
- **MediaController** (из `<video>` и команд): `new` (load), `metadata` (после
  резолва `provider.load` — с этого момента безопасно вызывать `play`), `duration`,
  `play`, `pause`, `time` (каждый `timeupdate`), `quartile` (25/50/75/100 — один раз на
  каждую отметку на файл), `seek` (на `seeked`), `buffering`/`buffered`, `volume`,
  `mute`/`unmute`, `speed` (`ratechange`), `end` + сразу `finish`, `start` (первый
  `playing`), `stop` (команда), `quality`/`audiotrack` (после переключения, метка),
  `fullscreen`/`exitfullscreen`, `loaderror`, `error`.
- `userplay/userpause/userseek` — дополнительно MediaController, когда команда пришла с
  `source: 'user'`.
- **UI**: `resize` (ResizeObserver), `ui` (0/1 — видимость toolbar), `line` (клик по
  timeline), `ui:*`.
- **Плагины**: `subtitle` (subtitles), `playlist`/`next`/`previous` (playlist).
- **Player**: `init`, `destroy`.

### 3.4 CommandRegistry

```ts
interface CommandContext { source: 'api' | 'user' | 'internal' }
type BeforeHook<K extends keyof PlayerCommands> =
  (args: Parameters<PlayerCommands[K]>, ctx: CommandContext) => false | void | Parameters<PlayerCommands[K]>;
interface CommandRegistry {
  register<K extends keyof PlayerCommands>(name: K, handler: (args: Parameters<PlayerCommands[K]>, ctx: CommandContext) => ReturnType<PlayerCommands[K]>): () => void;
  before<K extends keyof PlayerCommands>(name: K, hook: BeforeHook<K>): () => void;
  run<K extends keyof PlayerCommands>(name: K, args: Parameters<PlayerCommands[K]>,
                                      ctx?: CommandContext): ReturnType<PlayerCommands[K]> | undefined;
  has(name: string): boolean;
}
```

`run` вызывает before-хуки в порядке регистрации: `false` отменяет команду (`run` вернёт
`undefined`), массив подменяет аргументы для следующих хуков и обработчика.
Неизвестная команда → `log.warn`, `undefined`. Повторная `register` того же имени
заменяет обработчик с warn (так плагин может намеренно переопределить команду ядра).
Контекст по умолчанию — `{ source: 'internal' }`.

Команды ядра (регистрирует `MediaController`, единственный владелец):

| Команда | Семантика |
|---|---|
| `load(input)` | конвейер §4.3; запоминает `input` как `lastInput` |
| `reload()` | `load(lastInput)`; `MediaController` перезаписывает `selection.start` текущей позицией **после** всех SourceTransform (кнопка «Повторить» в `error-overlay`) |
| `play()` | возвращает промис `video.play()` как есть (отклонение пробрасывается вызывающему). UI-вызовы (`ctx.user`) и `api()` глушат отклонение через `.catch(log.warn)` |
| `pause()` | `video.pause()` |
| `toggle()` | `ended` → `seek(0)` + `play`; `playing` → `pause`; иначе `play` |
| `stop()` | `pause` + `currentTime = 0` + эмит `stop`; источник не выгружается |
| `seek(t)` | число — абсолютно; строка `"+10"`/`"-10"` — относительно; clamp к `[0, duration]`; для `live` без DVR — no-op |
| `setVolume(v)` | число 0..1 или `"+0.1"`/`"-0.1"`; clamp; `v > 0` при `muted` снимает mute |
| `mute()`, `unmute()`, `toggleMute()` | `video.muted` |
| `setRate(r)` | `video.playbackRate` и `video.defaultPlaybackRate` (load-алгоритм `<video>` сбрасывает rate к default) |
| `setLoop(b)` | `video.loop`, `state.loop` |
| `setTitle(s)`, `setPoster(url)` | store (`poster` также `video.poster`) |
| `fullscreen()`, `exitFullscreen()`, `toggleFullscreen()` | §3.6 |
| `setQuality(i)` | §4.4 |
| `setAudioTrack(i)` | §4.4 |
| `setControlsLocked(b)` | `controlsLocked` |
| `destroy()` | `player.destroy()` |

**Правило «play после load»:** любой код, который запускает воспроизведение сразу после
`load` (`api('play', url)`, `playItem(id, true)`, autonext, autoplay), делает это через
`events.once('metadata', () => play())`, а не синхронно — иначе смена `src` / attach
hls.js отклонит `play()` с `AbortError`.

Регистрируются в другом месте: `layout(node)`, `showControls()`, `toggleMenu()` —
composition root (§2.1); команды плагинов — в §7.

### 3.5 Плагины

```ts
interface Plugin {
  name: string;
  setup(ctx: PluginContext): void | (() => void);   // опции — в замыкании фабрики плагина
}
interface PluginContext {
  player: Player; store: Store<PlayerState>; events: EventBus; commands: CommandRegistry;
  options: PlayerOptions; video: HTMLVideoElement; log: Logger;
  root: HTMLElement;          // .vp-root — сюда вешать DOM-слушатели (hotkeys, активность)
  registerProvider(p: MediaProvider): void;
  addSourceTransform(fn: SourceTransform): () => void;            // §4.3
  registerComponent(type: string, factory: ComponentFactory): void;
  registerMenu(menu: MenuDefinition): () => void;
  registerHideRule(name: string, rule: HideRuleFactory): void;
  addLayer(node: LayoutNode, position: 'below-ui' | 'above-ui'): () => void;   // §6.2
}
```

Плагин создаётся фабрикой: `subtitlesPlugin({ ... })` → `Plugin`. Опции фабрики имеют
приоритет над одноимёнными полями общих `PlayerOptions` (которые плагин объявляет через
declaration merging).

`PluginHost.setupAll` вызывает `setup` по порядку массива, каждый в try/catch: сбой
логируется (`log.error`) и не роняет плеер. При `destroy` dispose-функции вызываются в
обратном порядке, тоже в try/catch. Дубликат `name` → warn, второй игнорируется.

### 3.6 Player и публичный API

```ts
function createPlayer(options: PlayerOptions): Player;

interface PlayerOptions {
  container: HTMLElement | string;          // элемент или id
  source?: string | SourceSpecInput;        // file-микросинтаксис или объект
  plugins?: Plugin[];                       // по умолчанию defaultPlugins()
  layout?: LayoutNode | false;              // по умолчанию defaultLayout; false = без UI
  poster?: string; title?: string;
  autoplay?: boolean; muted?: boolean; loop?: boolean;
  volume?: number; rate?: number;
  start?: number;                           // стартовая позиция, сек
  end?: number;                             // >0 — сек от начала, <0 — от конца; по достижении → pause + эмит end
  ratio?: string;                           // "16:9" по умолчанию, "auto" — по видео
  forceType?: 'hls';
  qualities?: string;                       // метки для неразмеченного списка (§4.1)
  theme?: Partial<ThemeVars>;               // { color1: '#f00', toolbarBg: '…' } → CSS custom properties
  icons?: Partial<Record<IconName, string>>; // SVG-строки
  lang?: 'ru' | 'en';                       // 'ru' по умолчанию
  i18n?: Partial<Record<string, string>>;    // переопределение строк
  idleTimeout?: number;                     // мс до autohide, 3000
  reload?: { retries: number; delay: number };
  hlsUrl?: string; hlsConfig?: Record<string, unknown>;
  log?: boolean;
  // + опции плагинов через declaration merging (§7)
}

interface Player {
  readonly id: string;                      // id контейнера пользователя (§2.1)
  readonly state: Readonly<PlayerState>;    // геттер store.get()
  readonly container: HTMLElement;          // элемент пользователя
  readonly root: HTMLElement;               // .vp-root внутри него
  readonly video: HTMLVideoElement;
  play(): Promise<void>; pause(): void; seek(t: number | string): void;
  load(source: string | SourceSpecInput): void;
  on: EventBus['on']; once: EventBus['once']; off: EventBus['off'];
  select: Store<PlayerState>['select'];
  command<K extends keyof PlayerCommands>(name: K, ...args: Parameters<PlayerCommands[K]>): ReturnType<PlayerCommands[K]> | undefined;
  api(cmd: string, arg?: unknown): unknown; // PlayerJS-совместимые строковые команды (§8.2)
  destroy(): void;
}
```

Методы `play/pause/seek/load` = `command(...)` с `source: 'api'`; `play()` возвращает
промис команды (может быть отклонён, напр. `NotAllowedError`).

`destroy`: эмит `destroy` → dispose UI-дерева и слоёв → dispose плагинов (обратный
порядок) → `provider.detach()` → снять DOM-слушатели и ResizeObserver → `video.removeAttribute('src'); video.load()` →
очистить контейнер. Повторный `destroy` — no-op; методы после destroy — no-op с warn.

Fullscreen: `container.requestFullscreen()` (фолбэк `webkitRequestFullscreen`); если
Fullscreen API нет (iOS Safari) — `video.webkitEnterFullscreen()`. `fullscreen` в store
обновляется по `fullscreenchange` / `webkitbeginfullscreen` / `webkitendfullscreen`.
`fullscreen()` вызывается только из пользовательского жеста (иначе браузер отклонит —
`log.warn`).

## 4. Источники

### 4.1 Микросинтаксис `file` (совместим с PlayerJS)

```ts
function isPlaylistInput(input: string | SourceSpecInput): boolean;
function parseSource(input: string, opts?: { qualities?: string; random?: () => number }): SourceSpec;
function parseSubtitleList(s: string): { label: string; url: string }[];   // "[En]a.vtt,[Ru]b.srt"
function sourceKey(spec: SourceSpec): string;   // первый URL первого качества/дорожки — стабилен при смене качества
```

`isPlaylistInput`: строка после trim начинается с `[{` или `{` и парсится как JSON, либо
URL (до `?`) оканчивается на `.txt`/`.json`.

`parseSource` (вход — не плейлист):

1. Вынести `(subtitle:[Lbl]url[Lbl2]url2)` из строки в `subtitles`.
2. Разделить по `,` на качества (запятая внутри URL не поддерживается — как в PlayerJS).
   Префикс `[Label]` — метка качества; элементы с меткой, начинающейся на `<<<`,
   отбрасываются (групповые разделители в v1 не рендерим).
3. Каждое качество разделить по `;` на аудиодорожки с префиксом `{Label}`.
4. Каждую дорожку разделить по ` or ` на цепочку fallback.
5. Каждое звено, содержащее ` and `, заменить случайным вариантом (`random` по
   умолчанию `Math.random`).
6. Суффикс URL `[seek:N]` → `start = N` (снимается с URL).
7. Без меток: одно качество `""`, одна дорожка `""`. `opts.qualities` (`"480p,720p"`)
   задаёт метки неразмеченным качествам по позиции.

```ts
interface SourceSpec {
  qualities: { label: string; tracks: { label: string; urls: string[] }[] }[];
  subtitles: { label: string; url: string }[];
  start?: number;
  forceType?: 'hls';
}
type SourceSpecInput = Partial<SourceSpec> & Pick<SourceSpec, 'qualities'>;
interface Selection { quality: number; audio: number; start: number }
type SourceTransform = (spec: SourceSpec, sel: Selection) => Selection;
```

### 4.2 Провайдеры

```ts
interface MediaProvider {
  name: string;
  canPlay(url: string, spec: SourceSpec): 0 | 1 | 2;   // 0 нет, 1 может, 2 предпочитает
  attach(video: HTMLVideoElement, ctx: ProviderContext): void;
  load(url: string, startTime: number): Promise<void>;  // отклонение = ошибка загрузки (§5)
  detach(): void;
  // опционально: внутренние качества/дорожки (HLS-манифест).
  // index — индекс в списке, который провайдер сам передал в setQualities/setAudioTracks
  // (= индекс в store). Преобразование в свои уровни делает провайдер.
  setQuality?(index: number): void;
  setAudioTrack?(index: number): void;
}
interface ProviderContext {
  setQualities(q: Quality[], current: number): void;      // провайдер становится владельцем списка качеств
  setAudioTracks(t: TrackInfo[], current: number): void;  // аналогично для дорожек
  error(err: PlayerError): void;                          // фатальная ошибка → §5
  log: Logger; options: PlayerOptions;
}
```

Для каждого URL выбирается провайдер с максимальным `canPlay`; при равенстве — первый
зарегистрированный (встроенные регистрируются первыми; `registerProvider` плагина
добавляет в конец). Все вернули 0 → ошибка `unsupported` для этого URL (§5).
Смена провайдера между URL — `detach` старого, `attach` нового.

- **html5**: `canPlay` = 1 для расширений mp4/webm/ogg/ogv/mov/m4v/mp3/m4a/aac/wav и для
  `.m3u8`, если `video.canPlayType('application/vnd.apple.mpegurl')` непуст; 0 для
  `.m3u8` без нативной поддержки; 1 для неизвестных расширений. `load` ставит `src`,
  после `loadedmetadata` выставляет `currentTime = startTime` (если > 0) и резолвит;
  `error` до `loadedmetadata` — reject.
- **hls**: `canPlay` = 2 для `.m3u8` (или `spec.forceType === 'hls'`), если нативной
  поддержки нет и `'MediaSource' in window`; иначе 0. При первом `load` берёт
  `window.Hls`, если он есть, иначе `import(/* @vite-ignore */ hlsUrl)` (по умолчанию
  `https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.mjs`); промис модуля кэшируется.
  Ошибка загрузки модуля → reject с `unsupported`. `hlsConfig` → конструктор Hls.
  `MANIFEST_PARSED`: если уровней > 1 — `setQualities([{label:'Авто'}, …levels], 0)` где
  метка уровня `${height}p` (коллизия → `${height}p ${round(bitrate/1000)}kbps`).
  `setQuality(i)`: `i === 0` → `hls.currentLevel = -1` (Auto), иначе `hls.currentLevel =
  i - 1`; `MediaController` передаёт store-индекс без преобразований. Аудиодорожки
  манифеста (если > 1) → `setAudioTracks`. Fatal-ошибки hls.js: `NETWORK_ERROR` →
  `startLoad()` один раз, `MEDIA_ERROR` → `recoverMediaError()` один раз, иначе
  `ctx.error(...)` (HTTP 404 манифеста → `not-found`). `detach` → `hls.destroy()`.

### 4.3 Конвейер `load`

`MediaController` обрабатывает команду `load(input)` строго в таком порядке:

1. **before-хуки `load`** получают сырой `input` (строка или `SourceSpecInput`). Так
   плагин playlist перехватывает плейлисты: если `isPlaylistInput(input)`, он сам
   разбирает/загружает плейлист, выставляет состояние, затем для выбранного элемента
   строит `SourceSpecInput` (`parseSource(item.file)` + `item.start` + субтитры из
   `item.subtitle` через `parseSubtitleList`) и вызывает `commands.run('load', [specInput])`,
   а исходную команду отменяет (`false`).
2. Если после хуков вход всё ещё плейлист (плагин не подключён) → `log.error`, событие
   `loaderror`, `status: 'error'` с `kind: 'unsupported'`. Ядро плейлисты не разбирает.
3. **Парсинг**: строка → `parseSource(input, { qualities: options.qualities })`;
   объект → нормализация в `SourceSpec` (пустые `subtitles`, `forceType` из опций).
4. **Выбор**: начальный `Selection = { quality: последнее качество, audio: 0,
   start: spec.start ?? options.start ?? 0 }`, затем по очереди все
   `SourceTransform`-ы (в порядке регистрации; так `quality` применяет
   `defaultQuality`, а `memory`, зарегистрированный позже, — сохранённые значения и
   позицию). Результат clamp-ится к допустимым индексам.
5. **Store**: `status: 'loading'`, сброс полей (§3.2), `qualities` — метки качеств
   spec, `quality` — выбранное; `audioTracks` — метки дорожек выбранного качества,
   `audioTrack` — выбранная. Эти списки считаются «файловыми» (владелец — ядро), пока
   провайдер не вызовет `setQualities`/`setAudioTracks`.
6. Эмит `new` с `{ spec, selection }` — плагины, которым нужен spec (subtitles берёт
   `spec.subtitles`), подписываются на это событие.
7. **Провайдер**: цепочка URL `spec.qualities[q].tracks[a].urls`, первый URL →
   выбор провайдера → `attach` при смене → `load(url, selection.start)`; `state.url`.
   Ошибки — §5.

### 4.4 Переключение качества и аудио

`setQuality(i)` / `setAudioTrack(i)` (владелец — `MediaController`):

- Если списком владеет провайдер (вызывал `setQualities`/`setAudioTracks` для текущего
  источника) → `provider.setQuality(i)` / `setAudioTrack(i)` без перезагрузки.
- Иначе (файловые варианты): запомнить `currentTime` и `paused`; для качества —
  аудиодорожка сохраняется по метке (нет такой метки → 0), `audioTracks` пересчитываются;
  выбрать цепочку URL → `provider.load(url, time)` (с fallback §5) → если не было
  паузы — `play()`.
- В обоих случаях обновить store и эмит `quality`/`audiotrack` с меткой.
- Индекс вне диапазона или равный текущему → no-op.

## 5. Ошибки

1. `provider.load` отклонён, `<video>` `error` или `ctx.error` → эмит `loaderror
   { url, error }` → следующий URL цепочки `or` для текущих качества/дорожки с
   сохранением позиции.
2. Перед переходом в ошибку — повторы `reload` для последнего URL цепочки (по умолчанию
   `{ retries: 0, delay: 2000 }`; если `live` — `{ retries: 3, delay: 2000 }`).
3. Цепочка и повторы исчерпаны → `status: 'error'`, `error` в store, событие `error`.
   Компонент `error-overlay` показывает локализованный текст по `kind`
   (MediaError code 2 → network, 3 → decode, 4 → unsupported; `not-found` выставляет
   только hls-провайдер по HTTP 404). Новый `load` сбрасывает ошибку.
4. Плагины изолированы try/catch (§3.5); исключения в обработчиках EventBus и
   подписчиках Store ловятся и логируются.
5. Ошибки вспомогательных загрузок (битый VTT, невалидный JSON плейлиста, сетевая ошибка
   субтитров/миниатюр) → `log.warn` + `loaderror`; плеер работает без этой функции.

## 6. UI

### 6.1 Компоненты

```ts
type ComponentFactory<P = Record<string, unknown>> =
  (ctx: UIContext, props: P & BaseProps) => ComponentInstance;
interface ComponentInstance { el: HTMLElement; slot?: HTMLElement; dispose?(): void }
interface UIContext {
  player: Player;
  store: Store<PlayerState>; events: EventBus; commands: CommandRegistry;
  options: PlayerOptions; root: HTMLElement; log: Logger;   // root = .vp-root
  t(key: string): string; icon(name: IconName): string;
  menus: MenuHost;
  build(node: LayoutNode): ComponentInstance | null;   // для контейнеров
  run(action: string): void;                           // исполнить action-строку (§6.4)
  user<K extends keyof PlayerCommands>(name: K, ...args: Parameters<PlayerCommands[K]>): void; // commands.run с source 'user'
  select: Store<PlayerState>['select'];                // авто-отписка при dispose
  on: EventBus['on'];                                  // авто-отписка при dispose
  listen(target: EventTarget, type: string, fn: EventListener, opts?: AddEventListenerOptions): void; // авто-отписка
}
```

Компонент — функция. LayoutEngine создаёт для каждого узла отдельный `UIContext`, в
котором `select/on/listen` запоминают отписки, и вызывает их при dispose вместе с
`dispose()` компонента.

### 6.2 Layout, слои и общие props

```ts
interface LayoutNode extends BaseProps {
  type: string;              // ключ ComponentRegistry
  children?: LayoutNode[];   // для контейнеров
  optional?: boolean;        // тип не зарегистрирован → пропустить без warn
  [prop: string]: unknown;   // props конкретного компонента
}
interface BaseProps {
  id?: string;               // DOM id = `${containerId}_control_${id}` (как в PlayerJS)
  hint?: string;             // tooltip (title) + aria-label; i18n-ключ или текст
  scale?: number;            // transform: scale()
  margin?: string;           // "top right bottom left" в px, как в билдере
  opacity?: number;
  bg?: string; color?: string;
  flex?: number;             // flex-grow внутри group
  anchor?: 'top-left' | 'top' | 'top-right' | 'left' | 'center' | 'right' |
           'bottom-left' | 'bottom' | 'bottom-right';   // только внутри overlay
  hide?: HideRuleSpec[];     // скрыть, если ЛЮБОЕ правило истинно
  action?: string;           // action-строка (§6.4) — заменяет клик-обработчик компонента
  className?: string;
}
```

LayoutEngine.build(node): ищет фабрику (неизвестный тип → warn и `null`; при
`optional` — `null` без warn) → вызывает её → применяет BaseProps к `el` → строит
`children` в `slot ?? el` → подключает hide-правила. `action` вешается capture-обработчиком
`click` на `el` (`stopPropagation` + `ctx.run(action)`).
Команда `layout(node)` — dispose текущего дерева + build нового (смена UI на лету).

**Слои.** `.vp-ui` содержит три фиксированных слоя-контейнера, которые создаёт composition
root, а не layout: `.vp-layer-below` (под деревом layout), `.vp-layout` (дерево
layout), `.vp-layer-above` (над ним). `addLayer(node, 'below-ui' | 'above-ui')` строит
узел через LayoutEngine в соответствующий слой. Поэтому слои плагинов (субтитры, панель
плейлиста, превью миниатюр) работают с любым пользовательским layout и при
`layout: false`. `MenuHost` монтирует панель меню в `.vp-layer-above`.

### 6.3 Hide-правила

```ts
type HideRuleSpec = string | Record<string, number | string>;
type HideRuleFactory = (arg: unknown, ctx: UIContext) => { test: (s: PlayerState) => boolean };
```

Движок подписывается на весь state (`select(s => s)`) и пересчитывает правила узла при
каждом изменении; узлов мало, отдельные `deps` не нужны.

Встроенные:

| Правило | Скрыть, когда |
|---|---|
| `idle` | `!userActive && status === 'playing' && !controlsLocked` |
| `paused` / `playing` | соответствующий статус |
| `not-started` / `started` | `!started` / `started` |
| `fullscreen` / `not-fullscreen` | `fullscreen` / `!fullscreen` |
| `not-waiting` | `!waiting` |
| `{ minWidth: N }` | `width >= N` |
| `{ maxWidth: N }` | `width < N` |
| `live` / `not-live` | `live` / `!live` |
| `not-error` | `status !== 'error'` |
| `no-menus` | `!menus.hasVisible(state)` |
| `{ command: 'name' }` | `!commands.has(name)` |

Плагин playlist добавляет `first-item`, `last-item`, `no-playlist`. Неизвестное правило →
warn, считается ложным. Скрытие — класс `vp-hidden`
(`opacity:0; visibility:hidden; pointer-events:none` с transition).

**UserActivity** (`ui/`): `pointermove/pointerdown/keydown/focusin` в контейнере →
`userActive = true` и перезапуск таймера `idleTimeout`; по таймеру → false;
`pointerleave` (pointerType mouse) → false; пока открыто меню (`ui:menu`) или идёт drag
слайдера — таймер не запускается. Смена видимости toolbar → событие `ui`.

### 6.4 Action-строки

`parseAction(str): Action[]` — чистая функция (`ui/actions.ts`). Синтаксис PlayerJS:

- `api:cmd,arg1,arg2;cmd2,arg` → `{ type: 'api', name, args }[]`. Исполняется через
  `ctx.player.api(name, arg)` (PlayerJS-имена: `seek,-10`, `toggle`, `volume,+0.1`).
  Передаётся первый аргумент (все команды v1 одноаргументные). Аргументы — строки;
  приведение типов делает `api-map`.
- `js:Fn,arg,{time}` → `window[Fn](...args)`; `Fn` — идентификатор или путь `a.b.c` от
  `window`, без eval. Не функция → warn.
- `event:name` → `container.dispatchEvent(new CustomEvent(name, { detail: state }))`.
- `settings` / `settings:speed,quality[,left|center|right]` → `menus.open({ only, align })`.
- `http(s)://…` или `//…` → `window.open(url, '_blank', 'noopener')`.
- Плейсхолдеры `{time}`, `{duration}`, `{title}`, `{file}` (= `state.url`) подставляются
  при исполнении.

`ActionRunner` живёт в `ui/` и получает `player` через `UIContext`, поэтому `api:`-actions
работают в любой сборке (compat-слой для них не нужен — `player.api` есть всегда).

### 6.5 Встроенные компоненты

| Тип | Поведение |
|---|---|
| `root`, `overlay`, `toolbar`, `group` (`direction: row/column`), `spacer` | контейнеры/раскладка; `overlay` — абсолютный слой, дети позиционируются по `anchor` |
| `media-click-layer` | клик → `toggle`, dblclick → `toggleFullscreen`; на тач-устройстве первый тап при `!userActive` только показывает контролы |
| `play` | play/pause, иконка по статусу (`ended` → replay) |
| `big-play` | крупная кнопка в центре, `play` |
| `timeline` | прогресс, буфер; hover → `ui:timeline-hover` / `ui:timeline-leave`; pointer drag → позиция показывается во время drag, `seek` на отпускании; ←/→ при фокусе; эмит `line`; скрыт при `live` |
| `mute` | кнопка звука, 3 иконки по уровню; колесо → ±0.05 |
| `volume` | слайдер 0..1; колесо → ±0.05 |
| `time`, `duration` | `m:ss` или `h:mm:ss` (если duration ≥ 3600) |
| `title` | `state.title` |
| `buffering` | спиннер |
| `fullscreen` | вход/выход |
| `settings` | кнопка, `menus.open()` |
| `live` | бейдж `● LIVE` |
| `prev`, `next` | `user('prev')` / `user('next')` (команды регистрирует playlist) |
| `playlist-button` | `user('togglePlaylist')` |
| `error-overlay` | текст ошибки по `kind` + кнопка «Повторить» (`user('reload')`) |
| `text` | `props.text` с плейсхолдерами `{time}`, `{duration}`, `{title}` |

Слайдеры — `role="slider"` с `aria-valuemin/max/now/valuetext`, `tabindex=0`; кнопки —
`<button type="button">` с `aria-label`. Pointer events (мышь + тач).

### 6.6 Меню настроек

```ts
interface MenuDefinition {
  id: string;                         // 'quality' | 'speed' | 'subtitle' | 'audio' | …
  label: string;                      // i18n-ключ или текст
  order?: number;                     // quality 10, speed 20, subtitle 30, audio 40
  visible: (s: PlayerState) => boolean;
  options: (s: PlayerState) => { label: string; value: unknown }[];
  current: (s: PlayerState) => unknown;
  select: (value: unknown) => void;
}
interface MenuHost {
  register(def: MenuDefinition): () => void;
  open(opts?: { only?: string[]; align?: 'left' | 'center' | 'right' }): void;
  close(): void;
  toggle(): void;
  readonly isOpen: boolean;
  hasVisible(s: PlayerState): boolean;
}
```

Панель меню в `.vp-layer-above` над toolbar: главный список видимых меню с текущим
значением справа → подменю с отметкой текущего пункта и кнопкой «назад». Если после
фильтра `only` видимо одно меню — сразу подменю. Закрытие: клик вне, Escape, выбор пункта.
Навигация ↑/↓/Enter/← (назад). Открытие/закрытие → `ui:menu`.

### 6.7 Default layout

```
root
├─ media-click-layer
├─ overlay
│  ├─ title            anchor top-left, hide [idle, not-started]
│  ├─ buffering        anchor center, hide [not-waiting]
│  ├─ big-play         anchor center, hide [started]
│  └─ error-overlay    anchor center, hide [not-error]
└─ toolbar             hide [idle, not-started]
   ├─ timeline
   └─ group row
      ├─ prev (optional, hide [{command:'prev'}, first-item])  play
      ├─ next (optional, hide [{command:'next'}, last-item])
      ├─ mute  volume (hide [{maxWidth: 400}])
      ├─ time  text("/")  duration  live (hide [not-live])
      ├─ spacer
      └─ settings (hide [no-menus])  playlist-button (optional, hide [no-playlist])  fullscreen
```

Правила `first-item/last-item/no-playlist` при отсутствии плагина неизвестны → считаются
ложными, но `{command}` скрывает кнопки. `defaultLayout` — экспортируемая константа;
пользователь может взять её, изменить и передать в `layout`.

### 6.8 Тема, иконки, i18n

`theme/player.css` с custom properties на `.vp-root`:

`--vp-color-1` (акцент: прогресс, активные пункты), `--vp-color-2` (иконки/текст),
`--vp-color-3` (фон меню), `--vp-toolbar-bg` (градиент), `--vp-font`, `--vp-font-size`,
`--vp-radius`, `--vp-icon-size`, `--vp-timeline-height`, `--vp-sub-color`, `--vp-sub-bg`,
`--vp-sub-size`. `ThemeVars` — camelCase-ключи (`color1` → `--vp-color-1`, `toolbarBg` →
`--vp-toolbar-bg`), выставляются inline на `.vp-root`. CSS инжектируется в `<head>` при
первом `createPlayer` одной `<style id="vp-styles">`; строка CSS импортируется через
Vite `?inline` (для `tsc` — шим `declare module '*?inline'` в `src/env.d.ts`; Vitest
резолвит `?inline` через Vite).
Размер: `aspect-ratio` из `ratio`; `ratio: 'auto'` — по `videoWidth/videoHeight` после
`loadedmetadata`.

Иконки — inline SVG-строки в `ui/icons.ts` (`play, pause, replay, volume-high, volume-low,
volume-mute, fullscreen, fullscreen-exit, settings, playlist, prev, next, check, back`),
переопределяются опцией `icons`. i18n — словари `ru` (по умолчанию) и `en` в
`ui/i18n.ts`, выбор `lang`, переопределение ключей `i18n`. `t(key)` для неизвестного
ключа возвращает сам ключ (так `hint: 'Мой текст'` работает без словаря).

## 7. Плагины v1

Каждый плагин — отдельный файл, фабрика `xxxPlugin(opts?) : Plugin`.
`defaultPlugins()` возвращает их в порядке таблицы. Плагины не регистрируют команд ядра.

| Плагин | Делает | Опции (compat-имена в скобках) |
|---|---|---|
| `quality` | меню «Качество» (видимо при ≥ 2 качествах; `select` → `setQuality`); `SourceTransform`: `defaultQuality`; фильтр `forbiddenQuality` (скрывает пункты меню, не меняет spec) | `defaultQuality` (`default_quality`: метка, `num:X`, `max`), `forbiddenQuality` (`forbidden_quality`) |
| `speed` | state `speeds: number[]`; меню «Скорость» (`setRate`); команда `setSpeedIndex(i)` (для compat `api('speed', i)`); на `init` — `defaultSpeed` (memory, идущий позже, перекрывает сохранённым) | `speeds` (`[0.5,0.75,1,1.25,1.5,2]`), `defaultSpeed` (`default_speed`) |
| `audiotracks` | меню «Аудио» (≥ 2 дорожек; `setAudioTrack`); `SourceTransform`: `defaultAudio`; переименование меток через `renameAudio` (по метке или индексу) — применяется к меню и событию | `defaultAudio` (`default_audio`), `renameAudio` (`rename_audio`) |
| `subtitles` | на `new` берёт `spec.subtitles` + опцию `subtitle` (`[En]url,[Ru]url`); fetch + парсинг VTT/SRT (по расширению или сигнатуре `WEBVTT`); state `textTracks/textTrack`; слой `'below-ui'`, поднимается выше при видимом toolbar; меню «Субтитры» с «Выкл»; команды `setTextTrack(i)`, `toggleSubtitles()`, `addSubtitle(label, url)`; событие `subtitle` (метка или `off`); выбор: `defaultSubtitle` → иначе выкл., если `subtitleStart === false`, иначе первая | `subtitle`, `defaultSubtitle` (`default_subtitle`), `subtitleStart` (`subtitle_start`), `subshift` (десятые доли с; также `?shift=N` в URL) |
| `thumbnails` | fetch + парсинг VTT `url#xywh=x,y,w,h` (или отдельные картинки; относительные URL — от URL VTT); превью в `'above-ui'` над timeline по `ui:timeline-hover` с временем под картинкой; без VTT — только время; источник берётся из опции или поля элемента плейлиста (через событие `new` и state `playlist`) | `thumbnails` (URL); команда `setThumbnails(url)` |
| `playlist` | before-хук `load` (§4.3); вход: JSON-массив/объект или URL `.txt`/`.json` (fetch); вложенные `folder`; state `playlist: { items, flat, index, open }`; панель в `'above-ui'` справа с раскрывающимися папками; state `autonext`, `playlistLoop`; команды `next`, `prev`, `playItem(idOrIndex, autoplay = true)`, `push(items)`, `setPlaylist(itemsOrUrl)`, `togglePlaylist()`, `setAutonext(b)`, `setPlaylistLoop(b)`; на `end` — autonext / playlistLoop; hide-правила `first-item`, `last-item`, `no-playlist`; события `playlist`, `next`, `previous`; поля элемента `title, file, poster, subtitle, thumbnails, id, folder, start` — при выборе пишет `title`/`poster` в store | `autonext` (true), `playlistLoop` (`playlistloop`, false), `plstart` (id), `hidePlaylist` (`hideplaylist`, панель закрыта по умолч. — true) |
| `hotkeys` | Space toggle, Enter toggle (выкл.), F fullscreen, M mute, ←/→ `seek ±seekStep`, ↑/↓ `setVolume ±volumeStep`, 0–9 → N×10 %; колесо над видео в fullscreen → громкость. `keydown` на контейнере (фокус внутри) и, если `global`, на `document` при наведении. Игнорирует `input/textarea/select/[contenteditable]` и модификаторы Ctrl/Meta/Alt; `preventDefault` для обработанных | `hotkeys: { seekStep: 5, volumeStep: 0.1, enter: false, numbers: true, wheel: true, global: false }` или `false` |
| `memory` | localStorage. Позиция: ключ `vp:t:${cuid ?? location.pathname + '#' + player.id + '#' + sourceKey(spec)}` (ключ вычисляется в `SourceTransform` и запоминается до следующего `load`), сохранение раз в 5 с и на `pause`; state `cuid`, команда `setCuid(s)`; `SourceTransform` подставляет позицию в `selection.start`, если 5 с < t и (duration неизвестна или t < duration − 10 с), не для live; очистка на `end`. Глобальные: `vp:volume`, `vp:muted` (применяет на `init`), `vp:quality` (метка → `SourceTransform`), `vp:speed`, `vp:subtitle` (метка или `off`), `vp:audio` (метка → `SourceTransform`); пишет при соответствующих событиях. Исключения localStorage глушатся | `memory: { position, volume, quality, speed, subtitle, audio }` (все true) или `false`; `cuid` |
| `autoplay` | при `options.autoplay` на событие `metadata` (провайдер загрузил источник; только для первого `metadata` после каждого `load`, инициированного не пользователем) вызывает `player.play()`; отклонение с `NotAllowedError` → `mute` + повтор; иные отклонения → `log.warn`; при muted-autoplay `before('toggle')` для первого `source: 'user'` клика: снимает mute и отменяет toggle (видео продолжает играть) | `autoplay`, `autoplayMuteFallback` (true) |
| `mediasession` | `navigator.mediaSession.metadata` (title, artwork = poster), обработчики play/pause/seekto/seekbackward/seekforward и previoustrack/nexttrack (если команды есть); нет API → no-op | `mediasession` (true) |

Известное ограничение v1: сохранённое качество (`vp:quality`) применяется только к
файловым качествам; для HLS список качеств появляется после разбора манифеста, и
выбор остаётся «Авто».

Порядок важен: `memory` после `quality`, `speed`, `subtitles`, `audiotracks`, поэтому его
`SourceTransform` выполняется позже и сохранённые значения перекрывают `default_*`.
Применение выбора субтитров: `memory` на `init` пишет сохранённое значение в базовое
state-поле `preferredSubtitle`; `subtitles` на `new` берёт `preferredSubtitle`, иначе
`defaultSubtitle`. Поле объявлено в `types.ts`, поэтому плагины не зависят друг от друга.

## 8. Compat-слой PlayerJS

### 8.1 Конструктор

```ts
interface PlayerjsOptions {
  id: string; file?: string; poster?: string; title?: string;
  nocontrols?: 0 | 1; ready?: string; postmessage?: 0 | 1; postmessageOrigin?: string;
  [key: string]: unknown;              // остальные — по таблице маппинга
}
class Playerjs {
  constructor(opts: PlayerjsOptions);
  api(cmd: string, arg?: unknown): unknown;   // = player.api
  readonly player: Player;
}
```

`compat/options.ts` — таблица маппинга (единственное место знаний об именах опций
PlayerJS) snake_case и `0|1` → `PlayerOptions`: `id → container`, `file → source`,
`default_quality → defaultQuality`, `forbidden_quality`, `default_audio`, `rename_audio`,
`default_speed`, `default_subtitle`, `subtitle`, `subtitle_start`, `subshift`,
`thumbnails`, `autoplay`, `loop`, `autonext`, `playlistloop`, `plstart`, `hideplaylist`,
`cuid`, `start`, `end`, `volume`, `ratio`, `qualities`, `hls` (→ `forceType: 'hls'`),
`hlsconfig`, `log`, `color1..3` (→ `theme`). Неизвестные опции → `log.warn`.
Подключает `defaultPlugins()` и `defaultLayout`. `nocontrols:1` → layout из одного
`root` с `media-click-layer`. `ready:"fnName"` → `window[fnName]?.(id)` после `init`.

UMD-сборка выставляет `window.Playerjs` и `window.VP` (экспорты `index.ts`) и после
загрузки вызывает `window.PlayerjsAsync?.()`.

### 8.2 `api(cmd, arg)` — `api/api-map.ts`

```ts
interface ApiContext { player: Player; store: Store<PlayerState>; commands: CommandRegistry;
                       options: PlayerOptions }
function createApi(ctx: ApiContext): (cmd: string, arg?: unknown) => unknown;
```

Таблица `cmd → (ctx, arg) => result`; читает state, вызывает только команды (не пишет в
store напрямую). Без аргумента — геттер, с аргументом —
сеттер/действие. Строковые числа приводятся к числам; `"+N"`/`"-N"` для `seek`/`volume`
передаются как относительные.

| Команда | Без аргумента | С аргументом |
|---|---|---|
| `play` | `play` | URL/строка → `load` + `play`; `id:x` → `playItem(x)` |
| `pause`, `toggle`, `stop` | действие | — |
| `seek` | — | число / `"+10"` |
| `time`, `duration`, `buffered`, `playing`, `started`, `live`, `muted`, `isfullscreen` | геттер | — |
| `volume` | геттер | 0..1 / `"+0.1"` |
| `mute`, `unmute`, `fullscreen`, `exitfullscreen` | действие | — |
| `quality`, `audiotrack` | метка | индекс; `audiotrack` также метка |
| `qualities`, `audiotracks`, `subtitles` | массив меток | — |
| `speed` | текущая скорость | индекс → `setSpeedIndex` |
| `subtitle` | метка или `off` | индекс / -1 / `"[T]url"` (= `+subtitle` + выбор) |
| `+subtitle` | — | `"[T]url"` → `addSubtitle` |
| `togglesubs` | `toggleSubtitles` | — |
| `file` | `state.url` | `load` без `play` |
| `preload` | — | `load` без `play` + `video.preload = 'auto'` |
| `playlist` | `state.playlist.items` | массив/URL → `setPlaylist` |
| `next`, `prev` | действие | — |
| `find` | — | id → `playItem(id, false)` (выбрать без запуска) |
| `push` | — | массив → `push` |
| `autonext`, `playlistloop`, `loop` | 0/1 из state | 0/1 → `setAutonext` / `setPlaylistLoop` / `setLoop` |
| `title`, `poster` | геттер | `setTitle` / `setPoster` |
| `thumbnails` | — | URL → `setThumbnails` |
| `toolbar` | `showControls` | `"on"` → `setControlsLocked(true)`, `"off"` → false |
| `menu` | `toggleMenu` | — |
| `cuid` | геттер (state) | `setCuid` |
| `id` | `player.id` | — |
| `destroy` | `destroy` | — |

Команда, зависящая от неподключённого плагина (`commands.has` = false), или неизвестная
→ `log.warn`, `undefined`.

### 8.3 Мост событий

`compat/events.ts`: `events.onAny` с фильтром по `PLAYERJS_EVENTS` (внутренние `ui:*` не
проходят) → `window.PlayerjsEvents?.(event, id, data)` и
`container.dispatchEvent(new CustomEvent(event, { detail: data }))`.

### 8.4 postMessage (опция `postmessage: 1`)

Входящие `message` с `data = { api, set }` (проверка `event.source === window.parent`
и, если задан `postmessageOrigin`, `event.origin`) → `api(api, set)`; ответ геттера —
`event.source.postMessage({ event: api, answer }, event.origin)`. Исходящие события
(тот же фильтр `PLAYERJS_EVENTS`) — `window.parent.postMessage({ event, id, data },
postmessageOrigin ?? '*')`, только если `window.parent !== window`.

## 9. Вне scope v1 (будущие плагины)

VAST/реклама (через `before('play')` и `addLayer`), DASH, YouTube/Vimeo-провайдеры,
Chromecast/AirPlay, PiP-кнопка, 360°, DVR, эффекты, квиз, водяные знаки, пароль/домены,
share/download, контекстное меню, ASS/SSA, субтитры из HLS-манифеста, параллельные
субтитры, переключение дизайнов, markup/points на timeline, skip-кнопка, sleep timer,
групповые разделители `<<<` в меню качества.

## 10. Тестирование

- Vitest + jsdom. TDD для чистых модулей: `parseSource`, `isPlaylistInput`, VTT/SRT-
  парсеры, thumbnails-VTT, `parseAction`, `Store`, `EventBus`, `CommandRegistry`,
  `PluginHost`, hide-правила, `memory` (ключи, пороги, мок localStorage),
  `compat/options`, `api-map`.
- Интеграционные: `createPlayer` с `FakeProvider` + `FakeMedia` (хелпер, переопределяющий
  на реальном jsdom `HTMLVideoElement` `play/pause/load`, `currentTime`, `duration`,
  `paused`, `buffered` и диспатчащий медиа-события) — команда → store → DOM компонентов;
  fallback по `or`; переключение качества с сохранением позиции; плейлист autonext;
  hide-правила; меню меняет качество; destroy снимает всё; compat `new Playerjs` +
  `api()` + `PlayerjsEvents`.
- Ручная проверка в браузере (Playwright) на `demo/index.html`: mp4 с несколькими
  качествами, HLS-поток (`https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8`),
  субтитры VTT+SRT, миниатюры-спрайт, плейлист с папками, compat-пример `new Playerjs`.
  Локальные ассеты генерирует `demo/scripts/make-assets.sh` через ffmpeg (короткие
  ролики 360p/720p, спрайт миниатюр + VTT, субтитры); без ffmpeg демо использует
  публичные URL.
- Критерии готовности: `tsc --noEmit` без ошибок, все тесты зелёные, `vite build`
  выдаёт ESM + UMD + d.ts, демо работает без ошибок в консоли.

## 11. Сборка

`package.json`: `type: module`, devDependencies — `typescript`, `vite`, `vitest`, `jsdom`.
Скрипты: `dev` (vite, корень `demo/`), `build` (vite library mode + `tsc
--emitDeclarationOnly`), `test` (vitest run), `typecheck` (`tsc --noEmit`).
Выход: `dist/player.js` (ESM, именованные экспорты плагинов и компонентов для
tree-shaking), `dist/player.umd.js` (`window.Playerjs`, `window.VP`), `dist/types/`.
`tsconfig`: `strict`, `target ES2020`, `lib ["ES2020", "DOM", "DOM.Iterable"]`,
`moduleResolution bundler`.

## 12. Порядок реализации (для плана)

Каждая фаза заканчивается зелёными тестами и рабочим демо:

1. Каркас проекта, `types.ts`, `core/` (Store, EventBus, CommandRegistry, PluginHost),
   `source/`.
2. `MediaController` + html5-провайдер + `player.ts` без UI (управление через API).
3. `ui/` (LayoutEngine, hide-правила, UserActivity, actions, MenuHost) + базовые
   компоненты + тема + default layout.
4. Плагины quality, speed, audiotracks, hotkeys, autoplay, memory.
5. Плагины subtitles, thumbnails, playlist, mediasession.
6. hls-провайдер.
7. `api/` + compat (options, events, postMessage) + UMD.
8. Демо-ассеты, демо-страница, ручная проверка в браузере.
