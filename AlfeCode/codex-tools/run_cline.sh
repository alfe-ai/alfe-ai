#!/bin/bash

# run_cline.sh
# Script to run Cline CLI with proper permissions and error handling
# Auth setup example:
# cline auth -p openai -k "OPENAI_API_KEY" -b "OPENAI_API_URL" -m "OPENAI_MODEL"
# See https://chatgpt.com/c/698e8057-42d4-8332-a7ce-e195d7f68894 for details

set -e

# Source shared environment variables
source "$(dirname "$0")/shared_env.sh" 2>/dev/null || true

# Enable verbose logging for debugging
SHOW_CLINE_CLI_ARGS="${SHOW_CLINE_CLI_ARGS:-false}"

if [[ "${SHOW_CLINE_CLI_ARGS:-false}" == "true" ]]; then
    echo "[cline] CLI arguments: $@"
fi

# Check if CLINE_COMMAND environment variable is set
if [[ -z "${CLINE_COMMAND:-}" ]]; then
    echo "Error: CLINE_COMMAND environment variable not set." >&2
    exit 1
fi

# Log the Cline command being executed
if [[ "${SHOW_CLINE_CLI_ARGS:-false}" == "true" ]]; then
    echo "[cline] Executing command: $CLINE_COMMAND" >&2
fi

# Execute the Cline command
eval "$CLINE_COMMAND"

# Check if cline command succeeded
if [[ $? -eq 0 ]]; then
    if [[ "${SHOW_CLINE_CLI_ARGS:-false}" == "true" ]]; then
        echo "[cline] Cline command completed successfully." >&2
    fi
    exit 0
else
    echo "Error: Cline command failed." >&2
    exit 1
fi