#!/usr/bin/env bash
set -euo pipefail

# Standardized Debian bootstrap for AlfeCode.
# Supports Debian 12+ and Ubuntu 22.04+.
# Assumes this repository has already been checked out.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_PATH="${INSTALL_PATH:-$(cd "${SCRIPT_DIR}/../../.." && pwd)}"
APP_SUBDIR="${APP_SUBDIR:-AlfeCode}"
USER_REPO_ROOT="${USER_REPO_ROOT:-/git/sterling}"
QWEN_INSTALL_SCRIPT_REL="${QWEN_INSTALL_SCRIPT_REL:-install-qwen-0.10.1-from-git.sh}"
DEMO_REPO_NAME="${DEMO_REPO_NAME:-demo-repo}"
DEPLOYMENT_MODE="standard"
INSTALL_LOCAL_GITHOST="true"

for arg in "$@"; do
  case "$arg" in
    --split-deployment)
      DEPLOYMENT_MODE="split"
      INSTALL_LOCAL_GITHOST="false"
      ;;
    --standard-deployment)
      DEPLOYMENT_MODE="standard"
      INSTALL_LOCAL_GITHOST="true"
      ;;
    -h|--help)
      cat <<USAGE
Usage: sudo bash deploy/debian/bootstrap_alfecode_debian.sh [--split-deployment]

Options:
  --split-deployment    Configure a worker-oriented install and skip local git-daemon demo setup.
  --standard-deployment Force standard mode with local git-daemon demo setup (default).
  -h, --help            Show this help message.
USAGE
      exit 0
      ;;
    *)
      echo "ERROR: unknown argument: $arg" >&2
      exit 1
      ;;
  esac
done

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

log "Using checked-out repository at ${INSTALL_PATH}"
if [ ! -d "${INSTALL_PATH}/.git" ]; then
  echo "ERROR: expected a git checkout at ${INSTALL_PATH}" >&2
  echo "Run this script from within the checked-out repository, or set INSTALL_PATH." >&2
  exit 1
fi
chown -R "$TARGET_USER:$TARGET_USER" "$INSTALL_PATH"

APP_PATH="${INSTALL_PATH}/${APP_SUBDIR}"
if [ ! -d "$APP_PATH" ]; then
  echo "ERROR: app path does not exist: $APP_PATH" >&2
  exit 1
fi


log "Preparing user repository root at ${USER_REPO_ROOT}"
mkdir -p "$USER_REPO_ROOT"
chown -R "$TARGET_USER:$TARGET_USER" "$USER_REPO_ROOT"

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

if [ "$INSTALL_LOCAL_GITHOST" = "true" ]; then
  GITHOST_SCRIPT="$APP_PATH/githost/git-server.sh"
  if [ ! -x "$GITHOST_SCRIPT" ]; then
    echo "ERROR: local git host script not found or not executable: $GITHOST_SCRIPT" >&2
    exit 1
  fi

  log "Configuring local git host server for demo repos"
  bash "$GITHOST_SCRIPT" install

  if [ ! -d "/srv/git/repositories/${DEMO_REPO_NAME}.git" ]; then
    bash "$GITHOST_SCRIPT" create-repo "$DEMO_REPO_NAME"
  else
    log "Demo repo already exists: /srv/git/repositories/${DEMO_REPO_NAME}.git"
  fi

  bash "$GITHOST_SCRIPT" start-daemon
else
  log "Split deployment mode enabled: skipping local git host demo setup"
fi

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

3) Deployment mode: $DEPLOYMENT_MODE

4) For split deployment, set ALFECODE_NODE / ALFECODE_CNC_IP / ALFECODE_VM_* env vars as needed.

5) Local git host demo setup is installed only in standard mode (default repo: $DEMO_REPO_NAME).

6) Start AlfeCode:
   ./run.sh

Expected install location:
- Repo root:        $INSTALL_PATH
- App root:         $APP_PATH
- User repos root:  $USER_REPO_ROOT

MSG
