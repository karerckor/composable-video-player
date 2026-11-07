/** Ad/content coordination, independent of the ad SDK and the DOM. */
export interface AdSignal { name: string; detail?: string }

export function createAdBreak(options: {
  pauseContent(): void;
  resumeContent(): void;
  releaseAd(): void;
  onEvent(event: AdSignal): void;
}) {
  let active = false;
  let disposed = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const clear = () => { clearTimeout(timeout); timeout = undefined; };
  return {
    get active() { return active; },
    begin(timeoutMs = 12000) {
      if (disposed || active) return false;
      active = true;
      options.pauseContent();
      options.onEvent({ name: 'content-pause' });
      timeout = setTimeout(() => this.finish('error', 'The ad request timed out.'), timeoutMs);
      return true;
    },
    started() { clear(); },
    finish(reason: string, detail?: string) {
      if (disposed || !active) return;
      active = false; clear();
      options.onEvent({ name: reason, detail });
      options.releaseAd();
      options.onEvent({ name: 'content-resume' });
      options.resumeContent();
    },
    cancel() {
      if (disposed || !active) return;
      active = false; clear();
      options.releaseAd();
      options.onEvent({ name: 'cancelled', detail: 'Content source changed.' });
    },
    dispose() {
      if (disposed) return;
      disposed = true; active = false; clear();
      options.releaseAd();
    },
  };
}
