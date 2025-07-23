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

# Ensure we have permission to modify files under the Aurora directory. If
# package-lock.json is not writable, attempt to fix the permissions using sudo.
PKG_LOCK="Aurora/package-lock.json"
if [ ! -w "$PKG_LOCK" ]; then
  echo "package-lock.json is not writable. Attempting to fix with sudo..."
  sudo chown -R $(whoami):$(whoami) "$(dirname "$PKG_LOCK")" || sudo chmod -R u+w "$(dirname "$PKG_LOCK")"
fi

sudo git stash
sudo git pull
#git log -n 3
echo "------"
bash -c "cd Aurora && ./run_full.sh"
#git pull
#git log -n 3

