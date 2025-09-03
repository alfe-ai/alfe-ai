#!/bin/bash
# forward_port_80.sh - Forward port 80 to a higher user port using iptables
# Usage: sudo ./forward_port_80.sh <target_port>

set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: sudo $0 <target_port>" >&2
  exit 1
fi

TARGET_PORT="$1"

# Forward incoming HTTP traffic to the specified port
iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-port "$TARGET_PORT"

echo "Forwarding HTTP (80) -> $TARGET_PORT"
