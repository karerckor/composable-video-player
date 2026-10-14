import { vi } from 'vitest';
import { createStore } from '../../src/core/store.js';
import { createEventBus } from '../../src/core/events.js';
import { createCommandRegistry } from '../../src/core/commands.js';
import { createLogger } from '../../src/core/logger.js';
import { createInitialState } from '../../src/core/initial-state.js';
import { createRegistry } from '../../src/ui/registry.js';
import { registerBuiltinHideRules } from '../../src/ui/hide-rules.js';
import { createTranslator } from '../../src/ui/i18n.js';
import { createIconSet } from '../../src/ui/icons.js';
import { createMenuHost } from '../../src/ui/menu-host.js';
import { createActionRunner } from '../../src/ui/actions.js';
import { createLayoutEngine } from '../../src/ui/layout.js';
import type { ComponentFactory, HideRuleFactory, Player, PlayerOptions, PlayerState } from '../../src/types.js';

export function createUIHarness(opts: { state?: Partial<PlayerState>; options?: Partial<PlayerOptions> } = {}) {
  document.body.replaceChildren();
  const log = createLogger(false);
  const options: PlayerOptions = { container: 'p', ...opts.options };
  const store = createStore<PlayerState>({ ...createInitialState(options), ...opts.state });
  const events = createEventBus(log);
  const commands = createCommandRegistry(log);
  const root = document.createElement('div');
  const layerAbove = document.createElement('div');
  root.append(layerAbove);
  document.body.append(root);
  const components = createRegistry<ComponentFactory<any>>('component', log);
  const hideRules = createRegistry<HideRuleFactory>('hide rule', log);
  registerBuiltinHideRules(hideRules);
  const t = createTranslator('ru');
  const icon = createIconSet();
  const menus = createMenuHost({ layer: layerAbove, store, events, t, icon, log });
  const api = vi.fn();
  const player = {
    id: 'p',
    container: root,
    root,
    video: document.createElement('video'),
    api,
    get state() {
      return store.get();
    },
  } as unknown as Player;
  const run = createActionRunner({ player, store, menus, log });
  const engine = createLayoutEngine({
    components,
    hideRules,
    playerId: 'p',
    log,
    base: { player, store, events, commands, options, root, log, t, icon, menus, run },
  });
  return { log, options, store, events, commands, root, layerAbove, components, hideRules, menus, player, api, engine, t, icon };
}
