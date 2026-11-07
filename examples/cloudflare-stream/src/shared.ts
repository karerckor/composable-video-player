export interface Chapter { time: number; title: string }
export interface Caption { language: string; label: string; url: string }
export interface VideoConfig {
  slug: string;
  streamId: string;
  title: string;
  description: string;
  category: string;
  chapters?: Chapter[];
  captions?: Caption[];
  sourceUrl?: string;
  recordedAt?: string;
  poster?: string;
  duration?: number;
}
export interface Palette { background: string; surface: string; text: string; muted: string; accent: string }
export interface Branding {
  name: string;
  description: string;
  logo?: string;
  defaultScheme: 'light' | 'dark';
  light: Palette;
  dark: Palette;
  player: { subtitleColor: string; subtitleBackground: string; subtitleSize: string; radius: string };
}
export interface LibraryConfig { demo: boolean; branding: Branding; videos: VideoConfig[] }
export interface LibraryResponse {
  demo: boolean;
  branding: Branding;
  videos: Omit<VideoConfig, 'streamId' | 'captions'>[];
}
export interface PlaybackResponse {
  slug: string;
  source: string;
  poster: string;
  duration: number;
  captions: Caption[];
  captionsUnavailable?: boolean;
}
