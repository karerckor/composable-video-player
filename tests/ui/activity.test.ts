import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createUserActivity, type UserActivity } from '../../src/ui/activity';
import { createStore } from '../../src/core/store';
import { createEventBus } from '../../src/core/events';
import { createInitialState } from '../../src/core/initial-state';
import type { EventBus, PlayerState, Store } from '../../src/types';

let store: Store<PlayerState>;
let events: EventBus;
let root: HTMLElement;
let activity: UserActivity;

const fire = (type: string, props: Record<string, unknown> = {}) =>
  root.dispatchEvent(Object.assign(new Event(type, { bubbles: true }), props));

beforeEach(() => {
  vi.useFakeTimers();
  store = createStore({ ...createInitialState({ container: 'x' }), started: true, status: 'playing' });
  events = createEventBus();
  root = document.createElement('div');
  activity = createUserActivity({ root, store, events, timeout: 3000 });
});
afterEach(() => {
  activity.dispose();
  vi.useRealTimers();
});

describe('createUserActivity', () => {
  it('activates on pointer movement and deactivates after the timeout', () => {
    fire('pointermove');
    expect(store.get().userActive).toBe(true);
    vi.advanceTimersByTime(2999);
    expect(store.get().userActive).toBe(true);
    vi.advanceTimersByTime(1);
    expect(store.get().userActive).toBe(false);
  });

  it('deactivates immediately when a mouse leaves', () => {
    fire('pointermove');
    fire('pointerleave', { pointerType: 'mouse' });
    expect(store.get().userActive).toBe(false);
    fire('pointermove');
    fire('pointerleave', { pointerType: 'touch' });
    expect(store.get().userActive).toBe(true);
  });

  it('holds activity while a menu is open', () => {
    fire('keydown');
    events.emit('ui:menu', { open: true });
    vi.advanceTimersByTime(10000);
    expect(store.get().userActive).toBe(true);
    fire('pointerleave', { pointerType: 'mouse' });
    expect(store.get().userActive).toBe(true);
    events.emit('ui:menu', { open: false });
    vi.advanceTimersByTime(3000);
    expect(store.get().userActive).toBe(false);
  });

  it('holds activity during a drag', () => {
    events.emit('ui:drag', { active: true });
    vi.advanceTimersByTime(10000);
    expect(store.get().userActive).toBe(true);
    events.emit('ui:drag', { active: false });
    vi.advanceTimersByTime(3000);
    expect(store.get().userActive).toBe(false);
  });

  it('poke() activates programmatically', () => {
    activity.poke();
    expect(store.get().userActive).toBe(true);
  });

  it('emits ui when toolbar visibility changes', () => {
    const ui: number[] = [];
    events.on('ui', (v) => ui.push(v));
    fire('pointermove');
    vi.advanceTimersByTime(3000);
    expect(ui).toEqual([1, 0]);
  });

  it('dispose removes listeners', () => {
    activity.dispose();
    fire('pointermove');
    expect(store.get().userActive).toBe(false);
  });
});
