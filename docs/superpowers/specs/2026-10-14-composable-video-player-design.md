# Composable Video Player — дизайн v1

Дата: 2026-10-14
Статус: утверждён в брейншторме, ожидает ревью спецификации

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

## 2. Структура модулей

```
src/
  core/        Player, Store, EventBus, CommandRegistry, PluginHost, ProviderRegistry, logger
  source/      парсер file-микросинтаксиса → MediaSource
  providers/   html5 (mp4/webm/ogg/native HLS), hls (ленивый hls.js)
  ui/          LayoutEngine, ComponentRegistry, base props, HideRules, ActionParser, icons, MenuHost
  components/  play, big-play, timeline, mute, volume, time, duration, buffering, title,
               fullscreen, settings, live, prev, next, playlist-button, error-overlay,
               text, spacer, group, toolbar, overlay, root, media-click-layer
  plugins/     playlist, subtitles, thumbnails, hotkeys, memory, quality, speed,
               audiotracks, mediasession, autoplay
  compat/      Playerjs class, api(cmd,arg) mapping, PlayerjsEvents, postMessage bridge
  theme/       player.css (CSS custom properties)
  index.ts     createPlayer, defaultPlugins, defaultLayout, типы
demo/          index.html + примеры, скрипт генерации тестовых ассетов
tests/         зеркалит src/
```

Правило границ: `core` не импортирует ничего из `ui`, `plugins`, `providers`, `compat`.
Плагины не импортируют друг друга — общение только через store, события и команды.
`components` не трогают `HTMLVideoElement` — только `store.select()` и `commands.run()`.

## 3. Ядро

### 3.1 Store

```ts
interface Store<S> {
  get(): Readonly<S>;
  set(patch: Partial<S>): void;            // поверхностное слияние, уведомляет подписчиков изменённых ключей
  select<T>(selector: (s: S) => T, cb: (value: T, prev: T) => void,
            opts?: { immediate?: boolean; equals?: (a: T, b: T) => boolean }): () => void;
}
```

Уведомление синхронное, батчинга в v1 нет. Сравнение по умолчанию — `Object.is`.

### 3.2 PlayerState

```ts
interface PlayerState {
  status: 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'ended' | 'error';
  started: boolean;            // был первый play
  currentTime: number; duration: number;
  buffered: number;            // конец буферизованного диапазона, содержащего currentTime, сек
  live: boolean;               // duration === Infinity
  waiting: boolean;            // буферизация
  volume: number; muted: boolean; rate: number;
  fullscreen: boolean;
  userActive: boolean;         // курсор/тач активен (autohide)
  controlsLocked: boolean;     // toolbar "on" — не скрывать
  width: number; height: number;
  qualities: Quality[]; quality: number;           // -1 = Auto (ABR, только HLS)
  audioTracks: TrackInfo[]; audioTrack: number;
  textTracks: TrackInfo[]; textTrack: number;      // -1 = выключено
  title: string; poster: string;
  error: PlayerError | null;
}
interface Quality { label: string; height?: number; bitrate?: number }
interface TrackInfo { label: string; lang?: string }
interface PlayerError { kind: 'network' | 'decode' | 'not-found' | 'unsupported' | 'unknown'; message: string }
```

Плагины расширяют `PlayerState`, `PlayerEvents`, `PlayerCommands`, `PlayerOptions` через
declaration merging (`declare module '../core/types' { interface PlayerState { … } }`).

### 3.3 EventBus

Типизированный `on/once/off/emit` по карте `PlayerEvents`. Имена событий совпадают с PlayerJS:

`init, start, new, metadata, play, userplay, pause, userpause, stop, end, finish, time,
quartile, duration, seek, userseek, mute, unmute, volume, quality, audiotrack, subtitle,
speed, fullscreen, exitfullscreen, resize, ui, buffering, buffered, loaderror, error,
playlist, next, previous, line, destroy`.

Источники событий:
- `play/pause/time/duration/buffering/buffered/volume/mute/unmute/speed/end/metadata/seek`
  — из `<video>`-событий (ядро).
- `userplay/userpause/userseek` — дополнительно, когда соответствующая команда пришла с
  `source: 'user'` (UI, hotkey, action-строка).
- `start` — первый `playing` после `load`; `new` — каждый `load`; `stop` — команда `stop`.
- `quartile` (payload 25/50/75/100) — один раз на каждую отметку на файл.
- `time` — на каждый `timeupdate` (~4 Гц). `finish` в v1 эмитится сразу после `end`.
- `ui` (0/1) — смена видимости toolbar; `resize` — ResizeObserver; `line` — клик по timeline.

### 3.4 CommandRegistry

```ts
interface CommandContext { source: 'api' | 'user' | 'internal' }
interface CommandRegistry {
  register<K extends keyof PlayerCommands>(name: K, handler: CommandHandler<K>): () => void;
  before<K extends keyof PlayerCommands>(name: K, hook: BeforeHook<K>): () => void;
  run<K extends keyof PlayerCommands>(name: K, args: Parameters<PlayerCommands[K]>,
                                      ctx?: CommandContext): ReturnType<PlayerCommands[K]> | undefined;
  has(name: string): boolean;
}
type BeforeHook<K> = (args: Parameters<PlayerCommands[K]>, ctx: CommandContext)
                     => false | void | Parameters<PlayerCommands[K]>;
```

`before`-хук может отменить команду (`false`) или подменить аргументы (вернуть новый
массив). Хуки вызываются в порядке регистрации. Неизвестная команда → `log.warn`,
`undefined`. Повторная `register` того же имени заменяет обработчик (warn). Это точка
расширения для будущих рекламы/ограничений перемотки.

Команды ядра: `play, pause, toggle, stop, seek (число или строка "+10"/"-10"),
setVolume (число или "+0.1"), mute, unmute, toggleMute, setRate, fullscreen,
exitFullscreen, toggleFullscreen, load(source), setQuality, setAudioTrack, setControlsLocked,
layout(node), destroy`.

### 3.5 Плагины

```ts
interface Plugin<O = unknown> {
  name: string;
  setup(ctx: PluginContext): void | (() => void);   // опции плагина — в замыкании фабрики
}
interface PluginContext {
  player: Player; store: Store<PlayerState>; events: EventBus; commands: CommandRegistry;
  options: PlayerOptions; container: HTMLElement; video: HTMLVideoElement; log: Logger;
  registerProvider(p: MediaProvider): void;
  registerComponent(type: string, factory: ComponentFactory): void;
  registerMenu(menu: MenuDefinition): void;
  registerHideRule(name: string, rule: HideRuleFactory): void;
  addLayer(node: LayoutNode, position: 'below-ui' | 'above-ui'): void; // напр. слой субтитров
}
```

Плагин создаётся фабрикой: `subtitlesPlugin({ ... })` → `Plugin`. Опции плагинов также
читаются из общих `PlayerOptions` (через declaration merging) — опции фабрики имеют
приоритет.

`PluginHost` вызывает `setup` по порядку массива `plugins`, каждый в try/catch: сбой одного
плагина логируется (`log.error`) и не роняет плеер. При `destroy` dispose-функции
вызываются в обратном порядке. Дубликат `name` → warn, второй игнорируется.

### 3.6 Player и публичный API

```ts
function createPlayer(options: PlayerOptions): Player;

interface PlayerOptions {
  container: HTMLElement | string;          // элемент или id
  source?: string | MediaSourceInput;       // file-микросинтаксис или объект
  plugins?: Plugin[];                       // по умолчанию defaultPlugins()
  layout?: LayoutNode | false;              // по умолчанию defaultLayout; false = без UI
  poster?: string; title?: string;
  autoplay?: boolean; muted?: boolean; loop?: boolean;
  volume?: number; rate?: number;
  start?: number; end?: number;             // end < 0 — отсчёт от конца; по достижении end → pause + end
  ratio?: string;                           // "16:9" по умолчанию, "auto" — по видео
  theme?: Partial<ThemeVars>;               // CSS custom properties
  icons?: Partial<Record<IconName, string>>; // SVG-строки
  i18n?: Partial<Record<string, string>>;    // подписи и подсказки, по умолчанию ru
  idleTimeout?: number;                     // мс до autohide, 3000
  reload?: { retries: number; delay: number };
  hlsUrl?: string; hlsConfig?: Record<string, unknown>;
  log?: boolean;
  // + опции плагинов через declaration merging
}

interface Player {
  readonly state: Readonly<PlayerState>;
  readonly container: HTMLElement;
  readonly video: HTMLVideoElement;
  play(): Promise<void>; pause(): void; seek(t: number | string): void;
  load(source: string | MediaSourceInput): void;
  on: EventBus['on']; once: EventBus['once']; off: EventBus['off'];
  select: Store<PlayerState>['select'];
  command<K extends keyof PlayerCommands>(name: K, ...args: Parameters<PlayerCommands[K]>): ReturnType<PlayerCommands[K]> | undefined;
  destroy(): void;
}
```

`MediaSourceInput` — `MediaSource` (§4.1) с необязательными полями (`subtitles`, `start`).

Жизненный цикл: создать DOM-каркас (`.vp-root > .vp-media + .vp-ui`) → создать `<video
playsinline preload="metadata">` → регистрация встроенных провайдеров и компонентов →
setup плагинов → построить layout → `load(source)`, если задан → эмит `init`.
`destroy`: эмит `destroy` → dispose UI → dispose плагинов (обратный порядок) → detach
провайдера → снять DOM-слушатели и ResizeObserver → очистить контейнер. Повторный
`destroy` — no-op; методы после destroy — no-op с warn.

Fullscreen: `container.requestFullscreen()` (с `webkitRequestFullscreen`), на iOS без
Fullscreen API — `video.webkitEnterFullscreen()`. `fullscreen` в store — по
`fullscreenchange`.

## 4. Источники

### 4.1 Микросинтаксис `file` (совместим с PlayerJS)

`parseSource(input: string, opts: { qualities?: string; random?: () => number }): ParsedInput`,
где `ParsedInput = { kind: 'media'; source: MediaSource } | { kind: 'playlist'; data: string }`.

Порядок разбора:

1. Если строка после trim начинается с `[{` или `{` и парсится как JSON, или URL
   оканчивается на `.txt`/`.json` → `kind: 'playlist'` (обрабатывает плагин playlist; без
   плагина ядро загружает первый `file` и пишет warn).
2. Вынести `(subtitle:[Lbl]url[Lbl2]url2)` из строки в список субтитров.
3. Разделить по `,` на качества (запятая внутри URL не поддерживается — как в PlayerJS).
   Префикс `[Label]` — метка качества; элементы с меткой, начинающейся на `<<<`,
   отбрасываются (групповые разделители меню в v1 не рендерим).
4. Каждое качество разделить по `;` на аудиодорожки с префиксом `{Label}`.
5. Каждую дорожку разделить по ` or ` на цепочку fallback.
6. Каждое звено, содержащее ` and `, заменить случайным из вариантов (`random`
   инъектируется для тестов).
7. Суффикс URL `[seek:N]` → `start = N` (снимается с URL).

Без меток: одно качество `""`, одна дорожка `""`. Опция `qualities:"480p,720p"` задаёт
метки для неразмеченного списка через запятую (по позиции).

```ts
interface MediaSource {
  qualities: { label: string; tracks: { label: string; urls: string[] }[] }[];
  subtitles: { label: string; url: string }[];
  start?: number;
  forceType?: 'hls';                  // опция hls:1
}
```

Если у качеств разный набор аудиодорожек, `audioTracks` в store берутся из текущего
качества; при смене качества индекс дорожки сохраняется по метке, иначе 0.

Выбор при загрузке (выполняет плагин quality / audiotracks; без них — индексы 0):
качество — сохранённое (memory) → `defaultQuality` (метка, `num:X`, `max`) → последнее.
Аудио — сохранённое → `defaultAudio` → 0. Плагины выставляют выбор через `before('load')`-хук,
который дополняет `MediaSource` полями `initialQuality`/`initialAudio`.

### 4.2 Провайдеры

```ts
interface MediaProvider {
  name: string;
  canPlay(url: string, source: MediaSource): 0 | 1 | 2;   // 0 нет, 1 может, 2 предпочитает
  attach(video: HTMLVideoElement, ctx: ProviderContext): void;
  load(url: string, startTime: number): Promise<void>;
  detach(): void;
  // опционально: внутренние качества/дорожки (HLS)
  setQuality?(index: number): void;    // -1 = auto
  setAudioTrack?(index: number): void;
}
interface ProviderContext {
  setQualities(q: Quality[], current: number): void;      // пишет в store
  setAudioTracks(t: TrackInfo[], current: number): void;
  error(err: PlayerError): void;                          // фатальная ошибка → fallback (§5)
  log: Logger; options: PlayerOptions;
}
```

Выбор для каждого URL — максимальный `canPlay`; при равенстве — первый
зарегистрированный. Смена провайдера между URL — `detach` старого, `attach` нового.

- **html5**: `canPlay` = 1 для расширений mp4/webm/ogg/ogv/mov/m4v/mp3/m4a/aac/wav и для
  `.m3u8`, если `video.canPlayType('application/vnd.apple.mpegurl')` непуст; 0 для
  `.m3u8` без нативной поддержки; 1 для неизвестных расширений. `load` ставит `src`,
  `currentTime = startTime` после `loadedmetadata`.
- **hls**: `canPlay` = 2 для `.m3u8` (или `forceType: 'hls'`) при отсутствии нативной
  поддержки и наличии `window.MediaSource`; иначе 0. `attach` берёт `window.Hls`, если он
  есть, иначе `import(/* @vite-ignore */ hlsUrl)` (по умолчанию
  `https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.mjs`); промис кэшируется на модуль.
  Ошибка загрузки модуля → `ctx.error({ kind: 'unsupported' })`. Уровни манифеста →
  `setQualities` с меткой `${height}p` (коллизия → `${height}p ${kbps}kbps`), первым
  пунктом «Авто» (индекс -1). Аудиодорожки манифеста → `setAudioTracks`. `hlsConfig`
  передаётся в конструктор. Fatal-ошибки hls.js: `NETWORK_ERROR` → `startLoad()` один раз,
  `MEDIA_ERROR` → `recoverMediaError()` один раз, иначе `ctx.error(...)`.

`<video>`-события слушает ядро, не провайдер: `loadstart, loadedmetadata, durationchange,
play, playing, pause, waiting, canplay, seeking, seeked, timeupdate, progress,
volumechange, ratechange, ended, error` → store + события (§3.3).

### 4.3 Переключение качества/аудио из разных файлов

Запомнить `currentTime` и `paused` → выбрать URL (первый в цепочке) →
`provider.load(url, time)` → после `loadedmetadata` позиция восстановлена провайдером; если
до переключения шло воспроизведение — `play()`. Событие `quality`/`audiotrack` с меткой.
Для HLS-уровней внутри одного манифеста — `provider.setQuality(i)`, без перезагрузки.

## 5. Ошибки

1. `<video>` `error` или `ctx.error` провайдера → следующий URL цепочки `or` для текущих
   качества/дорожки, с сохранением позиции; эмит `loaderror` с `{ url, error }`.
2. Повтор `reload` (по умолчанию `{ retries: 0, delay: 2000 }`; если `live` —
   `{ retries: 3, delay: 2000 }`) применяется к последнему URL цепочки перед шагом 3.
3. Цепочка и повторы исчерпаны → `status: 'error'`, `error` в store, событие `error`,
   компонент `error-overlay` показывает локализованный текст по `kind`
   (MediaError code 2 → network, 3 → decode, 4 → unsupported; HTTP 404 недоступен из
   `<video>`, поэтому `not-found` выставляет только hls-провайдер по коду ответа).
   Новый `load` сбрасывает ошибку.
4. Плагины изолированы try/catch (§3.5); исключения в обработчиках EventBus ловятся и
   логируются, остальные подписчики выполняются.
5. Ошибки парсинга (битый VTT, невалидный JSON плейлиста, сетевая ошибка загрузки
   субтитров/миниатюр) → `log.warn` + событие `loaderror`; плеер продолжает работу без
   этой функции.
6. `play()` отклонён браузером (`NotAllowedError`) → статус остаётся `paused`,
   обрабатывает плагин autoplay; иные отказы — `log.warn`.

## 6. UI

### 6.1 Компоненты

```ts
type ComponentFactory<P = Record<string, unknown>> = (ctx: UIContext, props: P & BaseProps) => ComponentInstance;
interface ComponentInstance { el: HTMLElement; slot?: HTMLElement; dispose?(): void }
interface UIContext {
  store: Store<PlayerState>; events: EventBus; commands: CommandRegistry; options: PlayerOptions;
  container: HTMLElement; log: Logger;
  t(key: string): string; icon(name: IconName): string;
  menus: MenuHost;
  build(node: LayoutNode): ComponentInstance;            // для контейнеров
  run(action: string): void;                             // исполнить action-строку
  select: Store<PlayerState>['select'];                  // авто-отписка при dispose
  on: EventBus['on'];                                    // авто-отписка при dispose
  listen(target: EventTarget, type: string, fn: EventListener): void; // авто-отписка
}
```

Компонент — функция. Каждый получает свой `UIContext`, в котором `select/on/listen`
запоминают отписки; LayoutEngine вызывает их при dispose вместе с `dispose()` компонента.
Действия идут через `ctx.commands.run(name, args, { source: 'user' })`.

### 6.2 Layout и общие props

```ts
interface LayoutNode extends BaseProps {
  type: string;              // ключ ComponentRegistry
  children?: LayoutNode[];   // для контейнеров: root, toolbar, group, overlay
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

LayoutEngine: `build(node)` → ищет фабрику в реестре (неизвестный тип → warn и пустой
`<div>`, если не `optional`; при `optional` — ничего) → вызывает её → применяет BaseProps
к `el` → рекурсивно строит `children` в `slot ?? el` → подключает hide-правила.
`action` вешается как capture-обработчик `click` на `el`, вызывающий
`stopPropagation` и `ctx.run(action)`.
Команда `layout(node)` — dispose текущего дерева + build нового (смена UI на лету).

### 6.3 Hide-правила

`HideRuleSpec = string | Record<string, number | string>`.
`HideRuleFactory = (arg: unknown) => { deps: (s: PlayerState) => unknown[]; test: (s: PlayerState) => boolean }`.

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
| `{ command: 'name' }` | `!commands.has(name)` (вычисляется при build) |

Плагины регистрируют свои (playlist: `last-item`, `first-item`, `no-playlist`; settings:
`no-menus`). Неизвестное правило → warn, считается ложным. Скрытие — класс `vp-hidden`
(`opacity:0; visibility:hidden; pointer-events:none` с transition).

`userActive`: `pointermove/pointerdown/keydown/focusin` внутри контейнера → true и перезапуск
таймера `idleTimeout`; по таймеру → false; `pointerleave` (мышь) → false; пока открыто меню
или идёт drag слайдера → таймер не запускается. Смена видимости toolbar → событие `ui`.

### 6.4 Action-строки

`parseAction(str): Action[]` — чистая функция. Синтаксис PlayerJS:

- `api:cmd,arg1,arg2;cmd2` → `{ type: 'api', name, args }[]` → исполняется через
  compat-маппинг `api()` (§8.2), то есть понимает PlayerJS-имена (`seek,-10`, `toggle`).
  Числовые строки аргументов приводятся к числам, кроме начинающихся с `+`/`-` для
  относительных `seek`/`volume`.
- `js:Fn,arg,{time}` → `window[Fn](...args)`; `Fn` — только идентификатор или
  `a.b.c`-путь от `window`, без eval. Не найдено → warn.
- `event:name` → `container.dispatchEvent(new CustomEvent(name, { detail: state }))`.
- `settings` / `settings:speed,quality` → `menus.open({ only: [...] })`.
- `http(s)://…` или `//…` → `window.open(url, '_blank', 'noopener')`.
- Плейсхолдеры `{time}`, `{duration}`, `{title}`, `{file}` подставляются при исполнении.

Исполнитель action-строк живёт в UI (`ui/actions.ts`) и получает функцию `api` от
compat-маппинга через инъекцию: `compat/api-map.ts` — чистый модуль без DOM, который
импортируют и `ui`, и класс `Playerjs`. Так `ui` не зависит от класса `Playerjs`.

### 6.5 Встроенные компоненты

| Тип | Поведение |
|---|---|
| `root`, `overlay`, `toolbar`, `group` (`direction: row/column`), `spacer` | контейнеры/раскладка |
| `media-click-layer` | клик → `toggle`, dblclick → `toggleFullscreen`; первый тап на тач-устройстве при скрытых контролах только показывает их |
| `play` | play/pause, иконка по статусу (`ended` → replay) |
| `big-play` | крупная кнопка в центре |
| `timeline` | прогресс, буфер; hover → `ui:timeline-hover {time, x, width}` / `ui:timeline-leave`; pointer drag → seek на отпускании (позиция показывается во время drag); клавиши ←/→ при фокусе; событие `line`; скрыт при `live` |
| `mute`, `volume` | кнопка звука (3 иконки по уровню), слайдер 0..1; колесо над `volume`/`mute` → ±0.05 |
| `time`, `duration` | `m:ss` / `h:mm:ss` (формат по duration) |
| `title` | `state.title` |
| `buffering` | спиннер |
| `fullscreen` | вход/выход |
| `settings` | кнопка, открывает `MenuHost` |
| `live` | бейдж `● LIVE` |
| `prev`, `next` | команды `prev`/`next` (регистрирует playlist) |
| `playlist-button` | команда `togglePlaylist` (регистрирует playlist) |
| `error-overlay` | текст ошибки по `kind` + кнопка «Повторить» (`load` текущего источника) |
| `text` | произвольный текст с плейсхолдерами `{time}`, `{duration}`, `{title}` |

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
  readonly isOpen: boolean;
  hasVisible(s: PlayerState): boolean;
}
```

`MenuHost` рендерит панель над toolbar: главный список видимых меню с текущим значением
справа → подменю с отметкой текущего пункта и кнопкой «назад». Если видимо одно меню
из `only` — сразу открывается подменю. Закрытие: клик вне, Escape, выбор пункта.
Навигация ↑/↓/Enter/←(назад). Кнопка `settings` скрыта правилом `no-menus`.

### 6.7 Default layout

```
root
├─ media-click-layer
├─ (слои плагинов 'below-ui', напр. субтитры)
├─ overlay
│  ├─ title            anchor top-left, hide [idle, not-started]
│  ├─ buffering        anchor center, hide [not-waiting]
│  ├─ big-play         anchor center, hide [started]
│  └─ error-overlay    anchor center, hide [not-error]
└─ toolbar             hide [idle, not-started]
   ├─ timeline
   └─ group row
      ├─ prev(optional, hide first-item)  play  next(optional, hide last-item)
      ├─ mute  volume(hide {maxWidth: 400})
      ├─ time  text("/")  duration  live(hide not-live)
      ├─ spacer
      └─ settings(hide no-menus)  playlist-button(optional, hide no-playlist)  fullscreen
```

`defaultLayout` экспортируется как константа-объект, пользователь может взять её,
изменить и передать в `layout`.

### 6.8 Тема и иконки

`theme/player.css` с custom properties на `.vp-root`:

`--vp-color-1` (акцент: прогресс, активные пункты), `--vp-color-2` (иконки/текст),
`--vp-color-3` (фон меню), `--vp-toolbar-bg` (градиент), `--vp-font`, `--vp-font-size`,
`--vp-radius`, `--vp-icon-size`, `--vp-timeline-height`, `--vp-sub-color`, `--vp-sub-bg`,
`--vp-sub-size`. Опция `theme` (`{ color1: '#f00' }` → `--vp-color-1`) выставляет их
inline на `.vp-root`. CSS инжектируется в `<head>` при первом `createPlayer` одной
`<style id="vp-styles">` (строка импортируется через `?inline` Vite).
Размер: `aspect-ratio` из `ratio`; `ratio: 'auto'` — по `videoWidth/videoHeight` после
`loadedmetadata`.

Иконки — inline SVG-строки в `ui/icons.ts` (`play, pause, replay, volume-high, volume-low,
volume-mute, fullscreen, fullscreen-exit, settings, playlist, prev, next, check, back`),
переопределяются опцией `icons`. i18n — словарь ru по умолчанию (`ui/i18n.ts`) + `en`,
выбор опцией `lang`, переопределение ключей опцией `i18n`.

## 7. Плагины v1

Каждый плагин — отдельный файл, экспорт фабрики `xxxPlugin(opts?) : Plugin`.
`defaultPlugins()` возвращает все ниже в указанном порядке.

| Плагин | Делает | Опции (compat-имена в скобках) |
|---|---|---|
| `quality` | меню «Качество» (видимо при ≥2 качествах); команда `setQuality`; выбор начального качества; событие `quality` | `defaultQuality` (`default_quality`), `forbiddenQuality` (`forbidden_quality`), `qualities` |
| `speed` | меню «Скорость»; событие `speed` | `speeds` (по умолч. `[0.5,0.75,1,1.25,1.5,2]`), `defaultSpeed` (`default_speed`) |
| `audiotracks` | меню «Аудио» (видимо при ≥2 дорожках); команда `setAudioTrack`; событие `audiotrack` | `defaultAudio` (`default_audio`), `renameAudio` (`rename_audio`, по метке или индексу) |
| `subtitles` | загрузка (fetch) и парсинг VTT/SRT; слой рендера `'below-ui'` (не `<track>`), поднимается выше при видимом toolbar; меню «Субтитры» с «Выкл»; команды `setTextTrack(i)`, `toggleSubtitles`, `addSubtitle(label, url)`; событие `subtitle`. Источники: `MediaSource.subtitles` + опция `subtitle` (`[En]url,[Ru]url`) | `subtitle`, `defaultSubtitle` (`default_subtitle`), `subtitleStart` (`subtitle_start`, false → выкл. по умолч.), `subshift` (десятые доли с), `?shift=N` в URL |
| `thumbnails` | загрузка и парсинг VTT со спрайтами `url#xywh=x,y,w,h` (или отдельные картинки, относительные URL — от URL VTT); превью над timeline по `ui:timeline-hover` с временем под картинкой; без VTT — только время | `thumbnails` (URL), команда `setThumbnails(url)` |
| `playlist` | вход: JSON-массив или URL (.txt/.json, fetch); вложенные `folder` (раскрывающиеся группы); панель списка (overlay справа, `togglePlaylist`); команды `next`, `prev`, `playItem(id\|index)`, `push(items)`, `setPlaylist(items)`; autonext, playlistLoop; hide-правила; события `playlist`, `next`, `previous`; поля элемента `title, file, poster, subtitle, thumbnails, id, folder, start`; state `playlist: { items, flat, index }` | `autonext` (true), `playlistLoop` (false), `plstart` (id), `hidePlaylist` (панель скрыта по умолч.) |
| `hotkeys` | Space toggle, Enter toggle (выкл.), F fullscreen, M mute, ←/→ seek ±`seekStep`, ↑/↓ volume ±`volumeStep`, 0–9 → N×10 %; колесо над видео в fullscreen → громкость. Слушает `keydown` на контейнере (при фокусе внутри) и, если `global`, на `document` при наведении на плеер. Игнорирует события из `input/textarea/[contenteditable]` и с модификаторами Ctrl/Meta/Alt | `hotkeys: { seekStep: 5, volumeStep: 0.1, enter: false, numbers: true, wheel: true, global: false }` или `false` |
| `memory` | localStorage: позиция по ключу `vp:t:${cuid ?? location.pathname + '#' + containerId + '#' + url}`, сохранение раз в 5 с и на pause; восстановление на `loadedmetadata`, если 5 с < t < duration − 10 с и не `live`; очистка на `end`. Глобальные ключи `vp:volume`, `vp:muted`, `vp:quality` (метка), `vp:speed`, `vp:subtitle` (метка или `off`), `vp:audio` (метка). Исключения localStorage глушатся | `memory: { position, volume, quality, speed, subtitle, audio }` (все true) или `false`; `cuid` |
| `autoplay` | при `autoplay` после `load` вызывает `play()`; `NotAllowedError` → `muted = true`, повтор; при muted-autoplay первый пользовательский клик по `media-click-layer` снимает mute без паузы (через `before('toggle')`) | `autoplay`, `autoplayMuteFallback` (true) |
| `mediasession` | `navigator.mediaSession.metadata` (title, artwork = poster) и обработчики play/pause/seekto/seekbackward/seekforward/previoustrack/nexttrack (последние — если команды есть); нет API → no-op | `mediasession` (true) |

Порядок плагинов важен для начальных значений: `memory` идёт после `quality`, `speed`,
`subtitles`, `audiotracks` и через свой `before('load')`-хук перезаписывает их выбор
сохранёнными значениями (сохранённое > `default_*`).

## 8. Compat-слой PlayerJS

### 8.1 Конструктор

```ts
class Playerjs {
  constructor(opts: PlayerjsOptions);   // { id, file, poster, title, autoplay: 1, … }
  api(cmd: string, arg?: unknown): unknown;
  readonly player: Player;              // типизированный плеер под капотом
}
```

`compat/options.ts` переводит snake_case и `0|1` в `PlayerOptions` (таблица маппинга —
единственное место знаний об именах PlayerJS-опций): `id → container`, `file → source`,
`default_quality → defaultQuality`, `forbidden_quality`, `default_audio`, `rename_audio`,
`default_speed`, `default_subtitle`, `subtitle`, `subtitle_start`, `subshift`, `thumbnails`,
`autoplay`, `loop`, `autonext`, `playlistloop`, `plstart`, `hideplaylist`, `cuid`, `start`,
`end`, `volume`, `ratio`, `hls` (→ `forceType`), `hlsconfig`, `log`, `postmessage`,
`color1..3` (→ `theme`). Неизвестные опции → `log.warn`.
Подключает `defaultPlugins()` и `defaultLayout`. `nocontrols:1` → layout только из
`media-click-layer`. `ready:"fnName"` → `window[fnName](id)` после `init`.

UMD-сборка выставляет `window.Playerjs` и `window.VP` (всё из `index.ts`) и после загрузки
вызывает `window.PlayerjsAsync?.()`.

### 8.2 `api(cmd, arg)`

`compat/api-map.ts`: `createApi(player): (cmd: string, arg?: unknown) => unknown` — чистая
таблица `cmd → (player, arg) => result`. Без аргумента — геттер, с аргументом —
сеттер/действие. Поддерживаются:

`play` (без арг. / URL / `id:x`), `pause`, `toggle`, `stop`, `seek` (число, `"+10"`),
`time`, `duration`, `buffered`, `playing`, `started`, `live`, `volume` (0..1, `"+0.1"`),
`mute`, `unmute`, `muted`, `fullscreen`, `exitfullscreen`, `isfullscreen`, `quality`
(индекс), `qualities`, `speed` (индекс в списке скоростей), `audiotrack` (индекс/метка),
`audiotracks`, `subtitle` (`[T]url` / индекс / -1), `subtitles`, `+subtitle`, `togglesubs`,
`file` (загрузить без play), `preload`, `playlist` (массив/URL), `next`, `prev`, `find`,
`push`, `autonext`, `playlistloop`, `loop`, `title`, `poster`, `thumbnails`,
`toolbar` (`"on"` → `setControlsLocked(true)`, `"off"` → false), `menu`, `cuid`, `id`,
`destroy`.

Списки — массив меток; геттеры `quality`/`audiotrack`/`subtitle` — метка. Команда,
зависящая от неподключённого плагина, или неизвестная → `log.warn`, `undefined`.

### 8.3 События

Мост подписывается на все события EventBus и для каждого вызывает
`window.PlayerjsEvents?.(event, id, data)` и
`container.dispatchEvent(new CustomEvent(event, { detail: data }))`.

### 8.4 postMessage (опция `postmessage: 1`)

Входящие `message` с `data = { api, set }` (проверка `event.source === window.parent` и,
если задан `postmessageOrigin`, `event.origin`) → `api(api, set)`; ответ геттера —
`event.source.postMessage({ event: api, answer }, event.origin)`. Исходящие события —
`window.parent.postMessage({ event, id, data }, postmessageOrigin ?? '*')`, только если
`window.parent !== window`.

## 9. Вне scope v1 (будущие плагины)

VAST/реклама (через `before('play')` и слой overlay), DASH, YouTube/Vimeo-провайдеры,
Chromecast/AirPlay, PiP-кнопка, 360°, DVR, эффекты, квиз, водяные знаки, пароль/домены,
share/download, контекстное меню, ASS/SSA, субтитры из HLS-манифеста, параллельные
субтитры, переключение дизайнов, markup/points на timeline, skip-кнопка, sleep timer,
групповые разделители `<<<` в меню качества.

## 10. Тестирование

- Vitest + jsdom. TDD для чистых модулей: `source/parse`, VTT/SRT-парсеры, thumbnails-VTT,
  `parseAction`, `Store`, `EventBus`, `CommandRegistry`, `PluginHost`, hide-правила,
  `memory` (ключи, пороги, мок localStorage), `compat/options`, `compat/api-map`.
- Интеграционные: `createPlayer` с `FakeProvider` + `FakeMedia` (хелпер, переопределяющий
  на реальном jsdom `HTMLVideoElement` `play/pause/load`, `currentTime`, `duration`,
  `paused`, `buffered` и диспатчащий медиа-события) — команда → store → DOM компонентов;
  fallback по `or`; переключение качества с сохранением позиции; плейлист autonext;
  hide-правила по state; меню открывается и меняет качество; destroy снимает всё.
- Ручная проверка в браузере (Playwright) на `demo/index.html`: mp4 с несколькими
  качествами, HLS-поток (публичный тестовый `https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8`),
  субтитры VTT+SRT, миниатюры-спрайт, плейлист с папками, compat-пример `new Playerjs`.
  Локальные ассеты генерирует `demo/scripts/make-assets.sh` через ffmpeg (короткие тестовые
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
