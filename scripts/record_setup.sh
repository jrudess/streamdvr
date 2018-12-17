#!/bin/bash

cnt=$#
args=("$@")
output="${args[0]}"
url="${args[1]}"
proxyen="${args[2]}"
proxyserver="${args[3]}"
debug="${args[4]}"

loginen=${args[5]}
username=""
password=""
if [ "$loginen" -eq 1 ]; then
    username=${args[6]}
    password=${args[7]}
    counter=8
else
    counter=6
fi

extraargs=" "
while [ $counter -lt $cnt ]; do
    extraargs+="${args[$counter]} "
    let counter=counter+1
done

