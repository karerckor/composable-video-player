import type { LibraryConfig } from './src/shared.js';

export default {
  // Try the app first. Set false and add your own Stream videos below to publish your library.
  demo: true,
  branding: {
    name: 'Fieldnotes',
    description: 'Conversations on building for the web. Real chapters, real captions, and a place to pick up where you left off.',
    // logo: '/logo.svg', // Put your logo in public/.
    defaultScheme: 'dark',
    light: { background: '#f5f3ee', surface: '#ffffff', text: '#222720', muted: '#666d62', accent: '#547a39' },
    dark: { background: '#141813', surface: '#20261e', text: '#eff2e9', muted: '#a1ac99', accent: '#c3e88d' },
    player: { subtitleColor: '#ffffff', subtitleBackground: 'rgba(0,0,0,0.75)', subtitleSize: '1.3em', radius: '10px' },
  },
  videos: [
    // {
    //   slug: 'getting-started',
    //   streamId: 'YOUR_32_CHARACTER_STREAM_VIDEO_ID',
    //   title: 'Getting started',
    //   description: 'Everything you need to get up and running.',
    //   category: 'Guides',
    //   chapters: [{ time: 0, title: 'Introduction' }, { time: 30, title: 'First steps' }],
    //   captions: [{ language: 'en', label: 'English', url: '/captions/getting-started.vtt' }],
    // },
  ],
} satisfies LibraryConfig;
