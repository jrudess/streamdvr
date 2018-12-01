#!/bin/bash

# Forward sigint to recorder, script won't end until it does
trap cleanup INT
function cleanup() {
    kill $killarg $record_pid > /dev/null
}

# Wait for recorder to exit
while ps -p $record_pid > /dev/null; do sleep 1; done

# Forward recorder return code
wait $record_pid
exit $?

