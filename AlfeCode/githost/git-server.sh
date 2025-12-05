#!/usr/bin/env bash
# git-server.sh
# Simple installer and helper for a SSH-key-only git server on Debian 12/13.
# Usage:
#   sudo ./git-server.sh install            # install packages and configure git user
#   sudo ./git-server.sh add-key /path/key.pub "optional comment"   # add a public key for git user
#   sudo ./git-server.sh create-repo name   # create bare repo name.git under /srv/git/repositories
# Notes:
# - The server creates a system user `git` with home /srv/git and uses `git-shell` as shell.
# - SSH is configured to disallow password auth and to ForceCommand git-shell for the git user.
set -euo pipefail

REPO_ROOT=/srv/git/repositories
GIT_HOME=/srv/git
AUTH_KEYS="$GIT_HOME/.ssh/authorized_keys"
SSH_CONFIG=/etc/ssh/sshd_config

usage(){
  sed -n '1,120p' "$0" | sed -n '1,20p'
}

ensure_root(){
  if [ "$(id -u)" -ne 0 ]; then
    echo "This script must be run as root or with sudo." >&2
    exit 2
  fi
}

install(){
  ensure_root
  apt-get update
  apt-get install -y git openssh-server

  # Create git user with git-shell
  if ! id git >/dev/null 2>&1; then
    useradd --system --create-home --home-dir "$GIT_HOME" --shell /usr/bin/git-shell git
  else
    mkdir -p "$GIT_HOME"
    chown git:git "$GIT_HOME"
  fi

  mkdir -p "$GIT_HOME/.ssh" "$REPO_ROOT"
  touch "$AUTH_KEYS"
  chown -R git:git "$GIT_HOME"
  chmod 700 "$GIT_HOME/.ssh"
  chmod 600 "$AUTH_KEYS"

  # Backup sshd_config then ensure key-only auth and disable passwords
  cp "$SSH_CONFIG" "${SSH_CONFIG}.bak"
  # Ensure PasswordAuthentication no and PubkeyAuthentication yes
  if grep -q "^PasswordAuthentication" "$SSH_CONFIG"; then
    sed -i 's/^PasswordAuthentication.*/PasswordAuthentication no/' "$SSH_CONFIG"
  else
    echo "PasswordAuthentication no" >> "$SSH_CONFIG"
  fi
  if grep -q "^PubkeyAuthentication" "$SSH_CONFIG"; then
    sed -i 's/^PubkeyAuthentication.*/PubkeyAuthentication yes/' "$SSH_CONFIG"
  else
    echo "PubkeyAuthentication yes" >> "$SSH_CONFIG"
  fi
  if ! grep -q "^PermitRootLogin" "$SSH_CONFIG"; then
    echo "PermitRootLogin no" >> "$SSH_CONFIG"
  else
    sed -i 's/^PermitRootLogin.*/PermitRootLogin no/' "$SSH_CONFIG"
  fi

  # Add Match block for git user to restrict capabilities and use git-shell
  if ! grep -q "Match User git" "$SSH_CONFIG"; then
    cat >> "$SSH_CONFIG" <<'EOF'

# Restrict git user to git-shell and disable forwarding
Match User git
  PasswordAuthentication no
  X11Forwarding no
  AllowTcpForwarding no
  PermitTTY no
  ForceCommand /usr/bin/git-shell
EOF
  fi

  systemctl restart sshd
  echo "Installation complete. Add public keys with: sudo $0 add-key /path/to/key.pub \"comment\""
  echo "Create repos with: sudo $0 create-repo myproject"
}

add_key(){
  ensure_root
  keyfile="$1"
  comment=${2:-""}
  if [ ! -f "$keyfile" ]; then
    echo "Key file not found: $keyfile" >&2
    exit 3
  fi
  mkdir -p "$GIT_HOME/.ssh"
  cat "$keyfile" | tr -d '\r' >> "$AUTH_KEYS"
  if [ -n "$comment" ]; then
    # Append comment to the last line
    sed -i "\$ s/$/ $comment/" "$AUTH_KEYS"
  fi
  chown -R git:git "$GIT_HOME"
  chmod 600 "$AUTH_KEYS"
  echo "Key added to $AUTH_KEYS"
  echo "Optional: prefix the key in $AUTH_KEYS with 'command="git-shell -c \"$SSH_ORIGINAL_COMMAND\""' to restrict per-key commands."
}

create_repo(){
  ensure_root
  name="$1"
  if [ -z "$name" ]; then
    echo "Repo name required." >&2
    exit 4
  fi
  repo="$REPO_ROOT/${name}.git"
  if [ -d "$repo" ]; then
    echo "Repository already exists: $repo" >&2
    exit 5
  fi
  mkdir -p "$repo"
  git init --bare "$repo"
  # Prefer the dedicated git user when available, otherwise fall back to the
  # current user so the script works even if git-shell is not configured.
  if id git >/dev/null 2>&1; then
    repo_owner="git:git"
  else
    repo_owner="$(id -un):$(id -gn)"
  fi
  chown -R "$repo_owner" "$repo"
  echo "Created bare repository: $repo"
}


# Start a local git daemon bound to localhost with no authentication.
# This allows anonymous cloning/pushing if the repository permissions allow it,
# but is restricted to localhost only for safety.
start_git_daemon(){
  ensure_root
  # Ensure git-daemon package (part of git-core) is present
  apt-get update
  apt-get install -y git-daemon-run

  # Create export-ok files for repos to be served anonymously
  mkdir -p "$REPO_ROOT"
  for d in "$REPO_ROOT"/*.git; do
    if [ -d "$d" ]; then
      touch "$d/git-daemon-export-ok"
    fi
  done

  # Configure git-daemon to listen only on localhost.
  # Some distributions (git-daemon-run) provide a unit; others don't. If the named
  # unit does not exist, install a simple unit file that launches git directly.
  systemctl daemon-reload || true
  if ! systemctl list-unit-files | rg -q "^git-daemon.service"; then
    cat > /etc/systemd/system/git-daemon.service <<'UNIT'
[Unit]
Description=Simple git daemon (anonymous, localhost only)
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/git daemon --reuseaddr --base-path=/srv/git/repositories --export-all --enable=receive-pack --listen=127.0.0.1
Restart=always

[Install]
WantedBy=multi-user.target
UNIT
    systemctl daemon-reload
    systemctl enable --now git-daemon.service
  else
    # Unit exists but we still want to ensure it's bound to localhost. Create drop-in
    mkdir -p /etc/systemd/system/git-daemon.service.d
    cat > /etc/systemd/system/git-daemon.service.d/override.conf <<'EOF'
[Service]
ExecStart=
ExecStart=/usr/bin/git daemon --reuseaddr --base-path=/srv/git/repositories --export-all --enable=receive-pack --listen=127.0.0.1
Restart=always
EOF
    systemctl daemon-reload
    systemctl enable --now git-daemon
  fi
  echo "git-daemon started and bound to 127.0.0.1 serving $REPO_ROOT"
}

case "${1:-}" in
  install)
    install
    ;;
  add-key)
    if [ -z "${2:-}" ]; then
      echo "Usage: $0 add-key /path/to/key.pub [comment]" >&2
      exit 1
    fi
    add_key "$2" "${3:-}"
    ;;
  create-repo)
    if [ -z "${2:-}" ]; then
      echo "Usage: $0 create-repo name" >&2
      exit 1
    fi
    create_repo "$2"
    ;;
  start-daemon)
    start_git_daemon
    ;;
  *)
    echo "Usage: $0 {install|add-key|create-repo|start-daemon}" >&2
    exit 1
    ;;
esac
