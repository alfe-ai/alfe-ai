#!/usr/bin/env bash
set -euo pipefail
TMP_DIR="/git/tmp"
SSH_HOST="127.0.0.1"
SSH_PORT_FILE="${TMP_DIR}/last_qemu_ssh_port"

if [[ ! -f "$SSH_PORT_FILE" ]]; then
  echo "SSH port file not found: $SSH_PORT_FILE" >&2
  echo "Make sure you started the VM with run-qemu-local.sh" >&2
  exit 1
fi
SSH_PORT=$(cat "$SSH_PORT_FILE")

# Wait for SSH to be ready
TRIES=0
MAX_TRIES=60
until nc -z "$SSH_HOST" "$SSH_PORT" >/dev/null 2>&1 || [ "$TRIES" -ge "$MAX_TRIES" ]; do
  printf "."
  sleep 1
  TRIES=$((TRIES+1))
done
if [ "$TRIES" -ge "$MAX_TRIES" ]; then
  echo "\nTimed out waiting for SSH on ${SSH_HOST}:${SSH_PORT}" >&2
  exit 2
fi

# Try to SSH (allow user to pass additional ssh args)
exec ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -p "$SSH_PORT" "$@" "root@${SSH_HOST}"
