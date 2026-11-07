import { formatTime, type Player } from 'composable-video-player';
import { button, el } from './dom.js';
import type { AdSignal } from './plugins/ad-break.js';

export const adScenarios = [
  { id: 'local', label: 'Sample VAST · skip after 5s', description: 'A local VAST XML file plays public sample footage through IMA. Skip after five seconds or watch to the end.', tag: '/vast-demo.xml' },
  { id: 'linear', label: 'Short preroll', description: 'A test ad plays first. Your video then continues from its current position.', tag: 'https://pubads.g.doubleclick.net/gampad/ads?iu=/21775744923/external/single_ad_samples&sz=640x480&cust_params=sample_ct%3Dlinear&ciu_szs=300x250%2C728x90&gdfp_req=1&output=vast&unviewed_position_start=1&env=vp&correlator=' },
  { id: 'skippable', label: 'Skippable preroll', description: 'IMA shows Skip when the test creative allows it. Skipping returns you to the video.', tag: 'https://pubads.g.doubleclick.net/gampad/ads?iu=/21775744923/external/single_preroll_skippable&sz=640x480&ciu_szs=300x250%2C728x90&gdfp_req=1&output=vast&unviewed_position_start=1&env=vp&correlator=' },
  { id: 'error', label: 'Invalid VAST response', description: 'A deliberately invalid VAST response demonstrates fallback: the video continues.', tag: '' },
] as const;

export function createAdDemo(signal: AbortSignal) {
  let player: Player | undefined;
  let enabled = false;
  let sampleXml = '';
  const card = el('section', 'ad-demo'); card.id = 'ad-demo'; card.setAttribute('aria-label', 'VAST advertising demo');
  const heading = el('div', 'ad-demo-heading');
  const title = el('div'); title.append(el('span', 'eyebrow', 'CUSTOM PLUGIN · VAST + GOOGLE IMA'), el('h2', '', 'Make your video library ad-supported.'));
  const badge = el('span', 'ad-demo-badge', 'Optional demo'); heading.append(title, badge);
  const intro = el('p', '', 'Play a test ad on this player, then return to the same moment in your video. See how a plugin connects an ad SDK without replacing your content.');
  const controls = el('div', 'ad-demo-controls');
  const label = el('label', '', 'Ad scenario');
  const select = el('select', 'caption-select'); select.setAttribute('aria-label', 'Ad scenario');
  for (const scenario of adScenarios) { const option = el('option', '', scenario.label); option.value = scenario.id; select.append(option); }
  label.append(select);
  const detail = el('p', 'ad-demo-detail', adScenarios[0].description);
  const state = el('p', 'ad-demo-state', 'Your video plays normally until you enable and start the demo.'); state.setAttribute('role', 'status');
  const list = el('ol', 'ad-demo-events'); list.setAttribute('aria-label', 'Ad lifecycle events'); list.hidden = true;
  let startTime = 0;
  let pending = false;
  const play = button('Enable ad demo', 'primary-button', () => {
    if (!player || pending || player.state.adBreakActive) return;
    if (!enabled) {
      pending = true; play.disabled = true; play.textContent = 'Loading IMA…';
      state.textContent = 'Loading Google IMA. The ad starts only after your next click.';
      Promise.all([player.command('prepareAds'), fetch(new URL('vast-demo.xml', document.baseURI), { signal }).then(async response => { if (!response.ok) throw new Error('The sample VAST file could not load.'); sampleXml = await response.text(); })]).then(() => {
        if (signal.aborted) return;
        enabled = true; play.textContent = 'Play with ad';
      }).catch(error => {
        if (signal.aborted) return;
        state.textContent = `${(error as Error).message} Your video is still available.`;
        play.textContent = 'Retry enabling ads';
      }).finally(() => { if (!signal.aborted) { pending = false; play.disabled = false; } });
      return;
    }
    list.replaceChildren(); list.hidden = false; startTime = performance.now();
    const scenario = adScenarios.find(item => item.id === select.value)!;
    player.root.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (scenario.id === 'local') player.command('playPreroll', { adsResponse: sampleXml });
    else if (scenario.id === 'error') player.command('playPreroll', { adsResponse: '<invalid-vast-response />' });
    else {
      const tag = new URL(scenario.tag); tag.searchParams.set('correlator', String(Date.now()));
      player.command('playPreroll', tag.href);
    }
  });
  play.disabled = true;
  const exit = button('Exit demo', 'outline-button', () => player?.command('stopAdDemo')); exit.hidden = true;
  controls.append(label, play, exit);
  const note = el('p', 'ad-demo-note', 'Uses Google’s public test ads. Enabling loads a third-party SDK; pressing Play with ad sends the ad request. Ad blockers may prevent playback.');
  const code = el('a', 'text-link', 'See the IMA plugin & integration code ↓'); code.href = '#player-integration';
  const docs = el('a', 'text-link', 'Google IMA sample tags ↗'); docs.href = 'https://developers.google.com/interactive-media-ads/docs/sdks/html5/client-side/tags'; docs.target = '_blank'; docs.rel = 'noopener noreferrer';
  const xml = el('a', 'text-link', 'Open the sample VAST XML ↗'); xml.href = new URL('vast-demo.xml', document.baseURI).href; xml.target = '_blank'; xml.rel = 'noopener noreferrer';
  const links = el('div', 'ad-demo-links'); links.append(code, xml, docs);
  card.append(heading, intro, controls, detail, state, list, note, links);
  select.addEventListener('change', () => { detail.textContent = adScenarios.find(item => item.id === select.value)!.description; }, { signal });
  return {
    element: card,
    attach(value: Player) {
      player = value; play.disabled = false;
      const off = player.select(s => !!s.adBreakActive, active => { play.disabled = active; select.disabled = active; exit.hidden = !active; }, { immediate: true });
      signal.addEventListener('abort', off, { once: true });
    },
    onEvent(event: AdSignal) {
      if (signal.aborted) return;
      if (event.name === 'ready') { state.textContent = event.detail ?? ''; return; }
      if (list.children.length >= 30) list.firstElementChild?.remove();
      const row = el('li'); row.append(el('time', 'mono', `${((performance.now() - startTime) / 1000).toFixed(1)}s`), el('strong', '', event.name), el('span', '', event.detail ?? '')); list.append(row);
      if (event.name === 'request') state.textContent = 'Requesting a VAST ad…';
      if (event.name === 'started') state.textContent = 'The ad is playing. Content and its timeline stay paused.';
      if (event.name === 'content-resume') state.textContent = `Back to your video at ${formatTime(player?.video.currentTime ?? 0)}. Chapters, captions and Share are available again.`;
      if (event.name === 'play-required') state.textContent = event.detail ?? '';
    },
  };
}
