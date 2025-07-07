#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="${SCRIPT_DIR}/venv"

# Create venv if it doesn't exist
if [ ! -d "$VENV_DIR" ]; then
    echo "Creating Python venv in $VENV_DIR..."
    python3 -m venv "$VENV_DIR"
fi

# Activate venv
# shellcheck disable=SC1090
source "$VENV_DIR/bin/activate"

# Install dependencies if missing
if ! "$VENV_DIR/bin/pip" show pillow >/dev/null 2>&1 || \
   ! "$VENV_DIR/bin/pip" show rembg >/dev/null 2>&1 || \
   ! "$VENV_DIR/bin/pip" show tqdm >/dev/null 2>&1 || \
   ! "$VENV_DIR/bin/pip" show onnxruntime >/dev/null 2>&1; then
    echo "Installing dependencies in venv..."
    "$VENV_DIR/bin/pip" install -q --upgrade pip
    "$VENV_DIR/bin/pip" install -q Pillow rembg tqdm onnxruntime
fi

# Run remove_bg.py with passed arguments
"$VENV_DIR/bin/python" "${SCRIPT_DIR}/remove_bg.py" "$@"
