import { describe, expect, it } from 'vitest';
import * as vp from '../src/index';

describe('public exports', () => {
  it('exposes the main entry points', () => {
    expect(typeof vp.createPlayer).toBe('function');
    expect(vp.defaultLayout.type).toBe('root');
    expect(typeof vp.html5Provider).toBe('function');
    expect(typeof vp.parseSource).toBe('function');
    expect(typeof vp.createIconButton).toBe('function');
    expect(typeof vp.createSlider).toBe('function');
    expect(vp.PLAYERJS_EVENTS).toContain('play');
    expect(vp.BUILTIN_COMPONENTS.play).toBeDefined();
  });
});
