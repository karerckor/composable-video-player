import type { ComponentFactory } from '../types.js';
import type { Registry } from '../ui/registry.js';
import { groupComponent, overlayComponent, rootComponent, spacerComponent, textComponent, toolbarComponent } from './containers.js';
import { bigPlayComponent, fullscreenComponent, muteComponent, playComponent, settingsComponent } from './buttons.js';
import { bufferingComponent, durationComponent, errorOverlayComponent, liveComponent, mediaClickLayerComponent, timeComponent, titleComponent } from './indicators.js';
import { volumeComponent } from './volume.js';
import { timelineComponent } from './timeline.js';

export const BUILTIN_COMPONENTS: Record<string, ComponentFactory<any>> = {
  root: rootComponent,
  overlay: overlayComponent,
  toolbar: toolbarComponent,
  group: groupComponent,
  spacer: spacerComponent,
  text: textComponent,
  'media-click-layer': mediaClickLayerComponent,
  play: playComponent,
  'big-play': bigPlayComponent,
  mute: muteComponent,
  volume: volumeComponent,
  timeline: timelineComponent,
  time: timeComponent,
  duration: durationComponent,
  title: titleComponent,
  buffering: bufferingComponent,
  live: liveComponent,
  fullscreen: fullscreenComponent,
  settings: settingsComponent,
  'error-overlay': errorOverlayComponent,
};

export function registerBuiltinComponents(registry: Registry<ComponentFactory<any>>): void {
  for (const [type, factory] of Object.entries(BUILTIN_COMPONENTS)) registry.register(type, factory);
}

export * from './containers.js';
export * from './buttons.js';
export * from './indicators.js';
export * from './volume.js';
export * from './timeline.js';
