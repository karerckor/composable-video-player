import { beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryPlugin, shouldRestorePosition } from '../../src/plugins/memory';
import { speedPlugin } from '../../src/plugins/speed';
import { createTestPlayer } from '../helpers/player-harness';
import { flush } from '../helpers/flush';
import { fnv1a } from '../../src/shared/hash';
import type { CommandRegistry, Plugin } from '../../src/types';

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('shouldRestorePosition (reference rule)', () => {
  it('restores in the middle and when the duration is unknown', () => {
    expect(shouldRestorePosition(30, 100)).toBe(true);
    expect(shouldRestorePosition(30, NaN)).toBe(true);
  });
  it('skips the very beginning and the last 10 seconds', () => {
    expect(shouldRestorePosition(3, 100)).toBe(false);
    expect(shouldRestorePosition(95, 100)).toBe(false);
  });
});

describe('memoryPlugin preferences', () => {
  it('restores volume, mute, speed and preferred subtitle on init', () => {
    localStorage.setItem('vp:volume', '0.3');
    localStorage.setItem('vp:muted', '1');
    localStorage.setItem('vp:speed', '1.5');
    localStorage.setItem('vp:subtitle', 'Ru');
    const { player } = createTestPlayer({ plugins: [memoryPlugin()] });
    expect(player.state.volume).toBe(0.3);
    expect(player.state.muted).toBe(true);
    expect(player.state.rate).toBe(1.5);
    expect(player.state.preferredSubtitle).toBe('Ru');
  });

  it('saves volume, speed, quality, audio and subtitle changes', async () => {
    const { player, fp } = createTestPlayer({ plugins: [memoryPlugin()], source: '[a]{En}a.mp4;{Ru}ar.mp4,[b]{En}b.mp4;{Ru}br.mp4' });
    await flush();
    player.command('setVolume', 0.6);
    player.command('setRate', 2);
    player.command('setQuality', 0);
    player.command('setAudioTrack', 1);
    await flush();
    expect(localStorage.getItem('vp:volume')).toBe('0.6');
    expect(localStorage.getItem('vp:speed')).toBe('2');
    expect(localStorage.getItem('vp:quality')).toBe('a');
    expect(localStorage.getItem('vp:audio')).toBe('Ru');
    player.load('[a]{En}a.mp4;{Ru}ar.mp4,[b]{En}b.mp4;{Ru}br.mp4');
    await flush();
    expect(fp.loads[fp.loads.length - 1]!.url).toBe('ar.mp4');
  });

  it('persists explicit mute but not internal (autoplay) mute', () => {
    let commands!: CommandRegistry;
    const grab: Plugin = { name: 'grab', setup: (ctx) => void (commands = ctx.commands) };
    const { player } = createTestPlayer({ plugins: [grab, memoryPlugin()] });
    commands.run('mute', []);
    expect(localStorage.getItem('vp:muted')).toBeNull();
    player.command('unmute');
    expect(localStorage.getItem('vp:muted')).toBe('0');
    player.command('toggleMute');
    expect(localStorage.getItem('vp:muted')).toBe('1');
  });

  it('saved speed wins over defaultSpeed from the speed plugin', () => {
    localStorage.setItem('vp:speed', '2');
    const { player } = createTestPlayer({ plugins: [speedPlugin(), memoryPlugin()], defaultSpeed: 1.5 });
    expect(player.state.rate).toBe(2);
    expect(localStorage.getItem('vp:speed')).toBe('2');
  });

  it('can be disabled', () => {
    localStorage.setItem('vp:volume', '0.2');
    const { player } = createTestPlayer({ plugins: [memoryPlugin()], memory: false });
    expect(player.state.volume).toBe(1);
  });

  it('survives a localStorage getter that throws (sandboxed iframe)', () => {
    const spy = vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { player } = createTestPlayer({ plugins: [memoryPlugin()], cuid: 'x' });
    player.command('setVolume', 0.4);
    expect(player.state.volume).toBe(0.4);
    expect(error).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('survives a throwing storage', async () => {
    const storage = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    } as unknown as Storage;
    const { player } = createTestPlayer({ plugins: [memoryPlugin({ storage })], source: 'a.mp4' });
    await flush();
    player.command('setVolume', 0.5);
    expect(player.state.volume).toBe(0.5);
  });
});

describe('memoryPlugin position', () => {
  it('saves every 5 seconds and on pause, and clears on end', async () => {
    const { player, media } = createTestPlayer({ plugins: [memoryPlugin()], cuid: 'v1', source: 'a.mp4' });
    await flush();
    media.setDuration(100);
    media.timeTo(12);
    expect(JSON.parse(localStorage.getItem('vp:t:v1')!)).toEqual({ t: 12, d: 100 });
    media.timeTo(14);
    expect(JSON.parse(localStorage.getItem('vp:t:v1')!).t).toBe(12);
    media.timeTo(18);
    expect(JSON.parse(localStorage.getItem('vp:t:v1')!).t).toBe(18);
    await player.play();
    media.timeTo(19);
    player.pause();
    expect(JSON.parse(localStorage.getItem('vp:t:v1')!).t).toBe(19);
    media.end();
    expect(localStorage.getItem('vp:t:v1')).toBeNull();
  });

  it('restores a saved position through the source transform', async () => {
    localStorage.setItem('vp:t:v2', JSON.stringify({ t: 30, d: 100 }));
    const { fp } = createTestPlayer({ plugins: [memoryPlugin()], cuid: 'v2', source: 'a.mp4' });
    await flush();
    expect(fp.loads[0]!.start).toBe(30);
  });

  it('does not restore near the end', async () => {
    localStorage.setItem('vp:t:v3', JSON.stringify({ t: 95, d: 100 }));
    const { fp } = createTestPlayer({ plugins: [memoryPlugin()], cuid: 'v3', source: 'a.mp4' });
    await flush();
    expect(fp.loads[0]!.start).toBe(0);
  });

  it('keys by page, player id and source without cuid, and setCuid switches the key', async () => {
    const { player, media } = createTestPlayer({ plugins: [memoryPlugin()], source: 'a.mp4' });
    await flush();
    media.setDuration(100);
    media.timeTo(20);
    expect(localStorage.getItem(`vp:t:h${fnv1a(`${location.pathname}#p#a.mp4`)}`)).not.toBeNull();
    expect(Object.keys(localStorage).some((k) => k.includes('a.mp4'))).toBe(false);
    player.command('setCuid', 'custom');
    expect(player.state.cuid).toBe('custom');
    expect(player.api('cuid')).toBe('custom');
  });

  it('does not save live streams', async () => {
    const { media } = createTestPlayer({ plugins: [memoryPlugin()], cuid: 'live', source: 'a.m3u8' });
    await flush();
    media.setDuration(Infinity);
    media.timeTo(50);
    expect(localStorage.getItem('vp:t:live')).toBeNull();
  });
});

describe('memoryPlugin bounded storage', () => {
  it('keeps only the most recent positions', async () => {
    for (const id of ['c1', 'c2', 'c3']) {
      const { media } = createTestPlayer({ plugins: [memoryPlugin({ maxPositions: 2 })], cuid: id, source: 'a.mp4' });
      await flush();
      media.setDuration(100);
      media.timeTo(20);
    }
    expect(localStorage.getItem('vp:t:c1')).toBeNull();
    expect(localStorage.getItem('vp:t:c2')).not.toBeNull();
    expect(localStorage.getItem('vp:t:c3')).not.toBeNull();
    expect(JSON.parse(localStorage.getItem('vp:t:index')!)).toEqual(['vp:t:c2', 'vp:t:c3']);
  });

  it('drops an ended position from the index', async () => {
    const { media } = createTestPlayer({ plugins: [memoryPlugin()], cuid: 'e1', source: 'a.mp4' });
    await flush();
    media.setDuration(100);
    media.timeTo(20);
    expect(JSON.parse(localStorage.getItem('vp:t:index')!)).toEqual(['vp:t:e1']);
    media.end();
    expect(JSON.parse(localStorage.getItem('vp:t:index')!)).toEqual([]);
  });

  it('treats a corrupt index as empty', async () => {
    localStorage.setItem('vp:t:index', '{not json');
    const { media } = createTestPlayer({ plugins: [memoryPlugin()], cuid: 'k1', source: 'a.mp4' });
    await flush();
    media.setDuration(100);
    media.timeTo(20);
    expect(JSON.parse(localStorage.getItem('vp:t:index')!)).toEqual(['vp:t:k1']);
    localStorage.setItem('vp:t:index', '{"a":1}');
    media.timeTo(30);
    expect(JSON.parse(localStorage.getItem('vp:t:index')!)).toEqual(['vp:t:k1']);
  });
});
