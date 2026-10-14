import { createPlayer, formatTime, type LayoutNode, type Player, type ThemeVars } from '../src/index.js';

type Track = (id: string, player: Player) => void;
type ThemeKey = keyof ThemeVars;

const VIDEO = 'assets/video-720.webm or assets/video-720.mp4';

// Shared overlay pieces: every layout below still wants loading/error feedback.
const feedback: LayoutNode[] = [
  { type: 'buffering', anchor: 'center', hide: ['not-waiting'] },
  { type: 'error-overlay', anchor: 'center', hide: ['not-error'] },
];

// ---------- 7. Layout gallery ----------

/** Play, timeline and fullscreen in a single row; nothing else. */
const minimalLayout: LayoutNode = {
  type: 'root',
  children: [
    { type: 'media-click-layer' },
    { type: 'overlay', children: [...feedback, { type: 'big-play', anchor: 'center', hide: ['started', 'error'] }] },
    {
      type: 'toolbar',
      hide: ['idle'],
      children: [{ type: 'group', direction: 'row', children: [{ type: 'play' }, { type: 'timeline', flex: 1, margin: '0 8' }, { type: 'fullscreen' }] }],
    },
  ],
};

/** Touch-style: big centered transport, settings in the corner, thin timeline at the bottom. */
const mobileLayout: LayoutNode = {
  type: 'root',
  children: [
    { type: 'media-click-layer' },
    {
      type: 'overlay',
      children: [
        ...feedback,
        { type: 'title', anchor: 'top-left', hide: ['idle'] },
        {
          type: 'group',
          direction: 'row',
          anchor: 'center',
          className: 'demo-pill',
          hide: ['idle', 'error'],
          children: [
            { type: 'text', text: '−10', action: 'api:seek,-10', hint: '−10 s', className: 'vp-button' },
            { type: 'play', scale: 1.6, margin: '0 14' },
            { type: 'text', text: '+10', action: 'api:seek,+10', hint: '+10 s', className: 'vp-button' },
          ],
        },
        { type: 'group', direction: 'row', anchor: 'top-right', hide: ['idle'], children: [{ type: 'settings', hide: ['no-menus'] }, { type: 'fullscreen' }] },
      ],
    },
    {
      type: 'toolbar',
      hide: ['idle'],
      children: [{ type: 'group', direction: 'row', children: [{ type: 'time' }, { type: 'timeline', flex: 1, margin: '0 8' }, { type: 'duration' }] }],
    },
  ],
};

/** Desktop-app style: an always-visible solid bar with the timeline inline. */
const classicLayout: LayoutNode = {
  type: 'root',
  children: [
    { type: 'media-click-layer' },
    { type: 'overlay', children: [...feedback, { type: 'big-play', anchor: 'center', hide: ['started', 'error'] }] },
    {
      type: 'toolbar',
      className: 'demo-solid-bar',
      children: [
        {
          type: 'group',
          direction: 'row',
          children: [
            { type: 'play' },
            { type: 'mute' },
            { type: 'text', text: '{time}', margin: '0 6' },
            { type: 'timeline', flex: 1 },
            { type: 'text', text: '{duration}', margin: '0 6' },
            { type: 'settings', hide: ['no-menus'] },
            { type: 'fullscreen' },
          ],
        },
      ],
    },
  ],
};

function setupLayouts(track: Track) {
  track('l-minimal', createPlayer({ container: 'p-l-minimal', source: VIDEO, layout: minimalLayout }));
  track('l-mobile', createPlayer({ container: 'p-l-mobile', source: VIDEO, title: 'Mobile', layout: mobileLayout }));
  track(
    'l-classic',
    createPlayer({ container: 'p-l-classic', source: VIDEO, layout: classicLayout, theme: { toolbarBg: '#27272a', color1: '#22c55e', radius: '3px' } }),
  );

  // Headless: no built-in UI at all, the page drives the player through the public API.
  const headless = createPlayer({ container: 'p-l-headless', source: VIDEO, layout: false });
  track('l-headless', headless);
  const status = document.getElementById('headless-status')!;
  const render = () => {
    const s = headless.state;
    status.textContent = `${s.status} · ${formatTime(s.currentTime, s.duration)} / ${formatTime(s.duration)} · ${s.muted ? 'muted' : `vol ${Math.round(s.volume * 100)}%`}`;
  };
  for (const event of ['time', 'play', 'pause', 'end', 'volume', 'mute', 'unmute', 'metadata'] as const) headless.on(event, render);
  render();
  document.querySelectorAll<HTMLButtonElement>('[data-headless]').forEach((button) => {
    button.addEventListener('click', () => {
      const [command, arg] = button.dataset.headless!.split(',');
      headless.api(command!, arg);
    });
  });
}

// ---------- 8. Theme builder ----------

const PRESETS: Record<string, Partial<ThemeVars>> = {
  default: {},
  light: {
    color1: '#2563eb',
    color2: '#18181b',
    color3: 'rgba(255, 255, 255, 0.96)',
    toolbarBg: 'linear-gradient(to top, rgba(255, 255, 255, 0.92), rgba(255, 255, 255, 0))',
    subColor: '#18181b',
    subBg: 'rgba(255, 255, 255, 0.85)',
  },
  neon: {
    color1: '#22d3ee',
    color2: '#f0abfc',
    color3: 'rgba(24, 6, 48, 0.95)',
    toolbarBg: 'linear-gradient(to top, rgba(76, 29, 149, 0.85), rgba(76, 29, 149, 0))',
    radius: '14px',
    timelineHeight: '6px',
    subColor: '#f0abfc',
  },
  retro: {
    color1: '#f59e0b',
    color2: '#fde68a',
    color3: 'rgba(41, 24, 10, 0.96)',
    toolbarBg: 'linear-gradient(to top, rgba(41, 24, 10, 0.9), rgba(41, 24, 10, 0))',
    font: "'Courier New', ui-monospace, monospace",
    radius: '0px',
    timelineHeight: '8px',
    subColor: '#fde68a',
    subBg: 'rgba(41, 24, 10, 0.85)',
  },
};

/** Same naming rule as the `theme` option: color1 → --vp-color-1, toolbarBg → --vp-toolbar-bg. */
const cssVar = (key: ThemeKey) => `--vp-${key.replace(/([A-Z])/g, '-$1').replace(/(\d+)/g, '-$1').toLowerCase()}`;

/** Best-effort conversion for <input type="color">, which only accepts #rrggbb. */
function toHex(value: string): string {
  if (/^#[0-9a-f]{6}$/i.test(value)) return value;
  const short = value.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  const rgb = value.match(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/);
  return rgb ? `#${rgb.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, '0')).join('')}` : '#000000';
}

function setupThemeBuilder(track: Track) {
  const player = createPlayer({ container: 'p-theme', source: VIDEO, title: 'Theme builder', subtitle: '[English]assets/en.vtt', defaultSubtitle: 'English' });
  track('theme', player);

  // Defaults come from the stylesheet itself, so the demo never drifts from player.css.
  const keys: ThemeKey[] = ['color1', 'color2', 'color3', 'toolbarBg', 'radius', 'iconSize', 'timelineHeight', 'fontSize', 'font', 'subColor', 'subBg', 'subSize'];
  const computed = getComputedStyle(player.root);
  const defaults = Object.fromEntries(keys.map((k) => [k, computed.getPropertyValue(cssVar(k)).trim()])) as Partial<ThemeVars>;
  let theme: Partial<ThemeVars> = { ...defaults };

  const inputs = [...document.querySelectorAll<HTMLInputElement>('#theme-controls [data-key]')];
  const code = document.getElementById('theme-code')!;

  function apply() {
    const changed: Partial<ThemeVars> = {};
    for (const key of keys) {
      const value = theme[key];
      if (value === undefined || value === defaults[key]) {
        player.root.style.removeProperty(cssVar(key));
      } else {
        player.root.style.setProperty(cssVar(key), value);
        changed[key] = value;
      }
    }
    for (const input of inputs) {
      const value = theme[input.dataset.key as ThemeKey] ?? '';
      input.value = input.type === 'color' ? toHex(value) : String(parseFloat(value) || 0);
    }
    const lines = Object.entries(changed).map(([k, v]) => `  ${k}: ${JSON.stringify(v)},`);
    code.textContent = lines.length ? `theme: {\n${lines.join('\n')}\n}` : 'theme: {} // defaults';
  }

  document.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((button) => {
    button.addEventListener('click', () => {
      theme = { ...defaults, ...PRESETS[button.dataset.preset!] };
      apply();
    });
  });
  for (const input of inputs) {
    input.addEventListener('input', () => {
      const key = input.dataset.key as ThemeKey;
      theme = { ...theme, [key]: input.type === 'color' ? input.value : `${input.value}${input.dataset.unit ?? ''}` };
      apply();
    });
  }
  apply();
}

export function setupCustomization(track: Track): void {
  setupLayouts(track);
  setupThemeBuilder(track);
}
