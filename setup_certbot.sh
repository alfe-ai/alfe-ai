#!/bin/bash
# setup_certbot.sh - Obtain SSL certificates using Certbot and output env var hints

set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "Usage: sudo $0 <domain> <email>" >&2
  exit 1
fi

DOMAIN="$1"
EMAIL="$2"

# Install certbot if it's missing
if ! command -v certbot >/dev/null 2>&1; then
  echo "[+] Installing certbot..."
  sudo apt-get update
  sudo apt-get install -y certbot
fi

# Ensure webroot directory exists
sudo mkdir -p /var/www/html

# Request certificates using webroot mode
sudo certbot certonly --webroot -w /var/www/html \
  --non-interactive --agree-tos \
  --preferred-challenges http \
  -d "$DOMAIN" -m "$EMAIL"

CERT_DIR="/etc/letsencrypt/live/$DOMAIN"

echo "[INFO] Certificates stored in $CERT_DIR" >&2

echo "Set these variables before starting the servers:"
echo "  export HTTPS_KEY_PATH=\"$CERT_DIR/privkey.pem\""
echo "  export HTTPS_CERT_PATH=\"$CERT_DIR/fullchain.pem\""
