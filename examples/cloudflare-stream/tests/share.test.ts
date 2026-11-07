import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { defaultLayout, type LayoutNode, type PluginContext, type Selection, type SourceTransform } from 'composable-video-player';
import { buildShareUrl, sharePlugin, withShareButton } from '../src/plugins/share.js';

describe('custom Share plugin', () => {
  it('creates a whole-video link without an old timestamp or page anchor', () => {
    const url = new URL(buildShareUrl('https://example.com/?video=stream-live&t=80#player-integration', null));
    assert.equal(url.searchParams.get('video'), 'stream-live');
    assert.equal(url.searchParams.has('t'), false);
    assert.equal(url.hash, '');
  });
  it('shares whole seconds including zero, preserving the selected video', () => {
    const base = 'https://example.com/?video=stream-live';
    assert.equal(new URL(buildShareUrl(base, 83.9)).searchParams.get('t'), '83');
    assert.equal(new URL(buildShareUrl(base, 0)).searchParams.get('t'), '0');
    assert.equal(new URL(buildShareUrl(base, 0)).searchParams.get('video'), 'stream-live');
    assert.equal(new URL(buildShareUrl(base, NaN)).searchParams.has('t'), false);
  });
  it('adds a registered toolbar component without changing the default layout', () => {
    const before = JSON.stringify(defaultLayout);
    const layout = withShareButton();
    const find = (node: LayoutNode): LayoutNode | undefined => node.children?.some(child => child.type === 'share') ? node : node.children?.map(find).find(Boolean);
    const group = find(layout);
    assert.ok(group);
    assert.ok(group.children!.findIndex(n => n.type === 'share') < group.children!.findIndex(n => n.type === 'settings'));
    assert.equal(JSON.stringify(defaultLayout), before);
  });
  it('registers a typed command and uses an explicit zero over memory on the first load only', () => {
    const transforms: SourceTransform[] = [];
    const commands = new Map<string, unknown>();
    const components: string[] = [];
    let disposed = 0;
    const ctx = {
      registerComponent: (name: string) => components.push(name),
      commands: { register: (name: string, handler: unknown) => { commands.set(name, handler); return () => { commands.delete(name); }; } },
      addSourceTransform: (transform: SourceTransform) => { transforms.push(transform); return () => { transforms.splice(transforms.indexOf(transform), 1); }; },
      addLayer: () => () => { disposed++; },
    } as unknown as PluginContext;
    const dispose = sharePlugin({ url: () => 'https://example.com/?video=one&t=0' }).setup(ctx);
    assert.ok(commands.has('openShare'));
    assert.ok(components.includes('share') && components.includes('share-panel'));
    assert.equal(transforms.length, 1);
    const selection: Selection = { quality: 0, audio: 0, start: 80 };
    assert.equal(transforms[0]({} as never, selection).start, 0);
    assert.equal(transforms[0]({} as never, selection).start, 80);
    if (typeof dispose === 'function') dispose();
    assert.equal(commands.size, 0);
    assert.equal(transforms.length, 0);
    assert.equal(disposed, 1);
  });
});
