import type { Logger, PlayerOptions, ThemeVars } from '../types';

export interface PlayerjsOptions {
  id: string;
  file?: string;
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
const num = (v: unknown) => Number(v);
const str = (v: unknown) => String(v);

type Mapper = (value: unknown, out: Partial<PlayerOptions>) => void;
const set =
  <K extends keyof PlayerOptions>(key: K, convert: (v: unknown) => PlayerOptions[K]): Mapper =>
  (value, out) => {
    out[key] = convert(value);
  };
const color =
  (key: keyof ThemeVars): Mapper =>
  (value, out) => {
    out.theme = { ...out.theme, [key]: String(value) };
  };

/** The only place that knows PlayerJS option names. */
const TABLE: Record<string, Mapper> = {
  id: set('container', str),
  file: set('source', str),
  poster: set('poster', str),
  title: set('title', str),
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
    if (typeof v !== 'string') return v as Record<string, unknown>;
    try {
      return JSON.parse(v) as Record<string, unknown>;
    } catch {
      console.warn('[vp] Playerjs: hlsconfig is not valid JSON; ignored');
      return undefined;
    }
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
    const mapper = TABLE[key];
    if (mapper) mapper(value, out);
    else log.warn(`Playerjs: unknown option "${key}" ignored`);
  }
  return out as PlayerOptions;
}
