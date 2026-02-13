#!/bin/bash
# Shared environment variables for codex-tools scripts
# This file provides common configuration and environment setup

# Add any shared environment variables here
# For example:
# export SOME_SHARED_VAR="value"

# Ensure scripts have proper permissions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export CODEx_TOOLS_DIR="$SCRIPT_DIR"

# Add codex-tools directory to PATH if needed
export PATH="$CODEx_TOOLS_DIR:$PATH"

# Set default values for common environment variables
export SHOW_CLINE_CLI_ARGS="${SHOW_CLINE_CLI_ARGS:-false}"

# Source any additional configuration files if they exist
if [[ -f "$SCRIPT_DIR/.env" ]]; then
    source "$SCRIPT_DIR/.env"
fi