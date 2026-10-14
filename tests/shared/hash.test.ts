import { describe, expect, it } from 'vitest';
import { fnv1a } from '../../src/shared/hash.js';

describe('fnv1a', () => {
  it('matches known 32-bit FNV-1a vectors', () => {
    expect(fnv1a('')).toBe('811c9dc5');
    expect(fnv1a('a')).toBe('e40c292c');
    expect(fnv1a('foobar')).toBe('bf9cf968');
  });
  it('is deterministic and differs for different input', () => {
    expect(fnv1a('x')).toBe(fnv1a('x'));
    expect(fnv1a('x')).not.toBe(fnv1a('y'));
  });
});
