import type { UIContext } from '../types';

const STEP_PX = 50;

/**
 * Turns wheel events into discrete steps: normalizes `deltaMode`, ignores `deltaY === 0`,
 * accumulates 50px per step (so smooth-scrolling touchpads do not flood the player).
 * Returns +1 for up (negative `deltaY`), -1 for down, 0 while still accumulating.
 * At most one step is returned per event; any remainder carries over to the next event.
 */
export function createWheelStepper(): (e: WheelEvent) => -1 | 0 | 1 {
  let acc = 0;
  return (e) => {
    if (!e.deltaY) return 0;
    acc += e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
    if (Math.abs(acc) < STEP_PX) return 0;
    const up = acc < 0;
    acc += up ? STEP_PX : -STEP_PX;
    return up ? 1 : -1;
  };
}

/**
 * Mouse-wheel volume control: one `setVolume` step per 50px of scrolling.
 * Downward steps are ignored while muted.
 */
export function bindWheelVolume(ctx: UIContext, el: HTMLElement): void {
  const step = createWheelStepper();
  ctx.listen(
    el,
    'wheel',
    (e) => {
      const we = e as WheelEvent;
      if (!we.deltaY) return;
      e.preventDefault();
      const s = step(we);
      if (s === 0 || (s === -1 && ctx.store.get().muted)) return;
      ctx.user('setVolume', s === 1 ? '+0.05' : '-0.05');
    },
    { passive: false },
  );
}
