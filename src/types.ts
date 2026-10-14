// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export type Status = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'ended' | 'error';
export type ErrorKind = 'network' | 'decode' | 'not-found' | 'unsupported' | 'unknown';

export interface PlayerError {
  kind: ErrorKind;
  message: string;
}

export interface Quality {
  label: string;
  height?: number;
  bitrate?: number;
}

export interface TrackInfo {
  label: string;
  lang?: string;
}

export interface PlayerState {
  status: Status;
  /** First `playing` happened since the last load. */
  started: boolean;
  currentTime: number;
  duration: number;
  /** End of the buffered range that contains currentTime, seconds. */
  buffered: number;
  live: boolean;
  waiting: boolean;
  volume: number;
  muted: boolean;
  rate: number;
  fullscreen: boolean;
  userActive: boolean;
  controlsLocked: boolean;
  width: number;
  height: number;
  url: string;
  /** Index into `qualities`. HLS "Auto" is a regular list item owned by the provider. */
  qualities: Quality[];
  quality: number;
  audioTracks: TrackInfo[];
  audioTrack: number;
  textTracks: TrackInfo[];
  /** -1 = subtitles off. */
  textTrack: number;
  /** Label or 'off'; written by memory, read by subtitles. */
  preferredSubtitle: string | null;
  title: string;
  poster: string;
  loop: boolean;
  error: PlayerError | null;
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

export interface SubtitleRef {
  label: string;
  url: string;
}

export interface SourceTrack {
  label: string;
  /** Fallback chain (`or`). */
  urls: string[];
}

export interface SourceQuality {
  label: string;
  tracks: SourceTrack[];
}

export interface SourceSpec {
  qualities: SourceQuality[];
  subtitles: SubtitleRef[];
  start?: number;
  forceType?: 'hls';
}

export type SourceSpecInput = Partial<SourceSpec> & Pick<SourceSpec, 'qualities'>;
export type SourceInput = string | SourceSpecInput;

export interface Selection {
  quality: number;
  audio: number;
  start: number;
}

export type SourceTransform = (spec: SourceSpec, sel: Selection) => Selection;

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export interface PlayerEvents {
  init: void;
  start: void;
  new: { spec: SourceSpec; selection: Selection };
  metadata: { duration: number };
  play: void;
  userplay: void;
  pause: void;
  userpause: void;
  stop: void;
  end: void;
  finish: void;
  time: number;
  quartile: 25 | 50 | 75 | 100;
  duration: number;
  seek: number;
  userseek: number;
  mute: void;
  unmute: void;
  volume: number;
  quality: string;
  audiotrack: string;
  subtitle: string;
  speed: number;
  fullscreen: void;
  exitfullscreen: void;
  resize: { width: number; height: number };
  ui: 0 | 1;
  buffering: void;
  buffered: void;
  loaderror: { url: string; error: PlayerError };
  error: PlayerError;
  playlist: unknown;
  next: void;
  previous: void;
  line: number;
  destroy: void;
  /** x: px from the timeline's left edge; rootX: px from the player root's left edge. */
  'ui:timeline-hover': { time: number; x: number; rootX: number; width: number };
  'ui:timeline-leave': void;
  'ui:menu': { open: boolean };
  /** A slider/timeline drag started or ended (keeps controls visible). */
  'ui:drag': { active: boolean };
}

export type EventName = keyof PlayerEvents;
export type EventArgs<K extends EventName> = PlayerEvents[K] extends void ? [] : [PlayerEvents[K]];
export type EventHandler<K extends EventName> = (data: PlayerEvents[K]) => void;

export interface EventBus {
  on<K extends EventName>(name: K, cb: EventHandler<K>): () => void;
  once<K extends EventName>(name: K, cb: EventHandler<K>): () => void;
  off<K extends EventName>(name: K, cb: EventHandler<K>): void;
  emit<K extends EventName>(name: K, ...args: EventArgs<K>): void;
  onAny(cb: (name: EventName, data: unknown) => void): () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export interface SelectOptions<T> {
  immediate?: boolean;
  equals?: (a: T, b: T) => boolean;
}

export interface Store<S> {
  get(): Readonly<S>;
  set(patch: Partial<S>): void;
  select<T>(selector: (s: S) => T, cb: (value: T, prev: T) => void, opts?: SelectOptions<T>): () => void;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export interface PlayerCommands {
  load(input: SourceInput): void;
  reload(): void;
  play(): Promise<void>;
  pause(): void;
  toggle(): void;
  stop(): void;
  seek(t: number | string): void;
  setVolume(v: number | string): void;
  mute(): void;
  unmute(): void;
  toggleMute(): void;
  setRate(r: number): void;
  setLoop(b: boolean): void;
  setTitle(s: string): void;
  setPoster(url: string): void;
  fullscreen(): void;
  exitFullscreen(): void;
  toggleFullscreen(): void;
  setQuality(i: number): void;
  setAudioTrack(i: number): void;
  setControlsLocked(b: boolean): void;
  showControls(): void;
  toggleMenu(): void;
  layout(node: LayoutNode): void;
  destroy(): void;
}

export type CommandName = keyof PlayerCommands;
export type CommandArgs<K extends CommandName> = Parameters<PlayerCommands[K]>;
export type CommandResult<K extends CommandName> = ReturnType<PlayerCommands[K]>;

export interface CommandContext {
  source: 'api' | 'user' | 'internal';
}

export type CommandHandler<K extends CommandName> = (args: CommandArgs<K>, ctx: CommandContext) => CommandResult<K>;
export type BeforeHook<K extends CommandName> = (args: CommandArgs<K>, ctx: CommandContext) => false | void | CommandArgs<K>;

export interface CommandRegistry {
  register<K extends CommandName>(name: K, handler: CommandHandler<K>): () => void;
  before<K extends CommandName>(name: K, hook: BeforeHook<K>): () => void;
  run<K extends CommandName>(name: K, args: CommandArgs<K>, ctx?: CommandContext): CommandResult<K> | undefined;
  has(name: string): boolean;
}

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

export interface Logger {
  debug(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

export interface ProviderContext {
  setQualities(qualities: Quality[], current: number): void;
  setAudioTracks(tracks: TrackInfo[], current: number): void;
  error(err: PlayerError): void;
  log: Logger;
  options: PlayerOptions;
}

export interface MediaProvider {
  name: string;
  canPlay(url: string, spec: SourceSpec): 0 | 1 | 2;
  attach(video: HTMLVideoElement, ctx: ProviderContext): void;
  /** Resolves when metadata is available and startTime applied; rejects with PlayerError. */
  load(url: string, startTime: number): Promise<void>;
  detach(): void;
  /** Index into the list the provider passed to setQualities. */
  setQuality?(index: number): void;
  setAudioTrack?(index: number): void;
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

export type Anchor = 'top-left' | 'top' | 'top-right' | 'left' | 'center' | 'right' | 'bottom-left' | 'bottom' | 'bottom-right';

export type HideRuleSpec = string | Record<string, number | string>;

export interface BaseProps {
  id?: string;
  hint?: string;
  scale?: number;
  margin?: string;
  opacity?: number;
  bg?: string;
  color?: string;
  flex?: number;
  anchor?: Anchor;
  hide?: HideRuleSpec[];
  action?: string;
  className?: string;
}

export interface LayoutNode extends BaseProps {
  type: string;
  children?: LayoutNode[];
  optional?: boolean;
  [prop: string]: unknown;
}

export interface ComponentInstance {
  el: HTMLElement;
  slot?: HTMLElement;
  dispose?(): void;
}

export type ComponentFactory<P = Record<string, unknown>> = (ctx: UIContext, props: P & BaseProps) => ComponentInstance;

export type IconName =
  | 'play' | 'pause' | 'replay' | 'volume-high' | 'volume-low' | 'volume-mute'
  | 'fullscreen' | 'fullscreen-exit' | 'settings' | 'playlist' | 'prev' | 'next' | 'check' | 'back';

export interface MenuOption {
  label: string;
  value: unknown;
}

export interface MenuDefinition {
  id: string;
  label: string;
  order?: number;
  visible: (s: PlayerState) => boolean;
  options: (s: PlayerState) => MenuOption[];
  current: (s: PlayerState) => unknown;
  select: (value: unknown) => void;
}

export interface MenuHost {
  register(def: MenuDefinition): () => void;
  open(opts?: { only?: string[]; align?: 'left' | 'center' | 'right' }): void;
  close(): void;
  toggle(): void;
  readonly isOpen: boolean;
  hasVisible(s: PlayerState): boolean;
  dispose(): void;
}

export type HideRuleFactory = (arg: unknown, ctx: UIContext) => { test: (s: PlayerState) => boolean };

export interface UIContext {
  player: Player;
  store: Store<PlayerState>;
  events: EventBus;
  commands: CommandRegistry;
  options: PlayerOptions;
  root: HTMLElement;
  log: Logger;
  t(key: string): string;
  icon(name: IconName): string;
  menus: MenuHost;
  /** Build a child layout node; its disposal is tied to this component. */
  build(node: LayoutNode): ComponentInstance | null;
  run(action: string): void;
  user<K extends CommandName>(name: K, ...args: CommandArgs<K>): void;
  select<T>(selector: (s: PlayerState) => T, cb: (value: T, prev: T) => void, opts?: SelectOptions<T>): () => void;
  on<K extends EventName>(name: K, cb: EventHandler<K>): () => void;
  listen(target: EventTarget, type: string, fn: (e: Event) => void, opts?: AddEventListenerOptions): void;
}

// ---------------------------------------------------------------------------
// Plugins
// ---------------------------------------------------------------------------

export interface PluginContext {
  player: Player;
  store: Store<PlayerState>;
  events: EventBus;
  commands: CommandRegistry;
  options: PlayerOptions;
  video: HTMLVideoElement;
  root: HTMLElement;
  log: Logger;
  /** Translate an i18n key (falls back to the key itself). */
  t(key: string): string;
  registerProvider(p: MediaProvider): void;
  addSourceTransform(fn: SourceTransform): () => void;
  registerComponent(type: string, factory: ComponentFactory<any>): void;
  registerMenu(menu: MenuDefinition): () => void;
  registerHideRule(name: string, rule: HideRuleFactory): void;
  addLayer(node: LayoutNode, position: 'below-ui' | 'above-ui'): () => void;
}

export interface Plugin {
  name: string;
  setup(ctx: PluginContext): void | (() => void);
}

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------

export interface ThemeVars {
  color1: string;
  color2: string;
  color3: string;
  toolbarBg: string;
  font: string;
  fontSize: string;
  radius: string;
  iconSize: string;
  timelineHeight: string;
  subColor: string;
  subBg: string;
  subSize: string;
}

export interface PlayerOptions {
  container: HTMLElement | string;
  source?: SourceInput;
  plugins?: Plugin[];
  layout?: LayoutNode | false;
  poster?: string;
  title?: string;
  autoplay?: boolean;
  muted?: boolean;
  loop?: boolean;
  volume?: number;
  rate?: number;
  start?: number;
  end?: number;
  ratio?: string;
  forceType?: 'hls';
  qualities?: string;
  theme?: Partial<ThemeVars>;
  icons?: Partial<Record<IconName, string>>;
  lang?: 'ru' | 'en';
  i18n?: Partial<Record<string, string>>;
  idleTimeout?: number;
  reload?: { retries: number; delay: number };
  hlsUrl?: string;
  hlsConfig?: Record<string, unknown>;
  log?: boolean;
}

export interface Player {
  readonly id: string;
  readonly state: Readonly<PlayerState>;
  readonly container: HTMLElement;
  readonly root: HTMLElement;
  readonly video: HTMLVideoElement;
  play(): Promise<void>;
  pause(): void;
  seek(t: number | string): void;
  load(source: SourceInput): void;
  on: EventBus['on'];
  once: EventBus['once'];
  off: EventBus['off'];
  select: Store<PlayerState>['select'];
  command<K extends CommandName>(name: K, ...args: CommandArgs<K>): CommandResult<K> | undefined;
  api(cmd: string, arg?: unknown): unknown;
  destroy(): void;
}
