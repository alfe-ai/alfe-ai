#!/bin/bash
# common_functions.sh — shared functions for Sterling CLI tools
# This is a placeholder implementation

set -euo pipefail

# Function to display trace messages
trace_log() {
  local message="$1"
  echo "[TRACE] ${message}" >&2
}

# Function to display error messages
error_log() {
  local message="$1"
  echo "[ERROR] ${message}" >&2
}

# Function to display info messages
info_log() {
  local message="$1"
  echo "[INFO] ${message}" >&1
}

# Function to check if a command exists
command_exists() {
  command -v "$1" >/dev/null 2>&1
}

# Function to get current timestamp
get_timestamp() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

# Function to ensure directory exists
ensure_dir() {
  local dir="$1"
  mkdir -p "${dir}"
}

# Function to read configuration
read_config() {
  local config_file="$1"
  if [[ -f "${config_file}" ]]; then
    source "${config_file}"
  fi
}

# Function to validate environment
validate_environment() {
  local required_vars=("$@")
  for var in "${required_vars[@]}"; do
    if [[ -z "${!var:-}" ]]; then
      echo "Error: Required environment variable ${var} is not set" >&2
      return 1
    fi
  done
}

# Function to handle cleanup on exit
cleanup() {
  local exit_code=$?
  if [[ $exit_code -ne 0 ]]; then
    echo "Script exited with error code: $exit_code" >&2
  fi
  exit $exit_code
}

# Set up trap for cleanup
trap cleanup EXIT

# Export functions for use in other scripts
export -f trace_log error_log info_log command_exists get_timestamp
export -f ensure_dir read_config validate_environment