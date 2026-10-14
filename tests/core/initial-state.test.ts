import { describe, expect, it } from 'vitest';
import { createInitialState } from '../../src/core/initial-state.js';

describe('createInitialState', () => {
  it('uses defaults', () => {
    const s = createInitialState({ container: 'x' });
    expect(s).toMatchObject({ status: 'idle', volume: 1, muted: false, rate: 1, loop: false, textTrack: -1, title: '', poster: '' });
  });
  it('applies options and clamps volume', () => {
    const s = createInitialState({ container: 'x', volume: 3, muted: true, rate: 1.5, loop: true, title: 'T', poster: 'p.jpg' });
    expect(s).toMatchObject({ volume: 1, muted: true, rate: 1.5, loop: true, title: 'T', poster: 'p.jpg' });
  });
});
