import { createPlayerCore as createPlayer } from '../../src/player.js';
import { installFakeMedia, type FakeMedia } from './fake-media.js';
import { fakeProvider, type FakeProviderOptions } from './fake-provider.js';
import type { PlayerOptions, Plugin } from '../../src/types.js';

/** A real player (composition root) wired to a fake provider and a fake media element. */
export function createTestPlayer(opts: Partial<PlayerOptions> = {}, providerOptions: FakeProviderOptions = {}) {
  document.body.replaceChildren();
  const host = document.createElement('div');
  host.id = 'p';
  document.body.append(host);
  const fp = fakeProvider(providerOptions);
  let media!: FakeMedia;
  // Runs first among plugins, i.e. before `init`, so plugins that restore state on init hit the fake element.
  const providerPlugin: Plugin = {
    name: 'fake-provider',
    setup(ctx) {
      media = installFakeMedia(ctx.video);
      ctx.registerProvider(fp.provider);
    },
  };
  const player = createPlayer({ ...opts, container: host, plugins: [providerPlugin, ...(opts.plugins ?? [])] });
  return { player, media, fp, host };
}
