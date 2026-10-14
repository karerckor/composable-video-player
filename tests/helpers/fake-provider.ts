import { vi } from 'vitest';
import type { MediaProvider, PlayerError, ProviderContext } from '../../src/types.js';

export interface FakeProviderOptions {
  name?: string;
  canPlay?: (url: string) => 0 | 1 | 2;
  /** Return an error to make load(url) reject with it. */
  fail?: (url: string) => PlayerError | null;
  /** Replace the default load behaviour entirely. */
  load?: (url: string, start: number) => Promise<void>;
}

export function fakeProvider(opts: FakeProviderOptions = {}) {
  const loads: Array<{ url: string; start: number }> = [];
  let ctx: ProviderContext | null = null;
  let video: HTMLVideoElement | null = null;
  const provider: MediaProvider = {
    name: opts.name ?? 'fake',
    canPlay: (url) => (opts.canPlay ? opts.canPlay(url) : 2),
    attach: vi.fn((v: HTMLVideoElement, c: ProviderContext) => {
      video = v;
      ctx = c;
    }),
    load: vi.fn(async (url: string, start: number) => {
      loads.push({ url, start });
      if (opts.load) return opts.load(url, start);
      const err = opts.fail?.(url);
      if (err) throw err;
      if (start > 0 && video) video.currentTime = start;
    }),
    detach: vi.fn(),
    setQuality: vi.fn(),
    setAudioTrack: vi.fn(),
  };
  return {
    provider,
    loads,
    get ctx(): ProviderContext {
      if (!ctx) throw new Error('provider not attached');
      return ctx;
    },
  };
}
