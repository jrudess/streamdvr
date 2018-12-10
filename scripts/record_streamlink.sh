#!/bin/bash
source scripts/record_setup.sh

debugargs=$([ "$debug" = 1 ] && echo "-ldebug" || echo "-Q")
proxyserver=$([ "$proxyen" = 1 ] && echo "-https-proxy ${args[3]}" || echo "")

streamlink -o "$output" $proxyserver $extraargs $debugargs $url best,best-unfiltered &
record_pid=$!

killarg="" # Note: Streamlink does not respond to SIGINT
source scripts/record_cleanup.sh

