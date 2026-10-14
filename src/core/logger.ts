import type { Logger } from '../types';

export function createLogger(enabled: boolean, prefix = '[vp]'): Logger {
  return {
    debug: (...args) => {
      if (enabled) console.log(prefix, ...args);
    },
    warn: (...args) => console.warn(prefix, ...args),
    error: (...args) => console.error(prefix, ...args),
  };
}
