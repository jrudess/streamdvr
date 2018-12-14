#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null && pwd )"
source $DIR/record_setup.sh

debugargs=$([ "$debug" = 1 ] && echo "" || echo "-v fatal")

ffmpeg -hide_banner -i $url -c copy -vsync 2 -r 60 -b:v 500k $extraargs $debugargs "$output" &
record_pid=$!

killarg="-2"
source $DIR/record_cleanup.sh

