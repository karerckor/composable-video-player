import type { CommandRegistry, EventBus, Logger, MediaProvider, PlayerOptions, PlayerState, SourceTransform, Store } from '../types.js';

export interface MediaDeps {
  video: HTMLVideoElement;
  root: HTMLElement;
  store: Store<PlayerState>;
  events: EventBus;
  commands: CommandRegistry;
  log: Logger;
  options: PlayerOptions;
  /** Mutable registry; plugins may push more providers. */
  providers: MediaProvider[];
  /** Mutable list; plugins add transforms through PluginContext.addSourceTransform. */
  transforms: SourceTransform[];
  random?: () => number;
}
