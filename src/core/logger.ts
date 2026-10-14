import type { Logger } from '../types.js';

export function createLogger(enabled: boolean, prefix = '[vp]'): Logger {
  return {
    debug: (...args) => {
      if (enabled) console.log(prefix, ...args);
    },
    warn: (...args) => console.warn(prefix, ...args),
    error: (...args) => console.error(prefix, ...args),
  };
}
