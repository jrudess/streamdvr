#!/bin/bash

debug=0
extraargs=""
username=""
password=""

while (( "$#" )); do
    case "$1" in
        -d|--debug)
            debug=1
            shift
            ;;
        -o|--output)
            output=$2
            shift 2
            ;;
        -s|--site)
            site=$2
            shift 2
            ;;
        -u|--user)
            username=$2
            shift 2
            ;;
        -p|--password)
            password=$2
            shift 2
            ;;
        -P|--proxy)
            proxyserver=$2
            shift 2
            ;;
        --) # end argument parsing
            shift
            break
            ;;
        -*|--*=) # unsupported flags
            echo "Error: Unsupported flag $1" >&2
            exit 1
            ;;
        *) # preserve other arguments
            extraargs="$PARAMS $1"
            shift
            ;;
    esac
done

