#!/usr/bin/env bash
set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <product_id>"
  exit 1
fi

clear && git pull && node update-pricing-by-size.js "$1"

