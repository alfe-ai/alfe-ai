#!/usr/bin/env bash
set -euo pipefail

VERSION="0.10.1"
TAG="v${VERSION}"
REPO_URL="https://github.com/QwenLM/qwen-code.git"

# Where to clone on the machine
CLONE_DIR="${CLONE_DIR:-/opt/qwen-code}"

need() { command -v "$1" >/dev/null 2>&1 || { echo "ERROR: missing dependency: $1" >&2; exit 1; }; }

need git
need node
need npm

echo "==> Installing qwen ${VERSION} from ${REPO_URL} into ${CLONE_DIR}"

# Clean up broken prior install (best-effort)
if [ -L /usr/bin/qwen ] || [ -e /usr/bin/qwen ]; then
  echo "==> Removing existing /usr/bin/qwen (if any)"
  rm -f /usr/bin/qwen || true
fi

# If a previous global install exists (common cause of broken symlink), remove it (best-effort)
if npm ls -g --depth=0 "@qwen-code/qwen-code" >/dev/null 2>&1; then
  echo "==> Removing old global @qwen-code/qwen-code"
  npm rm -g "@qwen-code/qwen-code" || true
fi

# Clone or update
if [ -d "${CLONE_DIR}/.git" ]; then
  echo "==> Repo already exists; fetching updates"
  git -C "${CLONE_DIR}" fetch --tags --prune
else
  echo "==> Cloning repo"
  git clone --depth 1 --branch "${TAG}" "${REPO_URL}" "${CLONE_DIR}" || {
    echo "==> Shallow clone failed (maybe tag not reachable via depth=1); doing full clone"
    rm -rf "${CLONE_DIR}"
    git clone "${REPO_URL}" "${CLONE_DIR}"
  }
  git -C "${CLONE_DIR}" fetch --tags --prune
fi

echo "==> Checking out ${TAG}"
git -C "${CLONE_DIR}" checkout -f "${TAG}"

echo "==> Verifying checked-out version"
grep -E '"version"\s*:\s*"' "${CLONE_DIR}/package.json" | head -n 1 || true
if ! grep -q "\"version\"[[:space:]]*:[[:space:]]*\"${VERSION}\"" "${CLONE_DIR}/package.json"; then
  echo "ERROR: package.json version is not ${VERSION}. Refusing to install." >&2
  exit 1
fi

echo "==> Installing dependencies (npm ci if possible, else npm install)"
cd "${CLONE_DIR}"
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

echo "==> Building bundle into dist/ (required)"
npm run bundle

echo "==> Preparing dist/ package metadata (recommended by upstream tooling)"
# This script asserts dist/cli.js and dist/vendor exist, and copies docs/locales, etc. :contentReference[oaicite:2]{index=2}
npm run prepare:package || npm run prepare-package || true

# Sanity check
if [ ! -f "${CLONE_DIR}/dist/cli.js" ]; then
  echo "ERROR: dist/cli.js not found after build. Something went wrong." >&2
  exit 1
fi

echo "==> Linking globally (creates /usr/bin/qwen -> .../@qwen-code/qwen-code/dist/cli.js)"
npm link

echo "==> Verifying install"
if ! readlink -f /usr/bin/qwen >/dev/null 2>&1; then
  echo "ERROR: /usr/bin/qwen is still broken" >&2
  ls -la /usr/bin/qwen || true
  exit 1
fi

echo "==> qwen path: $(readlink -f /usr/bin/qwen)"
echo "==> qwen version:"
qwen --version || true

echo "✅ Installed qwen ${VERSION} from GitHub clone via tag ${TAG}"
