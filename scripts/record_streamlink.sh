#!/bin/bash
# Return 0 if streamer is online and m3u8 in stdout
# Return 1 if streamer is offline and print unexpected errors to stdout

cnt=$#
args=("$@")
output=${args[0]}
url=${args[1]}
proxyen=${args[2]}
proxyserver=${args[3]}
debug=${args[4]}

extraargs=" "
if [[ $cnt > 5 ]]; then
    counter=5
    while [ $counter -lt $cnt ]; do
        extraargs+="${args[$counter]} "
        let counter=counter+1
    done
fi

proxyserver=""
if [ "$proxyen" -eq 1 ]; then
    $proxyserver="--https-proxy ${args[2]}"
fi

debugargs="-Q"
if [ "$debug" -eq 1 ]; then
    debugargs="-l debug"
fi

streamlink -o $output $proxyserver $extraargs $url best $debugargs &
pid=$!

# Forward sigint to recorder, script won't end until it does
trap cleanup INT
function cleanup() {
    kill $pid
}

# Wait for streamlink to exit
while ps -p $pid > /dev/null; do sleep 1; done

# Forward recorder return code
wait $pid
exit $?

