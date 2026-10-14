#!/usr/bin/env bash
# Generates local demo media into demo/assets (git-ignored). Requires ffmpeg with libx264, libvpx-vp9, libopus.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=assets
mkdir -p "$OUT/hls"
command -v ffmpeg >/dev/null || { echo "ffmpeg not found; the demo falls back to public URLs" >&2; exit 1; }

DUR=30
SRC=(-f lavfi -i "testsrc2=size=1280x720:rate=30:duration=$DUR")
A_EN=(-f lavfi -i "sine=frequency=440:sample_rate=48000:duration=$DUR")
A_RU=(-f lavfi -i "sine=frequency=660:sample_rate=48000:duration=$DUR")
X264=(-c:v libx264 -preset veryfast -pix_fmt yuv420p -c:a aac -b:a 96k -movflags +faststart)
VP9=(-c:v libvpx-vp9 -b:v 0 -crf 40 -deadline realtime -cpu-used 8 -c:a libopus -b:a 64k)

encode() { # name scale audio-input-array-name
  local name=$1 scale=$2; shift 2
  ffmpeg -y -loglevel error "${SRC[@]}" "$@" -vf "scale=$scale" -shortest "${X264[@]}" "$OUT/$name.mp4"
  ffmpeg -y -loglevel error "${SRC[@]}" "$@" -vf "scale=$scale" -shortest "${VP9[@]}" "$OUT/$name.webm"
}

echo "progressive files..."
encode video-360 640:360 "${A_EN[@]}"
encode video-720 1280:720 "${A_EN[@]}"
encode video-720-ru 1280:720 "${A_RU[@]}"

echo "HLS (2 renditions)..."
ffmpeg -y -loglevel error "${SRC[@]}" "${A_EN[@]}" \
  -map 0:v -map 1:a -map 0:v -map 1:a \
  -filter:v:0 scale=640:360 -filter:v:1 scale=1280:720 \
  -c:v libx264 -preset veryfast -pix_fmt yuv420p -b:v:0 800k -b:v:1 2500k -c:a aac -b:a 96k \
  -g 60 -keyint_min 60 -sc_threshold 0 \
  -var_stream_map "v:0,a:0 v:1,a:1" -master_pl_name master.m3u8 \
  -f hls -hls_time 4 -hls_playlist_type vod \
  -hls_segment_type fmp4 -hls_fmp4_init_filename init.mp4 \
  -hls_segment_filename "$OUT/hls/v%v/seg%03d.m4s" "$OUT/hls/v%v/index.m3u8"

echo "thumbnails sprite (every 2 s, 160x90, 5x3)..."
ffmpeg -y -loglevel error "${SRC[@]}" -vf "fps=1/2,scale=160:90,tile=5x3" -frames:v 1 "$OUT/thumbs.jpg"
{
  echo "WEBVTT"
  for i in $(seq 0 14); do
    s=$((i * 2)); e=$((s + 2)); x=$(((i % 5) * 160)); y=$(((i / 5) * 90))
    printf '\n00:00:%02d.000 --> 00:00:%02d.000\nthumbs.jpg#xywh=%d,%d,160,90\n' "$s" "$e" "$x" "$y"
  done
} > "$OUT/thumbs.vtt"

echo "subtitles..."
cat > "$OUT/en.vtt" <<'VTT'
WEBVTT

00:00:01.000 --> 00:00:04.000
Hello! This is a <b>WebVTT</b> subtitle.

00:00:05.000 --> 00:00:09.000
Press <i>F</i> for fullscreen, <i>M</i> to mute.

00:00:10.000 --> 00:00:14.000
Hover the timeline to see thumbnails.
VTT
cat > "$OUT/ru.srt" <<'SRT'
1
00:00:01,000 --> 00:00:04,000
Привет! Это субтитры в формате SRT.

2
00:00:05,000 --> 00:00:09,000
F — полный экран, M — выключить звук.
SRT

echo "playlist..."
cat > "$OUT/playlist.json" <<'JSON'
[
  { "title": "Intro (360p)", "file": "assets/video-360.webm or assets/video-360.mp4", "id": "intro", "thumbnails": "assets/thumbs.vtt" },
  { "title": "Season 1", "folder": [
    { "title": "Episode 1 (720p, subtitles)", "file": "assets/video-720.webm or assets/video-720.mp4", "id": "s1e1", "subtitle": "[English]assets/en.vtt,[Русский]assets/ru.srt" },
    { "title": "Episode 2 (HLS)", "file": "assets/hls/master.m3u8", "id": "s1e2" }
  ]}
]
JSON

ls -la "$OUT" "$OUT/hls"
echo "done"
