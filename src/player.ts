import type {
  CommandContext,
  ComponentFactory,
  HideRuleFactory,
  LayoutNode,
  MediaProvider,
  Player,
  PlayerOptions,
  PluginContext,
  SourceTransform,
  ThemeVars,
} from './types.js';
import css from './theme/player.css?inline';
import { createLogger } from './core/logger.js';
import { createStore } from './core/store.js';
import { createEventBus } from './core/events.js';
import { createCommandRegistry } from './core/commands.js';
import { createPluginHost } from './core/plugin-host.js';
import { createInitialState } from './core/initial-state.js';
import { createMediaController } from './core/media-controller.js';
import { html5Provider } from './providers/html5.js';
import { hlsProvider } from './providers/hls.js';
import { createApi } from './api/api-map.js';
import { h } from './ui/dom.js';
import { createRegistry } from './ui/registry.js';
import { registerBuiltinHideRules } from './ui/hide-rules.js';
import { createTranslator } from './ui/i18n.js';
import { createIconSet } from './ui/icons.js';
import { createMenuHost } from './ui/menu-host.js';
import { createActionRunner } from './ui/actions.js';
import { createLayoutEngine, type Mounted } from './ui/layout.js';
import { controlsVisible, createUserActivity } from './ui/activity.js';
import { defaultLayout } from './ui/default-layout.js';
import { registerBuiltinComponents } from './components/index.js';

const API: CommandContext = { source: 'api' };
let counter = 0;
/** Live players by container, so reusing a container replaces the previous player. */
const livePlayers = new WeakMap<HTMLElement, Player>();

function resolveContainer(container: HTMLElement | string): HTMLElement {
  const el = typeof container === 'string' ? document.getElementById(container) : container;
  if (!el) throw new Error(`[vp] container "${String(container)}" not found`);
  return el;
}

function injectStyles(): void {
  if (document.getElementById('vp-styles')) return;
  const style = document.createElement('style');
  style.id = 'vp-styles';
  style.textContent = css;
  document.head.append(style);
}

function parseRatio(ratio: string | undefined): string | null {
  const match = (ratio ?? '16:9').match(/^\s*(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)\s*$/);
  return match ? `${match[1]} / ${match[2]}` : null;
}

function applyTheme(root: HTMLElement, theme: Partial<ThemeVars> = {}): void {
  for (const [key, value] of Object.entries(theme)) {
    if (value === undefined) continue;
    const name = key.replace(/([A-Z])/g, '-$1').replace(/(\d+)/g, '-$1').toLowerCase();
    root.style.setProperty(`--vp-${name}`, value);
  }
}

/** Composition root without default plugins: `options.plugins` defaults to `[]` (tree-shakable). */
export function createPlayerCore(options: PlayerOptions): Player {
  // 1. DOM skeleton
  const container = resolveContainer(options.container);
  if (!container.id) container.id = `vp${++counter}`;
  const id = container.id;
  const log = createLogger(!!options.log);
  const previous = livePlayers.get(container);
  if (previous) {
    log.warn(`container "${id}" already hosts a player; destroying the previous one`);
    previous.destroy();
  }
  injectStyles();

  const video = h('video', { playsinline: true, 'webkit-playsinline': true, preload: 'metadata' });
  const layerBelow = h('div', { class: 'vp-layer-below' });
  const layoutLayer = h('div', { class: 'vp-layout' });
  const layerAbove = h('div', { class: 'vp-layer-above' });
  const root = h('div', { class: 'vp-root', tabindex: 0 }, h('div', { class: 'vp-media' }, video), h('div', { class: 'vp-ui' }, layerBelow, layoutLayer, layerAbove));
  const ratio = options.ratio === 'auto' ? parseRatio('16:9') : parseRatio(options.ratio);
  if (ratio) root.style.aspectRatio = ratio;
  applyTheme(root, options.theme);
  container.replaceChildren(root);

  // 2–3. Core, media, UI registries
  const store = createStore(createInitialState(options), log);
  const events = createEventBus(log);
  const commands = createCommandRegistry(log);
  const providers: MediaProvider[] = [html5Provider(), hlsProvider()];
  const transforms: SourceTransform[] = [];
  const controller = createMediaController({ video, root, store, events, commands, log, options, providers, transforms });

  const components = createRegistry<ComponentFactory<any>>('component', log);
  registerBuiltinComponents(components);
  const hideRules = createRegistry<HideRuleFactory>('hide rule', log);
  registerBuiltinHideRules(hideRules);
  const t = createTranslator(options.lang ?? 'ru', options.i18n);
  const icon = createIconSet(options.icons);
  const menus = createMenuHost({ layer: layerAbove, store, events, t, icon, log });
  const activity = createUserActivity({ root, store, events, timeout: options.idleTimeout ?? 3000 });

  let destroyed = false;
  let destroying = false;
  const alive = () => {
    if (destroyed) log.warn('player is destroyed');
    return !destroyed;
  };

  // 4. Player facade
  const player: Player = {
    id,
    container,
    root,
    video,
    get state() {
      return store.get();
    },
    play: () => (alive() ? (commands.run('play', [], API) ?? Promise.resolve()) : Promise.resolve()),
    pause: () => {
      if (alive()) commands.run('pause', [], API);
    },
    seek: (time) => {
      if (alive()) commands.run('seek', [time], API);
    },
    load: (source) => {
      if (alive()) commands.run('load', [source], API);
    },
    on: events.on,
    once: events.once,
    off: events.off,
    select: store.select,
    command: (name, ...args) => (alive() ? commands.run(name, args, API) : undefined),
    api: (cmd, arg) => (alive() ? api(cmd, arg) : undefined),
    destroy,
  };
  const api = createApi({ player, store, commands, events, options, log });
  const run = createActionRunner({ player, store, menus, log });
  const engine = createLayoutEngine({ components, hideRules, playerId: id, log, base: { player, store, events, commands, options, root, log, t, icon, menus, run } });

  // 5. Plugin context
  const layers = new Set<Mounted>();
  const pluginContext: PluginContext = {
    player,
    store,
    events,
    commands,
    options,
    video,
    root,
    log,
    t,
    registerProvider: (p) => void providers.push(p),
    addSourceTransform(fn) {
      transforms.push(fn);
      return () => {
        const i = transforms.indexOf(fn);
        if (i >= 0) transforms.splice(i, 1);
      };
    },
    registerComponent: (type, factory) => components.register(type, factory),
    registerMenu: (menu) => menus.register(menu),
    registerHideRule: (name, rule) => hideRules.register(name, rule),
    addLayer(node, position) {
      if (destroyed) {
        log.warn('player is destroyed');
        return () => {};
      }
      const mounted = engine.build(node, position === 'below-ui' ? layerBelow : layerAbove);
      if (!mounted) return () => {};
      layers.add(mounted);
      return () => {
        layers.delete(mounted);
        mounted.dispose();
      };
    },
  };

  const offs: Array<() => void> = [
    commands.register('showControls', () => activity.poke()),
    commands.register('toggleMenu', () => menus.toggle()),
    commands.register('destroy', () => destroy()),
    store.select((s) => !controlsVisible(s), (idle) => root.classList.toggle('vp-idle', idle)),
  ];

  // 6. Plugins
  const pluginHost = createPluginHost(log);
  pluginHost.setupAll(options.plugins ?? [], pluginContext);

  // 7. Layout
  let layout: Mounted | null = null;
  const buildLayout = (node: LayoutNode | false) => {
    layout?.dispose();
    layout = node === false ? null : engine.build(node, layoutLayer);
  };
  offs.push(commands.register('layout', ([node]) => buildLayout(node)));
  buildLayout(options.layout === undefined ? defaultLayout : options.layout);

  // Size tracking and ratio:auto
  const measure = () => {
    const width = Math.round(root.clientWidth);
    const height = Math.round(root.clientHeight);
    if (width === store.get().width && height === store.get().height) return;
    store.set({ width, height });
    events.emit('resize', { width, height });
  };
  const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
  resizeObserver?.observe(root);
  // Initial size without a `resize` event (that would precede `init`); later changes come from the observer.
  store.set({ width: Math.round(root.clientWidth), height: Math.round(root.clientHeight) });
  const onMetadata = () => {
    if (video.videoWidth > 0 && video.videoHeight > 0) root.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
  };
  if (options.ratio === 'auto') video.addEventListener('loadedmetadata', onMetadata);

  // 8–9. Init, then load
  livePlayers.set(container, player);
  events.emit('init');
  if (options.source !== undefined) player.load(options.source);
  return player;

  function destroy(): void {
    if (destroying || destroyed) return;
    destroying = true;
    events.emit('destroy');
    destroyed = true;
    if (livePlayers.get(container) === player) livePlayers.delete(container);
    layout?.dispose();
    for (const mounted of [...layers].reverse()) mounted.dispose();
    layers.clear();
    menus.dispose();
    activity.dispose();
    pluginHost.disposeAll();
    offs.forEach((off) => off());
    controller.destroy();
    resizeObserver?.disconnect();
    video.removeEventListener('loadedmetadata', onMetadata);
    // Stop media even if a third-party provider's detach() left it attached.
    video.pause();
    video.removeAttribute('src');
    try {
      video.load();
    } catch {
      /* jsdom: not implemented */
    }
    root.remove();
  }
}
