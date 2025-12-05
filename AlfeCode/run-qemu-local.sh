#!/usr/bin/env bash
set -euo pipefail

SOURCE_IMAGE="/git/ebs-small-shrunk.qcow2"
TMP_DIR="/git/tmp"
HOST_PORT="${1:-8443}"

if ! command -v qemu-system-x86_64 >/dev/null; then
  echo "qemu-system-x86_64 not found" >&2
  exit 1
fi

if [[ ! -f "$SOURCE_IMAGE" ]]; then
  echo "Source image missing: $SOURCE_IMAGE" >&2
  exit 1
fi

# Return 0 if port is free, 1 if in use
is_port_free() {
  python3 - <<PYCODE 2>/dev/null
import socket,sys
p=int(sys.argv[1])
s=socket.socket(socket.AF_INET, socket.SOCK_STREAM)
try:
    s.bind(("", p))
    s.close()
    sys.exit(0)
except OSError:
    sys.exit(1)
PYCODE
}

# If requested host port is privileged (<1024) ensure we're root
if [[ "${HOST_PORT}" =~ ^[0-9]+$ ]]; then
  if [ "$HOST_PORT" -lt 1024 ] && [ "$(id -u)" -ne 0 ]; then
    echo "Host port $HOST_PORT is privileged and requires root. Run with sudo or choose an unprivileged port." >&2
    exit 1
  fi
else
  echo "Invalid host port: $HOST_PORT" >&2
  exit 1
fi

# If the requested host port is in use, pick an available ephemeral port.
if ! is_port_free "$HOST_PORT"; then
  echo "Host port $HOST_PORT appears to be in use; selecting an available port instead..."
  HOST_PORT=$(python3 - <<PYCODE
import socket
s=socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.bind(("", 0))
port = s.getsockname()[1]
s.close()
print(port)
PYCODE
)
  echo "Using host port $HOST_PORT"
fi

timestamp="$(date -u +%Y%m%d-%H%M%S)"
COPY_PATH="${TMP_DIR}/${timestamp}.qcow2"

mkdir -p "$TMP_DIR"
cp -- "$SOURCE_IMAGE" "$COPY_PATH"

cat <<EOF
Copied source image to: $COPY_PATH
Forwarding host port $HOST_PORT to guest 443
Forwarding host port 2222 to guest 22
Starting qemu-system-x86_64
EOF

ssh_port_default=2222
SSH_PORT="${ssh_port_default}"
if ! is_port_free "${SSH_PORT}"; then
  echo "SSH host port ${SSH_PORT} appears to be in use; selecting an available port instead..."
  SSH_PORT=$(python3 - <<PYCODE
import socket
s=socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.bind(("", 0))
port = s.getsockname()[1]
s.close()
print(port)
PYCODE
)
  echo "Using SSH host port ${SSH_PORT}"
fi
mkdir -p "${TMP_DIR}"
echo "${SSH_PORT}" > "${TMP_DIR}/last_qemu_ssh_port"
exec qemu-system-x86_64   -m 1024   -drive "file=${COPY_PATH},if=virtio,format=qcow2"   -net "user,hostfwd=tcp:127.0.0.1::${HOST_PORT}-:443,hostfwd=tcp:127.0.0.1::${SSH_PORT}-:22"   -net nic   -nographic
