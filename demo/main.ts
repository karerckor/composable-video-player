import { createPlayer } from '../src/index';

// CC0 clips from MDN; webm first, mp4 as `or` fallback (demonstrates the fallback chain).
const FLOWER = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm or https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';

const basic = createPlayer({
  container: 'basic',
  source: FLOWER,
  title: 'Flower (CC0)',
  log: true,
});

const logEl = document.getElementById('basic-log')!;
for (const name of ['init', 'new', 'metadata', 'play', 'pause', 'seek', 'quality', 'error', 'end'] as const) {
  basic.on(name, (data: unknown) => {
    const line = document.createElement('div');
    line.textContent = `${new Date().toLocaleTimeString()}  ${name}  ${data === undefined ? '' : JSON.stringify(data)}`;
    logEl.prepend(line);
  });
}

Object.assign(window, { basic });
