#!/usr/bin/env bash
# Downloads the orchestral cover and rebuilds the soundtrack exactly as it was cut in the session.
set -euo pipefail
cd "$(dirname "$0")"

yt-dlp -x --audio-format mp3 -o "red-xiii-theme.%(ext)s" "https://www.youtube.com/watch?v=NxokTTdln-A"

ffmpeg -y -loglevel error -i red-xiii-theme.mp3 -t 29 -c copy sequence-1.mp3
ffmpeg -y -loglevel error -i red-xiii-theme.mp3 -ss 85 -to 108 -c copy sequence-2.mp3
ffmpeg -y -loglevel error -i red-xiii-theme.mp3 -ss 125 -to 175 -c copy sequence-3.mp3

ffmpeg -y -loglevel error -i sequence-1.mp3 -i sequence-2.mp3 -i sequence-3.mp3 \
  -filter_complex "[0][1]acrossfade=d=1.5:c1=tri:c2=tri[a01];[a01][2]acrossfade=d=1.5:c1=tri:c2=tri[out]" \
  -map "[out]" combined-sequences-1.mp3

echo "wrote combined-sequences-1.mp3"
