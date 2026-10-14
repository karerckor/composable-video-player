#!/usr/bin/env bash
# Packs the library (dist must be built) and typechecks a tiny ESM consumer against the shipped
# typings under moduleResolution nodenext and bundler. Guards against extensionless relative
# imports in dist/types, which nodenext consumers can't resolve (TS2834).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TSC="$ROOT/node_modules/.bin/tsc"
[ -f "$ROOT/dist/types/index.d.ts" ] || { echo "dist/types missing: run npm run build first" >&2; exit 1; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

TARBALL="$(cd "$ROOT" && npm pack --silent --pack-destination "$TMP" | tail -n 1)"
APP="$TMP/consumer"
mkdir -p "$APP"
cd "$APP"

cat > package.json <<'JSON'
{ "name": "consumer", "private": true, "type": "module" }
JSON
npm install --offline --no-audit --no-fund --no-package-lock --silent "$TMP/$TARBALL"

cat > index.ts <<'TS'
import { createPlayer, playlistPlugin, type PlayerOptions, type PlaylistItem } from 'composable-video-player';

const items: PlaylistItem[] = [{ title: 'One', file: 'one.mp4' }];
// Plugin-augmented options must be visible (and typed, not `any`).
const options: PlayerOptions = { container: 'player', autonext: false, thumbnails: 'thumbs.vtt', plugins: [playlistPlugin()] };
// @ts-expect-error autonext is a boolean
const wrong: PlayerOptions = { container: 'player', autonext: 'yes' };
const player = createPlayer(options);
player.command('setPlaylist', items);
export { player, wrong };
TS

for resolution in nodenext bundler; do
  module=$([ "$resolution" = nodenext ] && echo nodenext || echo esnext)
  cat > "tsconfig.$resolution.json" <<JSON
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "$module",
    "moduleResolution": "$resolution",
    "strict": true,
    "skipLibCheck": false,
    "noEmit": true,
    "types": []
  },
  "files": ["index.ts"]
}
JSON
  echo "typecheck consumer (moduleResolution: $resolution)"
  "$TSC" -p "tsconfig.$resolution.json"
done
echo "consumer typecheck passed"
