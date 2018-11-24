#!/bin/bash
# Return 0 if streamer is online and m3u8 in stdout
# Return 1 if streamer is offline and print unexpected errors to stdout

args=("$@")
output=${args[0]}
url=${args[1]}
proxyen=${args[2]}       # Note: ffmpeg doesn't natively support proxy, but
proxyserver=${args[3]}   #       the arg-list is constant for all recorders
debug=${args[4]}
extrargs=${@:6}

debugargs=""
if [ "$debug" -ne 0 ]; then
    debugargs="-v fatal"
fi

ffmpeg -hide_banner -i $url -c copy -vsync 2 -r 60 -b:v 500k $extraargs $debugargs $output &
pid=$!

# Forward sigint to recorder, script won't end until it does
trap cleanup INT
function cleanup() {
    kill -INT $pid
}

# Wait for recorder to exit
while ps -p $pid > /dev/null; do sleep 1; done

# Forward recorder return code
wait $pid
exit $?

