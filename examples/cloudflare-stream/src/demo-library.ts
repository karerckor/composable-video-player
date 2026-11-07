import type { VideoConfig } from './shared.js';

const streamOrigin = 'https://customer-rhnwzxvb3mg4wz3v.cloudflarestream.com';
// Public Cloudflare TV recordings. Dates/titles/IDs come from each source's VideoObject metadata.
// Chapters are editorial navigation aids; captions are fetched fresh from Stream, never copied here.
export const demoVideos: VideoConfig[] = [
  {
    slug: 'stream-live', streamId: '76bd901a132a16dab445feabb5fca304',
    title: 'Live streaming with Cloudflare Stream', category: 'Video & media',
    description: 'A conversation with the Stream team about live video, application APIs, broadcasting and latency.',
    sourceUrl: 'https://cloudflare.tv/event/live-streaming-with-cloudflare-stream/2aX5E8Zb', recordedAt: '2021-09-30', duration: 1800,
    chapters: [{ time: 8, title: 'Meet the Stream team' }, { time: 685, title: 'Building live video into your app' }, { time: 941, title: 'Latency and delivery' }, { time: 1462, title: 'Broadcasting with OBS' }],
  },
  {
    slug: 'local-first-development', streamId: '3a869d980e70de48f95e089235cf80b3',
    title: 'Making local development faster', category: 'Developer tools',
    description: 'How Wrangler, Miniflare and the Workers runtime come together for local development and quicker feedback.',
    sourceUrl: 'https://cloudflare.tv/shows/developer-week/developer-week-remove-friction-and-obstacles-for-developers/Ya0Gqxvn', recordedAt: '2023-05-17', duration: 1740,
    chapters: [{ time: 0, title: 'Meet the developer tools team' }, { time: 72, title: 'Wrangler and local-first development' }, { time: 115, title: 'Remote versus local environments' }, { time: 300, title: 'Using the Workers runtime locally' }, { time: 331, title: 'Faster startup and reloads' }, { time: 551, title: 'Community feedback' }],
  },
  {
    slug: 'r2-storage-and-ai', streamId: '16684663b263e7f6c090b347bb24c4e5',
    title: 'R2: storage, AI and moving your data', category: 'Storage & data',
    description: 'The R2 team discusses object storage, AI partnerships, customer use cases and making migration easier.',
    sourceUrl: 'https://cloudflare.tv/shows/developer-week/developer-week-what-s-new-with-r2/BZO4qzNg', recordedAt: '2023-05-16', duration: 1726,
    chapters: [{ time: 14, title: 'Introductions' }, { time: 77, title: 'What is R2?' }, { time: 565, title: 'AI and compute partnerships' }, { time: 1071, title: 'Customer use cases' }, { time: 1285, title: 'Migrating data to R2' }, { time: 1457, title: 'Developer community and feedback' }],
  },
  {
    slug: 'cloudflare-images', streamId: 'ba19e3bc1e7f7446809585e535218f65',
    title: 'How Cloudflare Images works', category: 'Video & media',
    description: 'An engineering conversation about image resizing, formats, variants and the infrastructure behind image delivery.',
    sourceUrl: 'https://cloudflare.tv/event/speed-week-cloudflare-images/2aXNp1gb', recordedAt: '2021-09-15', duration: 1800,
    chapters: [{ time: 8, title: 'Meet the Images team' }, { time: 335, title: 'Image resizing and delivery' }, { time: 513, title: 'Image formats and compression' }, { time: 665, title: 'Variants and transformations' }, { time: 904, title: 'Rust and Workers under the hood' }, { time: 1585, title: 'Uploading and getting started' }],
  },
  {
    slug: 'developer-week-deep-dives', streamId: 'a2204d9a14bf8cb2c96ee29471abadbe',
    title: 'Developer Week: AI, databases and deep dives', category: 'Storage & data',
    description: 'A recorded overview connecting D1, Hyperdrive, Workers AI and the wider developer platform.',
    sourceUrl: 'https://cloudflare.tv/this-week-in-net/developer-week-2024-edition-ai-ga-and-deep-dives/AZEkA8v6', recordedAt: '2024-04-09', duration: 1558,
    chapters: [{ time: 12, title: 'Developer Week overview' }, { time: 304, title: 'Technical deep dives' }, { time: 529, title: 'D1 and data' }, { time: 624, title: 'Hyperdrive and existing databases' }, { time: 734, title: 'Workers AI' }, { time: 777, title: 'Hugging Face integration' }],
  },
  {
    slug: 'launchpad-demo-day', streamId: 'eafb8bd3243d76b0eca12a0f743f49d4',
    title: 'What people build: Launchpad Demo Day', category: 'Developer tools',
    description: 'Founders demonstrate products built on Workers: AI applications, developer tools, infrastructure and more.',
    sourceUrl: 'https://cloudflare.tv/shows/workers-launchpad-demo-day/workers-launchpad-demo-day-cohort-4/ea8GGOGv', recordedAt: '2025-03-06', duration: 4979,
    chapters: [{ time: 7, title: 'Welcome to Demo Day' }, { time: 113, title: 'Founder presentations begin' }, { time: 364, title: 'More product demonstrations' }, { time: 1873, title: 'Security and infrastructure' }, { time: 3787, title: 'AI for content workflows' }],
  },
].map(video => ({ ...video, poster: `${streamOrigin}/${video.streamId}/thumbnails/thumbnail.jpg?time=35s` }));

export const demoSource = (video: VideoConfig) => `${streamOrigin}/${video.streamId}/manifest/video.m3u8`;
