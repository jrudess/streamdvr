#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null && pwd )"
source $DIR/record_setup.sh

if [ "$debug" -eq "0" ]; then
    debugargs="-Q"
else
    debugargs="-ldebug"
fi

if [ ! -z "$proxyserver" ]; then
    proxyserver="-https-proxy $proxyserver"
fi

streamlink --stream-sorting-excludes live -o "$output" $proxyserver $username $password $extraargs $debugargs "$site" best,best-unfiltered &
record_pid=$!

killarg="-9" # Note: Streamlink does not respond to SIGINT
source $DIR/record_cleanup.sh

