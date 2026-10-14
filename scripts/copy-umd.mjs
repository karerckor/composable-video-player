// Ships the UMD bundle a second time as dist/player.umd.js: static hosts and CDNs serve `.cjs`
// with a MIME type browsers refuse for <script> under `X-Content-Type-Options: nosniff`.
// The source map comment keeps pointing at player.umd.cjs.map, which sits next to both files.
import { copyFileSync } from 'node:fs';

copyFileSync('dist/player.umd.cjs', 'dist/player.umd.js');
