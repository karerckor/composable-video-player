import type { ComponentFactory } from '../types';
import type { Registry } from '../ui/registry';
import { groupComponent, overlayComponent, rootComponent, spacerComponent, textComponent, toolbarComponent } from './containers';
import { bigPlayComponent, fullscreenComponent, muteComponent, playComponent, settingsComponent } from './buttons';
import { bufferingComponent, durationComponent, errorOverlayComponent, liveComponent, mediaClickLayerComponent, timeComponent, titleComponent } from './indicators';
import { volumeComponent } from './volume';
import { timelineComponent } from './timeline';

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

export * from './containers';
export * from './buttons';
export * from './indicators';
export * from './volume';
export * from './timeline';
