#!/usr/bin/env bash
# remove_bg.sh – wrapper that creates a venv, installs deps, then calls remove_bg.py
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="${SCRIPT_DIR}/venv"

# Create venv if it doesn't exist
if [[ ! -d "$VENV_DIR" ]]; then
  echo "Creating Python venv in $VENV_DIR..."
  python3 -m venv "$VENV_DIR"
fi

# Activate venv
# shellcheck disable=SC1090
source "$VENV_DIR/bin/activate"

# Install / upgrade dependencies when missing
REQS=(pillow rembg tqdm onnxruntime)
for pkg in "${REQS[@]}"; do
  "$VENV_DIR/bin/pip" show "$pkg" >/dev/null 2>&1 || NEED_INSTALL=1
done
if [[ "${NEED_INSTALL:-0}" == 1 ]]; then
  echo "Installing dependencies in venv..."
  "$VENV_DIR/bin/pip" install --upgrade pip >/dev/null
  "$VENV_DIR/bin/pip" install -q "${REQS[@]}"
fi

# Run the Python script with all original arguments
"$VENV_DIR/bin/python" "${SCRIPT_DIR}/remove_bg.py" "$@"
