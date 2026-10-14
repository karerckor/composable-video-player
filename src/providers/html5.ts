import type { MediaProvider } from '../types.js';
import { extOf } from '../shared/url.js';
import { mediaErrorToPlayerError } from '../shared/errors.js';

export function hasNativeHls(): boolean {
  if (typeof document === 'undefined') return false;
  return document.createElement('video').canPlayType('application/vnd.apple.mpegurl') !== '';
}

export function html5Provider(): MediaProvider {
  let video: HTMLVideoElement | null = null;
  let cancel: (() => void) | null = null;

  return {
    name: 'html5',

    canPlay(url, spec) {
      const ext = extOf(url);
      if (ext === 'm3u8' || spec.forceType === 'hls') return hasNativeHls() ? 1 : 0;
      if (ext === 'mpd') return 0;
      return 1;
    },

    attach(v) {
      video = v;
    },

    load(url, startTime) {
      const v = video;
      if (!v) return Promise.reject({ kind: 'unknown', message: 'html5 provider is not attached' });
      cancel?.();
      return new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          v.removeEventListener('loadedmetadata', onMeta);
          v.removeEventListener('error', onError);
          cancel = null;
        };
        const onMeta = () => {
          cleanup();
          if (startTime > 0) v.currentTime = startTime;
          resolve();
        };
        const onError = () => {
          cleanup();
          reject(mediaErrorToPlayerError(v.error));
        };
        cancel = cleanup;
        v.addEventListener('loadedmetadata', onMeta);
        v.addEventListener('error', onError);
        v.src = url;
      });
    },

    detach() {
      cancel?.();
      if (video) {
        video.removeAttribute('src');
        video.load();
      }
      video = null;
    },
  };
}
