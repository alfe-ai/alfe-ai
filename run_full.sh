#!/bin/bash

# Usage: run_full.sh [-p]
#   -p : persist previous terminal output (do not clear)

# parse options
persist=false
while getopts ":p" opt; do
  case ${opt} in
    p)
      persist=true
      ;;
    \?)
      ;;
  esac
done
shift $((OPTIND -1))

if [ "$persist" != true ]; then
  clear
fi

git stash
sudo git pull
#git log -n 3
echo "------"
bash -c "cd Aurora && ./run_full.sh"
#git pull
#git log -n 3

