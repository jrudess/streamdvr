#!/bin/bash
# Return 0 if streamer is online and m3u8 in stdout
# Return 1 if streamer is offline and print unexpected errors to stdout

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null && pwd )"
source $DIR/record_setup.sh

if [ ! -z "$proxyserver" ]; then
    proxyserver="--https-proxy $proxyserver"
fi

streamlink --stream-url $proxyserver $username $password $site best > $tmp/stdout 2> $tmp/stderr

if [ "$?" -eq 0 ]; then
    # Streamer is online, print the m3u8 URL
    cat $tmp/stdout
    exit 0
else

    grep "No plugin" $tmp/stdout > /dev/null 2> /dev/null
    if [ "$?" -eq 0 ]; then
        # This is an offline case for CB
        exit 1
    fi

    grep "No playable streams" $tmp/stdout > /dev/null 2> /dev/null
    if [ "$?" -eq 0 ]; then
        # This is an offline case for twitch/mixer
        exit 1
    fi

    # Print the error message to stdout for streamdvr to reprint
    cat $tmp/stdout
    cat $tmp/stderr
    exit 1
fi
