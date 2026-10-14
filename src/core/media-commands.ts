import type { CommandContext } from '../types';
import type { MediaDeps } from './media-deps';
import { clamp } from '../shared/clamp';
import { enterFullscreen, exitFullscreen, watchFullscreen } from './fullscreen';

const isRelative = (v: number | string): v is string => typeof v === 'string' && /^[+-]/.test(v.trim());

export function registerMediaCommands(d: MediaDeps): () => void {
  const { video, store, events, commands, log, root } = d;

  const playSafe = (ctx: CommandContext) => {
    const p = commands.run('play', [], ctx);
    if (p) p.catch((e) => log.warn('play() was rejected', e));
  };

  const offs: Array<() => void> = [
    commands.register('play', (_args, ctx) => {
      const p = video.play() ?? Promise.resolve();
      if (ctx.source === 'user') events.emit('userplay');
      return p;
    }),

    commands.register('pause', (_args, ctx) => {
      video.pause();
      if (ctx.source === 'user') events.emit('userpause');
    }),

    commands.register('toggle', (_args, ctx) => {
      if (store.get().status === 'ended') {
        video.currentTime = 0;
        playSafe(ctx);
      } else if (!video.paused) {
        commands.run('pause', [], ctx);
      } else {
        playSafe(ctx);
      }
    }),

    commands.register('stop', () => {
      video.pause();
      video.currentTime = 0;
      events.emit('stop');
    }),

    commands.register('seek', ([t], ctx) => {
      if (store.get().live) return;
      let target = isRelative(t) ? video.currentTime + Number(t) : Number(t);
      if (!Number.isFinite(target)) return;
      const duration = video.duration;
      target = Number.isFinite(duration) ? clamp(target, 0, duration) : Math.max(0, target);
      video.currentTime = target;
      store.set({ currentTime: target });
      if (ctx.source === 'user') events.emit('userseek', target);
    }),

    commands.register('setVolume', ([v]) => {
      const raw = isRelative(v) ? video.volume + Number(v) : Number(v);
      if (!Number.isFinite(raw)) return;
      const volume = clamp(raw, 0, 1);
      video.volume = volume;
      if (volume > 0 && video.muted) video.muted = false;
    }),

    commands.register('mute', () => {
      video.muted = true;
    }),
    commands.register('unmute', () => {
      video.muted = false;
    }),
    commands.register('toggleMute', () => {
      video.muted = !video.muted;
    }),

    commands.register('setRate', ([r]) => {
      if (!(r > 0)) return;
      const rate = clamp(r, 0.0625, 16);
      video.defaultPlaybackRate = rate;
      video.playbackRate = rate;
    }),

    commands.register('setLoop', ([b]) => {
      video.loop = b;
      store.set({ loop: b });
    }),
    commands.register('setTitle', ([title]) => store.set({ title })),
    commands.register('setPoster', ([poster]) => {
      video.poster = poster;
      store.set({ poster });
    }),
    commands.register('setControlsLocked', ([b]) => store.set({ controlsLocked: b })),

    commands.register('fullscreen', () => enterFullscreen(root, video, log)),
    commands.register('exitFullscreen', () => exitFullscreen(video)),
    commands.register('toggleFullscreen', () => {
      if (store.get().fullscreen) exitFullscreen(video);
      else enterFullscreen(root, video, log);
    }),

    watchFullscreen(root, video, (fs) => {
      if (store.get().fullscreen === fs) return;
      store.set({ fullscreen: fs });
      events.emit(fs ? 'fullscreen' : 'exitfullscreen');
    }),
  ];

  return () => offs.forEach((off) => off());
}
