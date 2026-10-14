import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPlayer } from '../src/player';
import { installFakeMedia } from './helpers/fake-media';
import { fakeProvider } from './helpers/fake-provider';
import { flush } from './helpers/flush';
import { h } from '../src/ui/dom';
import type { EventName, Player, Plugin } from '../src/types';

let host: HTMLElement;
let player: Player | null;

const fakeProviderPlugin = (fp = fakeProvider()): Plugin => ({ name: 'fake-provider', setup: (ctx) => ctx.registerProvider(fp.provider) });

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  document.head.querySelector('#vp-styles')?.remove();
  document.body.replaceChildren();
  host = document.createElement('div');
  host.id = 'player';
  document.body.append(host);
  player = null;
});
afterEach(() => player?.destroy());

describe('createPlayer', () => {
  it('builds the DOM skeleton and injects styles once', () => {
    player = createPlayer({ container: 'player' });
    const second = createPlayer({ container: document.body.appendChild(document.createElement('div')) });
    expect(player.id).toBe('player');
    expect(second.id).toMatch(/^vp\d+$/);
    expect(player.container).toBe(host);
    expect(player.root.className).toBe('vp-root');
    expect(host.querySelector('.vp-media > video')).toBe(player.video);
    expect(host.querySelectorAll('.vp-ui > .vp-layer-below, .vp-ui > .vp-layout, .vp-ui > .vp-layer-above')).toHaveLength(3);
    expect(document.querySelectorAll('#vp-styles')).toHaveLength(1);
    expect(player.video.hasAttribute('playsinline')).toBe(true);
    second.destroy();
  });

  it('throws for a missing container', () => {
    expect(() => createPlayer({ container: 'missing' })).toThrow(/container/);
  });

  it('applies ratio and theme', () => {
    player = createPlayer({ container: host, ratio: '4:3', theme: { color1: '#f00', toolbarBg: 'red' } });
    expect(player.root.style.aspectRatio).toBe('4 / 3');
    expect(player.root.style.getPropertyValue('--vp-color-1')).toBe('#f00');
    expect(player.root.style.getPropertyValue('--vp-toolbar-bg')).toBe('red');
  });

  it('builds the default layout', () => {
    player = createPlayer({ container: host });
    expect(host.querySelector('.vp-layout .vp-toolbar .vp-play')).not.toBeNull();
  });

  it('emits init before new and plays through the UI', async () => {
    const events: EventName[] = [];
    const plugins: Plugin[] = [fakeProviderPlugin(), { name: 'spy', setup: (ctx) => void ctx.events.onAny((n) => events.push(n)) }];
    player = createPlayer({ container: host, plugins });
    const media = installFakeMedia(player.video);
    player.load('movie.mp4');
    await flush();
    expect(events.indexOf('init')).toBeLessThan(events.indexOf('new'));
    expect(player.state.status).toBe('ready');
    host.querySelector<HTMLButtonElement>('.vp-play')!.click();
    await flush();
    expect(media.play).toHaveBeenCalled();
    expect(player.state.status).toBe('playing');
    expect(events).toContain('userplay');
  });

  it('loads options.source after init', async () => {
    const fp = fakeProvider();
    player = createPlayer({ container: host, plugins: [fakeProviderPlugin(fp)], source: '[360p]a.mp4,[720p]b.mp4' });
    await flush();
    expect(fp.loads[0]!.url).toBe('b.mp4');
  });

  it('gives plugins components, menus, hide rules, layers and transforms', async () => {
    const fp = fakeProvider();
    const dispose = vi.fn();
    const plugin: Plugin = {
      name: 'demo',
      setup(ctx) {
        ctx.registerProvider(fp.provider);
        ctx.registerComponent('badge', () => ({ el: h('span', { class: 'badge' }, 'B') }));
        ctx.registerHideRule('never', () => ({ test: () => false }));
        ctx.registerMenu({ id: 'demo', label: 'Demo', visible: () => true, options: () => [{ label: 'x', value: 1 }], current: () => 1, select: () => {} });
        ctx.addLayer({ type: 'badge', className: 'below' }, 'below-ui');
        ctx.addLayer({ type: 'badge', className: 'above', hide: ['never'] }, 'above-ui');
        ctx.addSourceTransform((_s, sel) => ({ ...sel, start: 7 }));
        return dispose;
      },
    };
    player = createPlayer({ container: host, plugins: [plugin] });
    expect(host.querySelector('.vp-layer-below > .below')).not.toBeNull();
    expect(host.querySelector('.vp-layer-above > .above')).not.toBeNull();
    expect(host.querySelector('.vp-settings')!.classList.contains('vp-hidden')).toBe(false);
    player.load('a.mp4');
    await flush();
    expect(fp.loads[0]!.start).toBe(7);
    player.destroy();
    expect(dispose).toHaveBeenCalled();
  });

  it('rebuilds the layout with the layout command and supports layout:false', () => {
    player = createPlayer({ container: host });
    player.command('layout', { type: 'root', children: [{ type: 'play' }] });
    expect(host.querySelector('.vp-toolbar')).toBeNull();
    expect(host.querySelector('.vp-layout .vp-play')).not.toBeNull();
    const bare = createPlayer({ container: document.body.appendChild(document.createElement('div')), layout: false });
    expect(bare.root.querySelector('.vp-layout')!.childElementCount).toBe(0);
    bare.destroy();
  });

  it('exposes api(), commands and state', () => {
    player = createPlayer({ container: host, title: 'Hello' });
    installFakeMedia(player.video);
    expect(player.api('title')).toBe('Hello');
    player.api('volume', 0.3);
    expect(player.state.volume).toBe(0.3);
    player.command('setTitle', 'World');
    expect(player.api('title')).toBe('World');
    expect(player.api('id')).toBe('player');
  });

  it('toolbar on/off locks controls; showControls pokes activity', () => {
    player = createPlayer({ container: host });
    player.api('toolbar', 'on');
    expect(player.state.controlsLocked).toBe(true);
    player.api('toolbar');
    expect(player.state.userActive).toBe(true);
  });

  it('destroy cleans up and is idempotent', () => {
    const onDestroy = vi.fn();
    player = createPlayer({ container: host });
    player.on('destroy', onDestroy);
    player.destroy();
    player.destroy();
    expect(onDestroy).toHaveBeenCalledTimes(1);
    expect(host.childElementCount).toBe(0);
    expect(player.command('play')).toBeUndefined();
    expect(console.warn).toHaveBeenCalled();
    player = null;
  });
});
