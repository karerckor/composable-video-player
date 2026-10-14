import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerMediaCommands } from '../../src/core/media-commands.js';
import { bindMediaEvents } from '../../src/core/media-events.js';
import { createStore } from '../../src/core/store.js';
import { createEventBus } from '../../src/core/events.js';
import { createCommandRegistry } from '../../src/core/commands.js';
import { createLogger } from '../../src/core/logger.js';
import { createInitialState } from '../../src/core/initial-state.js';
import { installFakeMedia, type FakeMedia } from '../helpers/fake-media.js';
import type { MediaDeps } from '../../src/core/media-deps.js';
import type { EventName } from '../../src/types.js';

let d: MediaDeps;
let media: FakeMedia;
let emitted: EventName[];
const USER = { source: 'user' } as const;

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => true });
  const video = document.createElement('video');
  media = installFakeMedia(video);
  const log = createLogger(false);
  d = {
    video,
    root: document.createElement('div'),
    store: createStore(createInitialState({ container: 'x' })),
    events: createEventBus(log),
    commands: createCommandRegistry(log),
    log,
    options: { container: 'x' },
    providers: [],
    transforms: [],
  };
  emitted = [];
  d.events.onAny((n) => emitted.push(n));
  bindMediaEvents(d, { onMediaError: () => {} });
  registerMediaCommands(d);
  media.setDuration(100);
});

describe('media commands', () => {
  it('play returns the media promise and emits userplay for user source', async () => {
    await d.commands.run('play', [], USER);
    expect(media.play).toHaveBeenCalled();
    expect(emitted).toContain('userplay');
  });

  it('play propagates rejection', async () => {
    const err = new DOMException('blocked', 'NotAllowedError');
    media.rejectNextPlay(err);
    await expect(d.commands.run('play', [])).rejects.toBe(err);
  });

  it('toggle plays, pauses and restarts after end', async () => {
    d.commands.run('toggle', []);
    await Promise.resolve();
    expect(d.store.get().status).toBe('playing');
    d.commands.run('toggle', [], USER);
    expect(d.store.get().status).toBe('paused');
    expect(emitted).toContain('userpause');
    media.end();
    d.commands.run('toggle', []);
    expect(d.video.currentTime).toBe(0);
    expect(media.play).toHaveBeenCalledTimes(2);
  });

  it('seek handles absolute, relative and clamping', () => {
    d.commands.run('seek', [30]);
    expect(d.video.currentTime).toBe(30);
    d.commands.run('seek', ['+10']);
    expect(d.video.currentTime).toBe(40);
    d.commands.run('seek', ['-100'], USER);
    expect(d.video.currentTime).toBe(0);
    expect(emitted).toContain('userseek');
    d.commands.run('seek', [500]);
    expect(d.video.currentTime).toBe(100);
  });

  it('seek is a no-op for live', () => {
    media.setDuration(Infinity);
    d.commands.run('seek', [10]);
    expect(d.video.currentTime).toBe(0);
  });

  it('setVolume clamps, supports relative values and unmutes', () => {
    d.video.muted = true;
    d.commands.run('setVolume', [0.5]);
    expect(d.video.volume).toBe(0.5);
    expect(d.video.muted).toBe(false);
    d.commands.run('setVolume', ['+0.8']);
    expect(d.video.volume).toBe(1);
    d.commands.run('setVolume', ['-2']);
    expect(d.video.volume).toBe(0);
  });

  it('mute, unmute and toggleMute', () => {
    d.commands.run('mute', []);
    expect(d.video.muted).toBe(true);
    d.commands.run('toggleMute', []);
    expect(d.video.muted).toBe(false);
    d.commands.run('toggleMute', []);
    d.commands.run('unmute', []);
    expect(d.video.muted).toBe(false);
  });

  it('stop pauses, rewinds and emits stop', async () => {
    await d.commands.run('play', []);
    d.video.currentTime = 50;
    d.commands.run('stop', []);
    expect(d.video.paused).toBe(true);
    expect(d.video.currentTime).toBe(0);
    expect(emitted).toContain('stop');
  });

  it('setRate clamps to the supported range', () => {
    d.commands.run('setRate', [100]);
    expect(d.video.playbackRate).toBe(16);
    d.commands.run('setRate', [0.001]);
    expect(d.video.playbackRate).toBe(0.0625);
  });

  it('scrubbing back after the end resumes from there', async () => {
    await d.commands.run('play', []);
    media.end();
    expect(d.store.get().status).toBe('ended');
    d.video.currentTime = 40;
    d.commands.run('toggle', []);
    await Promise.resolve();
    expect(d.video.currentTime).toBe(40);
    expect(d.store.get().status).toBe('playing');
  });

  it('setRate also sets defaultPlaybackRate', () => {
    d.commands.run('setRate', [1.5]);
    expect(d.video.playbackRate).toBe(1.5);
    expect(d.video.defaultPlaybackRate).toBe(1.5);
  });

  it('setLoop, setTitle, setPoster, setControlsLocked update store', () => {
    d.commands.run('setLoop', [true]);
    d.commands.run('setTitle', ['Hello']);
    d.commands.run('setPoster', ['p.jpg']);
    d.commands.run('setControlsLocked', [true]);
    expect(d.video.loop).toBe(true);
    expect(d.video.poster).toContain('p.jpg');
    expect(d.store.get()).toMatchObject({ loop: true, title: 'Hello', poster: 'p.jpg', controlsLocked: true });
  });

  it('fullscreen commands call the Fullscreen API and track state', () => {
    const request = vi.fn(() => Promise.resolve());
    (d.root as any).requestFullscreen = request;
    d.commands.run('toggleFullscreen', []);
    expect(request).toHaveBeenCalled();
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => d.root });
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(d.store.get().fullscreen).toBe(true);
    expect(emitted).toContain('fullscreen');
    const exit = vi.fn(() => Promise.resolve());
    (document as any).exitFullscreen = exit;
    d.commands.run('toggleFullscreen', []);
    expect(exit).toHaveBeenCalled();
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => null });
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(d.store.get().fullscreen).toBe(false);
    expect(emitted).toContain('exitfullscreen');
  });

  it('falls back to the video element when the Fullscreen API is disabled', () => {
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => false });
    const request = vi.fn(() => Promise.resolve());
    (d.root as any).requestFullscreen = request;
    const enter = vi.fn();
    (d.video as any).webkitEnterFullscreen = enter;
    d.commands.run('fullscreen', []);
    expect(enter).toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });
});
