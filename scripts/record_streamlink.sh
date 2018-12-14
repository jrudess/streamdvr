#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null && pwd )"
source $DIR/record_setup.sh

debugargs=$([ "$debug" = 1 ] && echo "-ldebug" || echo "-Q")
proxyserver=$([ "$proxyen" = 1 ] && echo "-https-proxy ${args[3]}" || echo "")

streamlink --stream-sorting-excludes live -o "$output" $proxyserver $extraargs $debugargs $url best,best-unfiltered &
record_pid=$!

killarg="" # Note: Streamlink does not respond to SIGINT
source $DIR/record_cleanup.sh

