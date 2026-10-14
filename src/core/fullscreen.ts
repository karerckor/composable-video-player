import type { Logger } from '../types';

type FsDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => void;
};
type FsElement = HTMLElement & { webkitRequestFullscreen?: () => void };
type IOSVideo = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void;
  webkitExitFullscreen?: () => void;
};

export function fullscreenElement(): Element | null {
  const d = document as FsDocument;
  return d.fullscreenElement ?? d.webkitFullscreenElement ?? null;
}

/** Must be called from a user gesture, otherwise browsers reject. */
export function enterFullscreen(root: HTMLElement, video: HTMLVideoElement, log: Logger): void {
  const el = root as FsElement;
  if (typeof el.requestFullscreen === 'function') {
    Promise.resolve(el.requestFullscreen()).catch((e) => log.warn('fullscreen request rejected', e));
  } else if (typeof el.webkitRequestFullscreen === 'function') {
    el.webkitRequestFullscreen();
  } else {
    (video as IOSVideo).webkitEnterFullscreen?.();
  }
}

export function exitFullscreen(video: HTMLVideoElement): void {
  const d = document as FsDocument;
  if (fullscreenElement()) {
    if (typeof d.exitFullscreen === 'function') Promise.resolve(d.exitFullscreen()).catch(() => {});
    else d.webkitExitFullscreen?.();
  } else {
    (video as IOSVideo).webkitExitFullscreen?.();
  }
}

export function watchFullscreen(root: HTMLElement, video: HTMLVideoElement, onChange: (fs: boolean) => void): () => void {
  const check = () => onChange(fullscreenElement() === root);
  const begin = () => onChange(true);
  const end = () => onChange(false);
  document.addEventListener('fullscreenchange', check);
  document.addEventListener('webkitfullscreenchange', check);
  video.addEventListener('webkitbeginfullscreen', begin);
  video.addEventListener('webkitendfullscreen', end);
  return () => {
    document.removeEventListener('fullscreenchange', check);
    document.removeEventListener('webkitfullscreenchange', check);
    video.removeEventListener('webkitbeginfullscreen', begin);
    video.removeEventListener('webkitendfullscreen', end);
  };
}
