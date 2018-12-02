#!/bin/bash
source scripts/record_setup.sh

debugargs=$([ "$debug" = 1 ] && echo "" || echo "-v fatal")

ffmpeg -hide_banner -i $url -c copy -vsync 2 -r 60 -b:v 500k $extraargs $debugargs $output &
record_pid=$!

killarg="-INT"
source scripts/record_cleanup.sh

