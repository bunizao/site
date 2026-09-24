#!/usr/bin/env bash
# Cuts the sea footer's sounds (public/sillage/sound/) from the CC0 source
# recordings listed in public/sillage/README.md. Needs ffmpeg, and afconvert
# (macOS) for the AAC encode.
#
#   bash scripts/cut-sillage-sound.sh <dir with surf.mp3, bow.mp3, splash/>
#
# surf.m4a   the sea, a seamless loop
# wash.m4a   water along a hull, a seamless loop, played with the sea's speed
# splash.m4a splashes, one per SLOT seconds, each starting LEAD in
set -euo pipefail

src=${1:?source dir}
out=public/sillage/sound
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$out"

SLOT=1
LEAD=0.02
# Takes with a quick attack, darkest first; the page plays the first four for
# a touch and the rest for the small splashes a drag leaves.
SPLASHES=(03 12 14 04 15 06 13)

# A seamless loop from [start, start + len): the last `fade` seconds are
# crossfaded into the first, so the end runs straight into the beginning.
loop() {
  local in=$1 start=$2 len=$3 fade=$4 filters=$5 dest=$6
  local cut=$(awk "BEGIN { print $len - $fade }")
  ffmpeg -hide_banner -loglevel error -y -ss "$start" -t "$len" -i "$in" -filter_complex "
    [0:a]$filters,asplit=3[a][b][c];
    [a]atrim=0:$fade,asetpts=PTS-STARTPTS[head];
    [b]atrim=$fade:$cut,asetpts=PTS-STARTPTS[body];
    [c]atrim=$cut,asetpts=PTS-STARTPTS[tail];
    [tail][head]acrossfade=d=$fade:c1=qsin:c2=qsin[join];
    [join][body]concat=n=2:v=0:a=1[out]" -map '[out]' "$dest"
}

encode() {
  afconvert -f m4af -d aac -b "$2" "$1" "$3"
}

# The surf: skip the edit 14 s in, keep the two waves after it.
loop "$src/surf.mp3" 14.3 27.4 3 "loudnorm=I=-20:TP=-3,aresample=44100" "$tmp/surf.wav"
encode "$tmp/surf.wav" 56000 "$out/surf.m4a"

# The wash: bandpassed, which leaves the water and drops the boat.
loop "$src/bow.mp3" 2 24 2 "aformat=channel_layouts=mono,highpass=f=140,lowpass=f=6500,loudnorm=I=-20:TP=-3,aresample=44100" "$tmp/wash.wav"
encode "$tmp/wash.wav" 40000 "$out/wash.m4a"

# The splashes: leading silence cut, levelled, faded out inside their slot.
list=()
for i in "${SPLASHES[@]}"; do
  ffmpeg -hide_banner -loglevel error -y -i "$src/splash/splash_$i.ogg" -af "
    aformat=channel_layouts=mono:sample_rates=44100,
    silenceremove=start_periods=1:start_threshold=-45dB,
    loudnorm=I=-18:TP=-2,aresample=44100,
    atrim=0:$(awk "BEGIN { print $SLOT - $LEAD }"),afade=t=out:st=$(awk "BEGIN { print $SLOT - $LEAD - 0.25 }"):d=0.25,
    adelay=${LEAD}s:all=1,apad=whole_dur=$SLOT" "$tmp/s$i.wav"
  list+=(-i "$tmp/s$i.wav")
done
ffmpeg -hide_banner -loglevel error -y "${list[@]}" \
  -filter_complex "concat=n=${#SPLASHES[@]}:v=0:a=1" "$tmp/splash.wav"
encode "$tmp/splash.wav" 64000 "$out/splash.m4a"

ls -l "$out"
