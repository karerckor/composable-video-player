// The subset of the external IMA HTML5 API used by this example.
// Reference: https://developers.google.com/interactive-media-ads/docs/sdks/html5/client-side/reference
export interface ImaEvent {
  getAdsManager(video: HTMLVideoElement, settings: object): ImaManager;
  getAd(): { isLinear(): boolean; getTitle(): string } | null;
  getError(): { getErrorCode(): number; getMessage(): string };
}
interface ImaEvents { addEventListener(name: string, callback: (event: ImaEvent) => void): void }
export interface ImaManager extends ImaEvents {
  init(width: number, height: number): void;
  start(): void;
  pause(): void;
  resume(): void;
  resize(width: number, height: number): void;
  setVolume(volume: number): void;
  destroy(): void;
}
interface ImaDisplay { initialize(): void; destroy(): void }
interface ImaRequest {
  adTagUrl: string;
  adsResponse: string;
  linearAdSlotWidth: number;
  linearAdSlotHeight: number;
  nonLinearAdSlotWidth: number;
  nonLinearAdSlotHeight: number;
  setAdWillAutoPlay(value: boolean): void;
  setAdWillPlayMuted(value: boolean): void;
}
export interface ImaSdk {
  AdDisplayContainer: new (element: HTMLElement) => ImaDisplay;
  AdsLoader: new (display: ImaDisplay) => ImaEvents & { requestAds(request: ImaRequest): void; destroy(): void };
  AdsRequest: new () => ImaRequest;
  AdsRenderingSettings: new () => { restoreCustomPlaybackStateOnAdBreakComplete: boolean };
  AdsManagerLoadedEvent: { Type: { ADS_MANAGER_LOADED: string } };
  AdErrorEvent: { Type: { AD_ERROR: string } };
  AdEvent: { Type: Record<string, string> };
}
let pending: Promise<ImaSdk> | undefined;
export function loadIma(): Promise<ImaSdk> {
  const current = () => (window as Window & { google?: { ima?: ImaSdk } }).google?.ima;
  if (current()) return Promise.resolve(current()!);
  if (pending) return pending;
  pending = new Promise<ImaSdk>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://imasdk.googleapis.com/js/sdkloader/ima3.js'; script.async = true;
    const fail = () => { clearTimeout(timer); script.remove(); pending = undefined; reject(new Error('The IMA SDK could not load. An ad blocker or network filter may be active.')); };
    const timer = setTimeout(fail, 10000);
    script.onerror = fail;
    script.onload = () => { if (!current()) return fail(); clearTimeout(timer); resolve(current()!); };
    document.head.append(script);
  });
  return pending;
}
