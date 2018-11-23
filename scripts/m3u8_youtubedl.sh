#!/bin/bash
# Return 0 if streamer is online and m3u8 in stdout
# Return 1 if streamer is offline and print unexpected errors to stdout

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

args=("$@")
url=${args[0]}
proxyen=${args[1]}
proxyserver=""
if [ "$proxyen" -eq 1 ]; then
    $proxyserver="--proxy ${args[2]}"
fi

youtube-dl -g $url $proxyserver > $tmp/stdout 2> $tmp/stderr

if [ "$?" -eq 0 ]; then
    # Streamer is online
    cat $tmp/stdout
    exit 0
else
    grep -i "offline" $tmp/stdout > /dev/null 2> /dev/null
    if [ "$?" -eq 0 ]; then
        # Print nothing for offline cases, these are expected errors
        exit 1
    fi

    # Print the error message to stdout for streamdvr to reprint
    cat $tmp/stdout
    exit 1
fi
