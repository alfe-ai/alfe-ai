#!/bin/bash
# Check if the file 'data/config/repo_config.json' exists; if not, create a blank file.
if [ ! -f "data/config/repo_config.json" ]; then
    mkdir -p data/config
    touch data/config/repo_config.json
fi

SCREEN_NAME="alfeDEV"

clear
git stash
git pull

git --no-pager log -n 3
bash -c "npm install"

# Start local git server daemon if available
GITHOST_SCRIPT="$(dirname "$0")/githost/git-server.sh"
if [ -x "$GITHOST_SCRIPT" ]; then
    echo "Starting local git server daemon..."
    sudo "$GITHOST_SCRIPT" start-daemon || echo "git-server start-daemon failed or requires sudo"
fi

while true; do
    echo "Starting webserver..."
    node executable/server_webserver.js
    EXIT_CODE=$?
    echo "Webserver exited with code ${EXIT_CODE}. Restarting in 2 seconds..."
    sleep 2
done
