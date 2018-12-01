#!/bin/bash
# Return 0 if ffmpeg succeeds, 1 otherwise

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

args=("$@")
input=${args[0]}
output=${args[1]}
filetype=${args[2]}

mp4args=""
if [ "$filetype" = "mp4" ]; then
    mp4args="-bsf:a aac_adtstoasc"
fi

ffmpeg -hide_banner -v fatal -i $input -c copy $mp4args -copyts -start_at_zero $output > $tmp/stdout 2> $tmp/stderr

if [ "$?" -ne 0 ]; then
    # on errors print ffmpeg output for streamdvr to reprint
    cat $tmp/stdout
    cat $tmp/stderr
    exit 1
fi
exit 0
