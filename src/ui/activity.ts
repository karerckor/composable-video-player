import type { EventBus, PlayerState, Store } from '../types';

export interface UserActivityDeps {
  root: HTMLElement;
  store: Store<PlayerState>;
  events: EventBus;
  timeout: number;
}

export interface UserActivity {
  poke(): void;
  dispose(): void;
}

const MAX_TIMEOUT = 2_147_483_647;
const ACTIVATE = ['pointermove', 'pointerdown', 'keydown', 'focusin'] as const;

/** Mirrors the default toolbar hide rule [idle] (toolbar is visible before the first play, like PlayerJS). */
export const controlsVisible = (s: PlayerState) => s.userActive || s.status !== 'playing' || s.controlsLocked;

export function createUserActivity(d: UserActivityDeps): UserActivity {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let holds = 0;
  // setTimeout overflows (fires immediately) above 2^31-1 ms; a non-finite timeout means "never hide".
  const canSchedule = Number.isFinite(d.timeout) && d.timeout <= MAX_TIMEOUT;

  const setActive = (active: boolean) => {
    if (d.store.get().userActive !== active) d.store.set({ userActive: active });
  };

  const poke = () => {
    clearTimeout(timer);
    setActive(true);
    if (holds === 0 && canSchedule) timer = setTimeout(() => setActive(false), d.timeout);
  };

  const onLeave = (e: Event) => {
    if ((e as PointerEvent).pointerType !== 'mouse' || holds > 0) return;
    clearTimeout(timer);
    setActive(false);
  };

  for (const type of ACTIVATE) d.root.addEventListener(type, poke);
  d.root.addEventListener('pointerleave', onLeave);

  const hold = (active: boolean) => {
    if (active) {
      holds++;
      clearTimeout(timer);
      setActive(true);
    } else {
      holds = Math.max(0, holds - 1);
      poke();
    }
  };
  const offMenu = d.events.on('ui:menu', ({ open }) => hold(open));
  const offDrag = d.events.on('ui:drag', ({ active }) => hold(active));

  const offUi = d.store.select(controlsVisible, (visible) => d.events.emit('ui', visible ? 1 : 0));

  return {
    poke,
    dispose() {
      clearTimeout(timer);
      for (const type of ACTIVATE) d.root.removeEventListener(type, poke);
      d.root.removeEventListener('pointerleave', onLeave);
      offMenu();
      offDrag();
      offUi();
    },
  };
}
