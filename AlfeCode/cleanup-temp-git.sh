#!/usr/bin/env bash

set -euo pipefail

TARGET_DIR="/git/sterling"

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <cutoff-date>" >&2
  echo "Example: $0 2024-01-31" >&2
  exit 1
fi

cutoff_date="$1"

if ! date -d "$cutoff_date" >/dev/null 2>&1; then
  echo "Invalid cutoff date: $cutoff_date" >&2
  exit 1
fi

if [[ ! -d "$TARGET_DIR" ]]; then
  echo "Target directory $TARGET_DIR does not exist." >&2
  exit 1
fi

find "$TARGET_DIR" -mindepth 1 -maxdepth 1 -type d ! -newermt "$cutoff_date" -print -exec rm -rf {} +
