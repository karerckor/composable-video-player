import { beforeEach, describe, expect, it, vi } from 'vitest';
import { findThumb, parseThumbnails } from '../../src/plugins/thumbnails/parse';
import { thumbnailsPlugin } from '../../src/plugins/thumbnails';
import { createTestPlayer } from '../helpers/player-harness';
import { flush } from '../helpers/flush';

const VTT = 'WEBVTT\n\n00:00.000 --> 00:05.000\nsprite.jpg#xywh=0,0,160,90\n\n00:05.000 --> 00:10.000\nsprite.jpg#xywh=160,0,160,90\n\n00:10.000 --> 00:15.000\nhttps://cdn.example/full.jpg';

describe('parseThumbnails / findThumb', () => {
  it('parses sprite rectangles and resolves urls against the VTT url', () => {
    const thumbs = parseThumbnails(VTT, 'https://a.com/thumbs/t.vtt');
    expect(thumbs[1]).toEqual({ start: 5, end: 10, url: 'https://a.com/thumbs/sprite.jpg', x: 160, y: 0, w: 160, h: 90 });
    expect(thumbs[2]).toMatchObject({ url: 'https://cdn.example/full.jpg', w: 0, h: 0 });
  });
  it('finds the thumb for a time', () => {
    const thumbs = parseThumbnails(VTT, 'https://a.com/t.vtt');
    expect(findThumb(thumbs, 7)!.x).toBe(160);
    expect(findThumb(thumbs, 0)!.x).toBe(0);
    expect(findThumb(thumbs, 99)).toBeNull();
  });
});

describe('thumbnailsPlugin', () => {
  const fetchMock = vi.fn(async () => new Response(VTT));
  let bus: import('../../src/types').EventBus;
  const grab = { name: 'grab', setup: (ctx: import('../../src/types').PluginContext) => void (bus = ctx.events) };

  beforeEach(() => fetchMock.mockClear());

  const setup = (options: Partial<import('../../src/types').PlayerOptions> = { thumbnails: 'https://a.com/t.vtt' }) => {
    const t = createTestPlayer({ ...options, plugins: [grab, thumbnailsPlugin({ fetch: fetchMock as unknown as typeof fetch })], source: 'a.mp4' });
    const preview = () => t.host.querySelector<HTMLElement>('.vp-thumb')!;
    const image = () => t.host.querySelector<HTMLElement>('.vp-thumb-image')!;
    return { ...t, preview, image };
  };

  it('loads the VTT from the option and shows a sprite preview on hover', async () => {
    const { preview, image, player } = setup();
    await flush();
    expect(fetchMock).toHaveBeenCalledWith('https://a.com/t.vtt');
    expect(preview().classList.contains('vp-hidden')).toBe(true);
    bus.emit('ui:timeline-hover', { time: 7, x: 100, rootX: 110, width: 400 });
    expect(preview().classList.contains('vp-hidden')).toBe(false);
    expect(image().style.backgroundImage).toContain('https://a.com/sprite.jpg');
    expect(image().style.backgroundPosition).toBe('-160px 0px');
    expect(image().style.width).toBe('160px');
    expect(preview().querySelector('.vp-thumb-time')!.textContent).toBe('0:07');
    bus.emit('ui:timeline-leave');
    expect(preview().classList.contains('vp-hidden')).toBe(true);
  });

  it('shows only the time without thumbnails, and setThumbnails loads a new file', async () => {
    const { preview, image, player } = setup({});
    await flush();
    bus.emit('ui:timeline-hover', { time: 3, x: 10, rootX: 10, width: 400 });
    expect(preview().classList.contains('vp-hidden')).toBe(false);
    expect(image().hidden).toBe(true);
    player.command('setThumbnails', 'https://a.com/t.vtt');
    await flush();
    bus.emit('ui:timeline-hover', { time: 3, x: 10, rootX: 10, width: 400 });
    expect(image().hidden).toBe(false);
    player.command('setThumbnails', '');
    bus.emit('ui:timeline-hover', { time: 3, x: 10, rootX: 10, width: 400 });
    expect(image().hidden).toBe(true);
  });
});
