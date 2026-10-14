import type { Logger, PlayerOptions, SourceInput, ThemeVars } from '../types.js';
import type { PlaylistItem } from '../plugins/playlist/index.js';

export interface PlayerjsOptions {
  id: string;
  /** A source string, or a playlist (array of items / `{ playlist }` object). */
  file?: string | PlaylistItem[] | { playlist: PlaylistItem[] };
  poster?: string;
  title?: string;
  nocontrols?: 0 | 1 | boolean;
  /** Name of a global function called with the player id after init. */
  ready?: string;
  postmessage?: 0 | 1 | boolean;
  postmessageOrigin?: string;
  [key: string]: unknown;
}

export const flag = (v: unknown) => v === true || v === 1 || v === '1' || v === 'true';
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};
const str = (v: unknown) => String(v);

type Mapper = (value: unknown, out: Partial<PlayerOptions>) => void;
const set =
  <K extends keyof PlayerOptions>(key: K, convert: (v: unknown) => PlayerOptions[K]): Mapper =>
  (value, out) => {
    const converted = convert(value);
    if (converted !== undefined) out[key] = converted;
  };
const color =
  (key: keyof ThemeVars): Mapper =>
  (value, out) => {
    out.theme = { ...out.theme, [key]: String(value) };
  };

/** The only place that knows PlayerJS option names. */
const TABLE: Record<string, Mapper> = {
  id: set('container', str),
  // Playlist arrays/objects pass through for the playlist plugin's load hook.
  file: set('source', (v) => (typeof v === 'object' && v !== null ? (v as SourceInput) : str(v))),
  poster: set('poster', str),
  title: set('title', str),
  // Not PlayerJS options: let compat embeds switch the UI language (default 'ru') and override labels.
  lang: set('lang', (v) => (v === 'en' || v === 'ru' ? v : undefined)),
  i18n: set('i18n', (v) => (typeof v === 'object' && v !== null ? (v as Record<string, string>) : undefined)),
  autoplay: set('autoplay', flag),
  loop: set('loop', flag),
  volume: set('volume', num),
  start: set('start', num),
  end: set('end', num),
  ratio: set('ratio', str),
  default_quality: set('defaultQuality', str),
  forbidden_quality: set('forbiddenQuality', str),
  qualities: set('qualities', str),
  default_audio: set('defaultAudio', str),
  rename_audio: set('renameAudio', (v) => v as Record<string, string>),
  default_speed: set('defaultSpeed', num),
  default_subtitle: set('defaultSubtitle', str),
  subtitle: set('subtitle', str),
  subtitle_start: set('subtitleStart', flag),
  subshift: set('subshift', num),
  thumbnails: set('thumbnails', str),
  autonext: set('autonext', flag),
  playlistloop: set('playlistLoop', flag),
  plstart: set('plstart', str),
  hideplaylist: set('hidePlaylist', flag),
  cuid: set('cuid', str),
  hls: (value, out) => {
    if (flag(value)) out.forceType = 'hls';
  },
  hlsconfig: set('hlsConfig', (v) => {
    let parsed = v;
    if (typeof v === 'string') {
      try {
        parsed = JSON.parse(v);
      } catch {
        console.warn('[vp] Playerjs: hlsconfig is not valid JSON; ignored');
        return undefined;
      }
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      console.warn('[vp] Playerjs: hlsconfig must be an object; ignored');
      return undefined;
    }
    return parsed as Record<string, unknown>;
  }),
  log: set('log', flag),
  color1: color('color1'),
  color2: color('color2'),
  color3: color('color3'),
};

/** Handled by the Playerjs class itself, not mapped to PlayerOptions. */
const COMPAT_ONLY = new Set(['nocontrols', 'ready', 'postmessage', 'postmessageOrigin']);

export function mapPlayerjsOptions(input: PlayerjsOptions, log: Logger): PlayerOptions {
  if (!input || !input.id) throw new Error('[vp] Playerjs: the "id" option is required');
  const out: Partial<PlayerOptions> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || COMPAT_ONLY.has(key)) continue;
    if (Object.prototype.hasOwnProperty.call(TABLE, key)) TABLE[key]!(value, out);
    else log.warn(`Playerjs: unknown option "${key}" ignored`);
  }
  return out as PlayerOptions;
}
