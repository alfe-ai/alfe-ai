#!/usr/bin/env bash
set -euo pipefail

MESSAGE=${1:-"Sample test run"}

echo "[meta] Starting Agent runner test script"
echo "[meta] Received message: $MESSAGE"

echo "Simulating streaming output..."
for i in {1..5}; do
  echo "  • Step $i complete"
  sleep 0.5
  if (( i == 3 )); then
    echo "Intermediate update from the test script"
  fi
done

echo "[status] Test script stdout stream finished"

>&2 echo "[stderr] Test script sent a message on stderr"

sleep 0.5
echo "[status] Test script done"
