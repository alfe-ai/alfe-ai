#!/bin/bash
set -euo pipefail

# Check if the file 'data/config/repo_config.json' exists; if not, create a blank file.
if [ ! -f "data/config/repo_config.json" ]; then
    mkdir -p data/config
    touch data/config/repo_config.json
fi

SCREEN_NAME="alfeDEV"

clear
git stash || true
git pull

git --no-pager log -n 3
bash -c "npm install"

# --- Ensure qwen is on PATH (npm 9/10 may not support `npm bin`) ---
# Global executables are linked into {prefix}/bin on Unix-like systems. :contentReference[oaicite:1]{index=1}
NPM_PREFIX="$(npm prefix -g 2>/dev/null || npm config get prefix 2>/dev/null || true)"
NPM_GBIN=""
if [ -n "${NPM_PREFIX}" ] && [ -d "${NPM_PREFIX}/bin" ]; then
  NPM_GBIN="${NPM_PREFIX}/bin"
  case ":$PATH:" in
    *":${NPM_GBIN}:"*) : ;;
    *) export PATH="${NPM_GBIN}:$PATH" ;;
  esac
fi

echo "=== qwen debug ==="
echo "npm_version=$(npm -v 2>/dev/null || echo 'unknown')"
echo "npm_prefix_g=${NPM_PREFIX:-<empty>}"
echo "npm_global_bin=${NPM_GBIN:-<missing>}"
echo "PATH=$PATH"
echo -n "qwen_path="; command -v qwen || echo "<not found>"

if command -v qwen >/dev/null 2>&1; then
  echo -n "qwen_version="; qwen --version || qwen -v || true
else
  echo "ERROR: qwen CLI not found on PATH"
  echo "Hints:"
  echo "  - qwen comes from global npm install of @qwen-code/qwen-code :contentReference[oaicite:2]{index=2}"
  echo "  - ensure ${NPM_PREFIX}/bin exists and contains qwen (or install globally for this user)"
  echo "Directory listing for ${NPM_PREFIX}/bin (if present):"
  ls -la "${NPM_PREFIX}/bin" 2>/dev/null || true
  exit 127
fi
echo "=================="

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
