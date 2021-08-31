#!/bin/bash
# Return 0 if streamer is online and m3u8 in stdout, or offline and empty stdout
# Return 1 if there are any unhandled errors from yt-dlp

tmp=$(mktemp -d)
trap 'rm -rf -- "$tmp"' EXIT

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null && pwd )"
source $DIR/record_setup.sh

if [ ! -z "$proxyserver" ]; then
    proxyserver="--proxy $proxyserver"
fi

yt-dlp -g $site $proxyserver $extraargs > $tmp/stdout 2> $tmp/stderr

if [ "$?" -eq 0 ]; then
    # Streamer is online
    cat $tmp/stdout
    exit 0
else
    # good exit code for offline cases
    grep -i "offline" $tmp/stdout > /dev/null 2> /dev/null
    if [ "$?" -eq 0 ]; then
        exit 0
    fi

    grep -i "offline" $tmp/stderr > /dev/null 2> /dev/null
    if [ "$?" -eq 0 ]; then
        exit 0
    fi

    # Error returned by mixer lookups
    grep -i "unable to download json metadata" $tmp/stderr > /dev/null 2> /dev/null
    if [ "$?" -eq 0 ]; then
        echo "$site: Streamer does not exist"
        exit 1
    fi

    # Print the error message to stdout for streamdvr to reprint
    cat $tmp/stdout
    cat $tmp/stderr
    exit 1
fi
