import type { Plugin } from 'composable-video-player';
import { createAdBreak, type AdSignal } from './ad-break.js';
import { loadIma, type ImaEvent, type ImaManager, type ImaSdk } from './ima-sdk.js';

declare module 'composable-video-player' {
  interface PlayerCommands {
    prepareAds(): Promise<void>;
    playPreroll(source: string | { adsResponse: string }): void;
    stopAdDemo(): void;
  }
  interface PlayerState { adBreakActive?: boolean }
}

/** Example-level IMA adapter. IMA handles VAST, tracking and skip eligibility. */
export function imaPrerollPlugin(options: { onEvent(event: AdSignal): void }): Plugin {
  return {
    name: 'ima-preroll',
    setup(ctx) {
      let sdk: ImaSdk | undefined;
      let disposed = false;
      let epoch = 0;
      let manager: ImaManager | undefined;
      let loader: InstanceType<ImaSdk['AdsLoader']> | undefined;
      let display: InstanceType<ImaSdk['AdDisplayContainer']> | undefined;
      let layer: HTMLElement | undefined;
      let host: HTMLElement | undefined;
      let adPaused = false;
      const emit = (name: string, detail?: string) => { if (!disposed) options.onEvent({ name, detail }); };
      const session = createAdBreak({
        pauseContent() {
          ctx.video.pause(); ctx.store.set({ adBreakActive: true });
          ctx.root.classList.add('library-ad-active');
          if (layer) layer.hidden = false;
        },
        resumeContent() {
          // The content element/source/time never changes during the ad.
          void ctx.player.play().catch(() => emit('play-required', 'Press Play to continue the video.'));
        },
        releaseAd() {
          epoch++;
          const oldManager = manager; manager = undefined;
          const oldLoader = loader; loader = undefined;
          const oldDisplay = display; display = undefined;
          oldManager?.destroy(); oldLoader?.destroy(); oldDisplay?.destroy();
          host?.replaceChildren();
          if (layer) layer.hidden = true;
          ctx.root.classList.remove('library-ad-active');
          ctx.store.set({ adBreakActive: false });
        },
        onEvent: event => emit(event.name, event.detail),
      });
      ctx.registerComponent('ima-ad-layer', ui => {
        const el = document.createElement('div'); el.className = 'library-ad-layer'; el.hidden = true;
        const container = document.createElement('div'); container.className = 'library-ad-host';
        // Keep our controls outside the SDK's click-through area.
        const bar = document.createElement('div'); bar.className = 'library-ad-bar';
        const label = document.createElement('span'); label.textContent = 'Advertisement · IMA test creative';
        const pause = document.createElement('button'); pause.type = 'button'; pause.textContent = 'Pause ad';
        const exit = document.createElement('button'); exit.type = 'button'; exit.textContent = 'Exit demo';
        bar.append(label, pause, exit); el.append(container, bar);
        layer = el; host = container;
        ui.listen(pause, 'click', () => { if (adPaused) manager?.resume(); else manager?.pause(); });
        ui.listen(exit, 'click', () => ui.player.command('stopAdDemo'));
        return { el, dispose() { layer = host = undefined; } };
      });
      function start(source: string | { adsResponse: string }) {
        if (!sdk || !host || disposed || session.active) return;
        if (ctx.video.ended) ctx.player.seek(0);
        if (!session.begin()) return;
        const run = ++epoch;
        const live = () => !disposed && session.active && epoch === run;
        const fail = (detail: string) => { if (live()) session.finish('error', detail); };
        try {
          // Separate SDK media: content remains paused at its original chapter/time.
          display = new sdk.AdDisplayContainer(host);
          display.initialize(); // Called synchronously from the user's Play with ad click.
          loader = new sdk.AdsLoader(display);
          const error = (event: ImaEvent) => fail(`IMA ${event.getError().getErrorCode()}: ${event.getError().getMessage()}`);
          loader.addEventListener(sdk.AdErrorEvent.Type.AD_ERROR, error);
          loader.addEventListener(sdk.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED, event => {
            if (!live()) return;
            try {
              const settings = new sdk!.AdsRenderingSettings();
              settings.restoreCustomPlaybackStateOnAdBreakComplete = true;
              manager = event.getAdsManager(ctx.video, settings);
              manager.addEventListener(sdk!.AdErrorEvent.Type.AD_ERROR, error);
              const types = sdk!.AdEvent.Type;
              for (const [key, name] of [['LOADED', 'loaded'], ['STARTED', 'started'], ['FIRST_QUARTILE', 'first-quartile'], ['MIDPOINT', 'midpoint'], ['THIRD_QUARTILE', 'third-quartile'], ['COMPLETE', 'complete'], ['SKIPPED', 'skipped'], ['PAUSED', 'paused'], ['RESUMED', 'resumed']] as const) {
                manager.addEventListener(types[key], ad => {
                  if (!live()) return;
                  if (key === 'LOADED' && !ad.getAd()?.isLinear()) { fail('This example supports linear prerolls only.'); return; }
                  if (key === 'STARTED') session.started();
                  if (key === 'PAUSED' || key === 'RESUMED' || key === 'STARTED') {
                    adPaused = key === 'PAUSED';
                    const control = layer?.querySelector('button'); if (control) control.textContent = adPaused ? 'Resume ad' : 'Pause ad';
                  }
                  emit(name, key === 'LOADED' ? ad.getAd()?.getTitle() : undefined);
                });
              }
              manager.addEventListener(types.CONTENT_PAUSE_REQUESTED, () => { if (live()) ctx.video.pause(); });
              manager.addEventListener(types.CONTENT_RESUME_REQUESTED, () => { if (live()) session.finish('ad-break-ended'); });
              // Also handles an empty successful response without a content-resume event.
              manager.addEventListener(types.ALL_ADS_COMPLETED, () => { if (live()) session.finish('all-ads-completed'); });
              manager.setVolume(ctx.video.muted ? 0 : ctx.video.volume);
              manager.init(host!.clientWidth, host!.clientHeight); manager.start();
            } catch { fail('The ad could not start.'); }
          });
          const request = new sdk.AdsRequest();
          if (typeof source === 'string') request.adTagUrl = source;
          else request.adsResponse = source.adsResponse;
          request.linearAdSlotWidth = host.clientWidth; request.linearAdSlotHeight = host.clientHeight;
          request.nonLinearAdSlotWidth = host.clientWidth; request.nonLinearAdSlotHeight = host.clientHeight;
          request.setAdWillAutoPlay(false); request.setAdWillPlayMuted(ctx.video.muted || ctx.video.volume === 0);
          emit('request', typeof source === 'string' ? 'Requesting a VAST preroll' : 'Passing VAST XML to IMA'); loader.requestAds(request);
        } catch { fail('The ad SDK could not initialize.'); }
      }
      const observer = new ResizeObserver(() => { if (manager && host) manager.resize(host.clientWidth, host.clientHeight); });
      observer.observe(ctx.root);
      const cleanup = [
        ctx.addLayer({ type: 'ima-ad-layer' }, 'above-ui'),
        ctx.commands.register('prepareAds', async () => {
          sdk = await loadIma(); if (!disposed) emit('ready', 'Choose a scenario, then Play with ad.');
        }),
        ctx.commands.register('playPreroll', ([tag]) => start(tag)),
        ctx.commands.register('stopAdDemo', () => session.finish('exited', 'Demo closed; continuing the video.')),
        ctx.commands.before('play', () => { if (session.active) { manager?.resume(); return false; } }),
        ctx.commands.before('pause', () => { if (session.active) { manager?.pause(); return false; } }),
        ctx.commands.before('toggle', () => { if (session.active) { if (adPaused) manager?.resume(); else manager?.pause(); return false; } }),
        ...(['seek', 'stop', 'setRate', 'openShare'] as const).map(name => ctx.commands.before(name, () => { if (session.active) return false; })),
        ctx.events.on('new', () => session.cancel()),
        ctx.store.select(state => state.muted ? 0 : state.volume, volume => manager?.setVolume(volume)),
      ];
      return () => { disposed = true; session.dispose(); observer.disconnect(); cleanup.forEach(off => off()); };
    },
  };
}
