#!/usr/bin/env bash
set -euo pipefail

# Standardized Debian bootstrap for AlfeCode.
# Supports Debian 12+ and Ubuntu 22.04+.

REPO_URL_DEFAULT="https://github.com/alfe-ai/alfe-ai.git"
REPO_URL="${REPO_URL:-$REPO_URL_DEFAULT}"
INSTALL_ROOT="${INSTALL_ROOT:-/git}"
INSTALL_DIR_NAME="${INSTALL_DIR_NAME:-sterling}"
INSTALL_PATH="${INSTALL_ROOT}/${INSTALL_DIR_NAME}"
APP_SUBDIR="${APP_SUBDIR:-AlfeCode}"
QWEN_INSTALL_SCRIPT_REL="${QWEN_INSTALL_SCRIPT_REL:-install-qwen-0.10.1-from-git.sh}"

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "ERROR: missing dependency: $1" >&2
    exit 1
  }
}

log() {
  printf '\n==> %s\n' "$*"
}

if [ "${EUID}" -ne 0 ]; then
  echo "ERROR: run as root (or via sudo)."
  echo "Example: sudo bash deploy/debian/bootstrap_alfecode_debian.sh"
  exit 1
fi

TARGET_USER="${SUDO_USER:-${USER:-root}}"
if ! id -u "$TARGET_USER" >/dev/null 2>&1; then
  echo "ERROR: target user '$TARGET_USER' does not exist"
  exit 1
fi

log "Installing system packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends \
  ca-certificates curl git openssh-client npm nodejs build-essential

need git
need node
need npm

log "Preparing ${INSTALL_PATH}"
mkdir -p "$INSTALL_ROOT"
if [ ! -d "${INSTALL_PATH}/.git" ]; then
  git clone "$REPO_URL" "$INSTALL_PATH"
else
  git -C "$INSTALL_PATH" fetch --all --tags --prune
  git -C "$INSTALL_PATH" pull --ff-only
fi
chown -R "$TARGET_USER:$TARGET_USER" "$INSTALL_PATH"

APP_PATH="${INSTALL_PATH}/${APP_SUBDIR}"
if [ ! -d "$APP_PATH" ]; then
  echo "ERROR: app path does not exist: $APP_PATH" >&2
  exit 1
fi

log "Installing Node dependencies"
su - "$TARGET_USER" -c "cd '$APP_PATH' && npm install"

QWEN_SCRIPT_PATH="${APP_PATH}/${QWEN_INSTALL_SCRIPT_REL}"
if [ ! -f "$QWEN_SCRIPT_PATH" ]; then
  echo "ERROR: qwen install script not found: $QWEN_SCRIPT_PATH" >&2
  exit 1
fi

log "Installing Qwen CLI via project installer"
bash "$QWEN_SCRIPT_PATH"

log "Validating qwen"
if ! command -v qwen >/dev/null 2>&1; then
  echo "ERROR: qwen not found on PATH after installation" >&2
  exit 1
fi
qwen --version

log "Ensuring AlfeCode runtime data path"
mkdir -p "$APP_PATH/data/config"
if [ ! -f "$APP_PATH/data/config/repo_config.json" ]; then
  touch "$APP_PATH/data/config/repo_config.json"
fi
chown -R "$TARGET_USER:$TARGET_USER" "$APP_PATH/data"

cat <<MSG

Bootstrap complete.

Next steps:
1) Switch to the app directory:
   cd $APP_PATH

2) Create and fill .env with required keys (OPENAI_API_KEY, etc).

3) Start AlfeCode:
   ./run.sh

Expected install location:
- Repo root: $INSTALL_PATH
- App root:  $APP_PATH

MSG
