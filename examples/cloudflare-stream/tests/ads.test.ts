import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createAdBreak, type AdSignal } from '../src/plugins/ad-break.js';

function fixture() {
  let playing = true;
  let disposed = 0;
  const events: AdSignal[] = [];
  const session = createAdBreak({
    pauseContent: () => { playing = false; },
    resumeContent: () => { playing = true; },
    releaseAd: () => { disposed++; },
    onEvent: event => events.push(event),
  });
  return { session, events, playing: () => playing, disposed: () => disposed };
}

describe('ad break lifecycle', () => {
  it('pauses content and rejects a second request until the first break finishes', () => {
    const f = fixture();
    assert.equal(f.session.begin(), true);
    assert.equal(f.playing(), false);
    assert.equal(f.session.active, true);
    assert.equal(f.session.begin(), false);
    f.session.finish('complete');
    assert.equal(f.playing(), true);
    assert.equal(f.session.active, false);
    assert.equal(f.disposed(), 1);
    assert.equal(f.session.begin(), true);
    f.session.dispose();
  });
  it('an error releases the ad and continues content exactly once', () => {
    const f = fixture(); f.session.begin();
    f.session.finish('error', 'VAST unavailable');
    f.session.finish('complete');
    assert.equal(f.playing(), true);
    assert.equal(f.disposed(), 1);
    assert.equal(f.events.filter(e => e.name === 'content-resume').length, 1);
    assert.equal(f.events.find(e => e.name === 'error')?.detail, 'VAST unavailable');
  });
  it('a request that never responds times out and releases content', async () => {
    const f = fixture(); f.session.begin(5);
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(f.session.active, false);
    assert.equal(f.playing(), true);
    assert.equal(f.events.find(e => e.name === 'error')?.detail, 'The ad request timed out.');
  });
  it('navigation cancels pending callbacks without restarting destroyed content', () => {
    const f = fixture(); f.session.begin();
    f.session.dispose();
    f.session.finish('complete');
    assert.equal(f.playing(), false);
    assert.equal(f.disposed(), 1);
    assert.equal(f.session.begin(), false);
    assert.equal(f.events.some(e => e.name === 'content-resume'), false);
  });
  it('a source change cancels its ad without playing the outgoing content', () => {
    const f = fixture(); f.session.begin();
    f.session.cancel();
    f.session.finish('complete');
    assert.equal(f.playing(), false);
    assert.equal(f.disposed(), 1);
    assert.equal(f.events.some(e => e.name === 'content-resume'), false);
    assert.equal(f.session.begin(), true);
    f.session.dispose();
  });
});
