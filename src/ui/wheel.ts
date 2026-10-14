import type { UIContext } from '../types';

const STEP_PX = 50;

/**
 * Mouse-wheel volume control: accumulates `deltaY` and emits one `setVolume` step per 50px,
 * so smooth-scrolling touchpads do not flood the player. Downward steps are ignored while muted.
 */
export function bindWheelVolume(ctx: UIContext, el: HTMLElement): void {
  let acc = 0;
  ctx.listen(
    el,
    'wheel',
    (e) => {
      const we = e as WheelEvent;
      if (!we.deltaY) return;
      e.preventDefault();
      acc += we.deltaY * (we.deltaMode === 1 ? 16 : we.deltaMode === 2 ? 400 : 1);
      while (Math.abs(acc) >= STEP_PX) {
        const up = acc < 0;
        acc += up ? STEP_PX : -STEP_PX;
        if (!up && ctx.store.get().muted) continue;
        ctx.user('setVolume', up ? '+0.05' : '-0.05');
      }
    },
    { passive: false },
  );
}
