import { describe, expect, it, vi } from 'vitest';
import { findIndex, flattenPlaylist, loadPlaylistInput, normalizePlaylist } from '../../src/plugins/playlist/model';

const items = [
  { title: 'Intro', file: 'intro.mp4', id: 'i' },
  {
    title: 'Season 1',
    folder: [
      { title: 'S1E1', file: 's1e1.mp4', id: 's1e1' },
      { title: 'S1E2', file: 's1e2.mp4' },
    ],
  },
  { title: 'No file' },
];

describe('playlist model', () => {
  it('normalizes arrays, {playlist} wrappers and single items', () => {
    expect(normalizePlaylist(items)).toBe(items);
    expect(normalizePlaylist({ playlist: items })).toBe(items);
    expect(normalizePlaylist({ title: 'x', file: 'x.mp4' })).toEqual([{ title: 'x', file: 'x.mp4' }]);
    expect(() => normalizePlaylist(42)).toThrow(/playlist/);
  });

  it('flattens folders depth-first and skips entries without files', () => {
    const flat = flattenPlaylist(items);
    expect(flat.map((f) => f.item.title)).toEqual(['Intro', 'S1E1', 'S1E2']);
    expect(flat.map((f) => f.index)).toEqual([0, 1, 2]);
    expect(flat[1]!.depth).toBe(1);
  });

  it('finds items by index, numeric string or id', () => {
    const flat = flattenPlaylist(items);
    expect(findIndex(flat, 2)).toBe(2);
    expect(findIndex(flat, '1')).toBe(1);
    expect(findIndex(flat, 's1e1')).toBe(1);
    expect(findIndex(flat, 'missing')).toBe(-1);
    expect(findIndex(flat, 9)).toBe(-1);
    const numericIds = flattenPlaylist([{ file: 'a.mp4', id: '7' }, { file: 'b.mp4', id: '0' }]);
    expect(findIndex(numericIds, '7')).toBe(0);
    expect(findIndex(numericIds, '0')).toBe(1);
    expect(findIndex(numericIds, 1)).toBe(1);
  });

  it('loads JSON strings and urls', async () => {
    expect(await loadPlaylistInput(JSON.stringify(items), fetch)).toEqual(items);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ playlist: items })));
    expect(await loadPlaylistInput('https://a.com/pl.txt', fetchMock as unknown as typeof fetch)).toEqual(items);
    expect(fetchMock).toHaveBeenCalledWith('https://a.com/pl.txt');
    const bad = vi.fn(async () => new Response('not json'));
    await expect(loadPlaylistInput('https://a.com/pl.json', bad as unknown as typeof fetch)).rejects.toThrow();
    const missing = vi.fn(async () => new Response('', { status: 404 }));
    await expect(loadPlaylistInput('https://a.com/pl.json', missing as unknown as typeof fetch)).rejects.toThrow(/404/);
  });
});
