import { describe, expect, it, vi } from 'vitest';
import { mapPlayerjsOptions } from '../../src/compat/options.js';
import { createLogger } from '../../src/core/logger.js';

const log = createLogger(false);

describe('mapPlayerjsOptions', () => {
  it('maps PlayerJS names, 0/1 flags and numbers', () => {
    const out = mapPlayerjsOptions(
      {
        id: 'player',
        file: '[720p]a.mp4',
        poster: 'p.jpg',
        title: 'T',
        autoplay: 1,
        loop: '0',
        volume: '0.5',
        start: 10,
        end: -5,
        ratio: '4:3',
        default_quality: 'max',
        forbidden_quality: '1080p',
        qualities: '480p,720p',
        default_audio: 'Ru',
        rename_audio: { 0: 'Русский' },
        default_speed: '1.25',
        default_subtitle: 'En',
        subtitle: '[En]en.vtt',
        subtitle_start: 0,
        subshift: '-5',
        thumbnails: 't.vtt',
        autonext: 0,
        playlistloop: 1,
        plstart: 's2',
        hideplaylist: 0,
        cuid: 'c1',
        hls: 1,
        hlsconfig: { maxBufferLength: 5 },
        log: 1,
        color1: '#f00',
        color3: '#00f',
      },
      log,
    );
    expect(out).toEqual({
      container: 'player',
      source: '[720p]a.mp4',
      poster: 'p.jpg',
      title: 'T',
      autoplay: true,
      loop: false,
      volume: 0.5,
      start: 10,
      end: -5,
      ratio: '4:3',
      defaultQuality: 'max',
      forbiddenQuality: '1080p',
      qualities: '480p,720p',
      defaultAudio: 'Ru',
      renameAudio: { 0: 'Русский' },
      defaultSpeed: 1.25,
      defaultSubtitle: 'En',
      subtitle: '[En]en.vtt',
      subtitleStart: false,
      subshift: -5,
      thumbnails: 't.vtt',
      autonext: false,
      playlistLoop: true,
      plstart: 's2',
      hidePlaylist: false,
      cuid: 'c1',
      forceType: 'hls',
      hlsConfig: { maxBufferLength: 5 },
      log: true,
      theme: { color1: '#f00', color3: '#00f' },
    });
  });

  it('passes a playlist given as file through unchanged', () => {
    const items = [{ title: 'One', file: 'one.mp4' }];
    expect(mapPlayerjsOptions({ id: 'player', file: items }, log).source).toBe(items);
    const wrapped = { playlist: items };
    expect(mapPlayerjsOptions({ id: 'player', file: wrapped as never }, log).source).toBe(wrapped);
  });

  it('parses hlsconfig given as a JSON string', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(mapPlayerjsOptions({ id: 'p', hlsconfig: '{"maxBufferLength":3}' }, log).hlsConfig).toEqual({ maxBufferLength: 3 });
    expect(mapPlayerjsOptions({ id: 'p', hlsconfig: '{bad' }, log).hlsConfig).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('ignores compat-only keys, warns on unknown keys and requires id', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out = mapPlayerjsOptions({ id: 'p', nocontrols: 1, ready: 'fn', postmessage: 1, postmessageOrigin: 'https://a', mystery: 1 }, log);
    expect(out).toEqual({ container: 'p' });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(() => mapPlayerjsOptions({} as never, log)).toThrow(/id/);
  });

  it('drops non-finite numbers and non-object hlsconfig', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    warn.mockClear();
    const out = mapPlayerjsOptions({ id: 'p', volume: 'abc', start: 'x', hlsconfig: '5' }, log);
    expect(out).toEqual({ container: 'p' });
    expect('volume' in out).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(mapPlayerjsOptions({ id: 'p', hlsconfig: '[1]' }, log).hlsConfig).toBeUndefined();
  });

  it('treats inherited and prototype-like keys as unknown', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    warn.mockClear();
    const input = JSON.parse('{"id":"p","__proto__":{"x":1},"toString":1,"constructor":2}');
    const out = mapPlayerjsOptions(input, log);
    expect(out).toEqual({ container: 'p' });
    expect(warn).toHaveBeenCalledTimes(3);
  });
});
