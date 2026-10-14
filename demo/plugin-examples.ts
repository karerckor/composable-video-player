import { createPlayer, defaultLayout, defaultPlugins, formatTime, type LayoutNode, type Player } from '../src/index.js';
import { chapterAt, parseTimecodes, timecodesPlugin } from './plugins/timecodes.js';
import { sharePlugin } from './plugins/share.js';

type Track = (id: string, player: Player) => void;

const TIMECODES = `0:00 Intro
0:05 Red bar
0:10 Green bar
0:16 Blue bar
0:22 Finale`;

export function setupPluginExamples(track: Track): void {
  // Default layout + the plugins' components: chapter name after the duration, share before settings.
  const layout = JSON.parse(JSON.stringify(defaultLayout)) as LayoutNode;
  const controls = layout.children![2]!.children![1]!.children!;
  controls.splice(controls.findIndex((n) => n.type === 'duration') + 1, 0, { type: 'chapter-title' });
  controls.splice(controls.findIndex((n) => n.type === 'settings'), 0, { type: 'share' });

  const player = createPlayer({
    container: 'p-plugins',
    source: 'assets/video-720.webm or assets/video-720.mp4',
    title: 'Plugins: timecodes and share',
    thumbnails: 'assets/thumbs.vtt',
    timecodes: TIMECODES,
    layout,
    plugins: [...defaultPlugins(), timecodesPlugin(), sharePlugin()],
  });
  track('plugins', player);

  // A YouTube-like description: clickable timecodes that follow playback.
  const list = document.getElementById('timecodes')!;
  const items = parseTimecodes(TIMECODES).map((chapter) => {
    const li = document.createElement('li');
    const link = document.createElement('a');
    link.href = `?t=${chapter.time}`;
    link.textContent = formatTime(chapter.time);
    link.addEventListener('click', (e) => {
      e.preventDefault();
      player.command('seek', chapter.time);
      void player.command('play');
    });
    li.append(link, ` ${chapter.label}`);
    list.append(li);
    return { chapter, li };
  });
  player.on('time', (t) => {
    const current = chapterAt(player.state.markers, t);
    for (const { chapter, li } of items) li.classList.toggle('current', chapter.time === current?.time);
  });
}
