import { createIconButton, createPlayer, defaultLayout, defaultPlugins, type LayoutNode, type Player, type Plugin } from '../src/index';

const both = (name: string) => `assets/${name}.webm or assets/${name}.mp4`;
const players: Record<string, Player> = {};
const logEl = document.getElementById('log')!;

function log(player: string, event: string, data: unknown) {
  const line = document.createElement('div');
  const name = document.createElement('b');
  name.textContent = `${player} ${event}`;
  line.append(`${new Date().toLocaleTimeString()} `, name, data === undefined ? '' : ` ${JSON.stringify(data)}`);
  logEl.prepend(line);
  while (logEl.childElementCount > 200) logEl.lastElementChild!.remove();
}

function track(id: string, player: Player) {
  players[id] = player;
  for (const event of ['new', 'metadata', 'play', 'pause', 'seek', 'quality', 'audiotrack', 'subtitle', 'speed', 'error', 'loaderror', 'end', 'playlist', 'next', 'previous'] as const) {
    player.on(event, (data: unknown) => log(id, event, data));
  }
}

// 1. Qualities + subtitles + thumbnails
track(
  'basic',
  createPlayer({
    container: 'p-basic',
    source: `[360p]${both('video-360')},[720p]${both('video-720')}`,
    title: 'Test pattern — 360p / 720p',
    subtitle: '[English]assets/en.vtt,[Русский]assets/ru.srt',
    thumbnails: 'assets/thumbs.vtt',
    cuid: 'demo-basic',
  }),
);

// 2. Audio tracks
track(
  'audio',
  createPlayer({
    container: 'p-audio',
    source: `[720p]{English}${both('video-720')};{Русский}${both('video-720-ru')}`,
    title: 'Audio tracks',
  }),
);

// 3. HLS
const hls = createPlayer({ container: 'p-hls', source: 'assets/hls/master.m3u8', title: 'HLS' });
track('hls', hls);
document.querySelectorAll<HTMLButtonElement>('[data-hls]').forEach((b) => b.addEventListener('click', () => hls.api('play', b.dataset.hls)));

// 4. Playlist
track('playlist', createPlayer({ container: 'p-playlist', source: 'assets/playlist.json', hidePlaylist: false }));

// 5. Custom plugin + layout + theme
const skipPlugin: Plugin = {
  name: 'skip10',
  setup(ctx) {
    ctx.registerComponent('skip10', (ui) => {
      const button = createIconButton(ui, 'vp-skip10', () => ui.user('seek', '+10'));
      button.setIcon('next');
      button.setLabel('+10 s');
      return { el: button.el };
    });
  },
};

const customLayout: LayoutNode = structuredCloneLayout(defaultLayout);
const controls = (customLayout.children![2]!.children![1]!.children ??= []);
controls.splice(1, 0, { type: 'text', text: '−10', action: 'api:seek,-10', hint: '−10 s', className: 'vp-button' }, { type: 'skip10' });
controls.push({ type: 'text', text: 'Custom', anchor: undefined, color: '#facc15', margin: '0 6' });

track(
  'custom',
  createPlayer({
    container: 'p-custom',
    source: both('video-360'),
    title: 'Custom layout + plugin',
    plugins: [...defaultPlugins(), skipPlugin],
    layout: customLayout,
    theme: { color1: '#facc15', color3: 'rgba(30, 27, 75, 0.95)', radius: '12px' },
    ratio: '21:9',
  }),
);

// 6. Fallback and errors
track('fallback', createPlayer({ container: 'p-fallback', source: `assets/missing.mp4 or ${both('video-360')}`, title: 'Fallback' }));
track('error', createPlayer({ container: 'p-error', source: 'assets/missing.mp4', title: 'Error' }));

function structuredCloneLayout(node: LayoutNode): LayoutNode {
  return JSON.parse(JSON.stringify(node)) as LayoutNode;
}

Object.assign(window, { players });
