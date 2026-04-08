#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${GIT_SERVER_REPO_ROOT:-$(pwd)/data/repositories}"
GIT_DAEMON_HOST="${GIT_DAEMON_LISTEN_HOST:-0.0.0.0}"
GIT_DAEMON_PORT="${GIT_DAEMON_PORT:-9418}"

mkdir -p "$REPO_ROOT"

echo "[GitServer] Starting git-daemon on ${GIT_DAEMON_HOST}:${GIT_DAEMON_PORT}"
exec git daemon \
  --reuseaddr \
  --verbose \
  --base-path="$REPO_ROOT" \
  --export-all \
  --enable=receive-pack \
  --listen="$GIT_DAEMON_HOST" \
  --port="$GIT_DAEMON_PORT"
