#!/bin/bash

cnt=$#
args=("$@")
output="${args[0]}"
url="${args[1]}"
proxyen="${args[2]}"
proxyserver="${args[3]}"
debug="${args[4]}"

extraargs=" "
counter=5
while [ $counter -lt $cnt ]; do
    extraargs+="${args[$counter]} "
    let counter=counter+1
done

