import { Playerjs } from './compat/playerjs.js';

export * from './index.js';

if (typeof window !== 'undefined') {
  const w = window as unknown as { Playerjs?: unknown; PlayerjsAsync?: unknown };
  w.Playerjs = Playerjs;
  if (typeof w.PlayerjsAsync === 'function') {
    try {
      (w.PlayerjsAsync as () => void)();
    } catch (e) {
      console.error('[vp] PlayerjsAsync failed', e);
    }
  }
}
