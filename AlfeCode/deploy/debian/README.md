# Debian From-Scratch Deployment (Standardized)

This guide standardizes a fresh Debian deployment for **AlfeCode**.

It keeps app code and user repos separate:

- **AlfeCode install path:** `/git/alfe-ai`
- **User repo workspace root:** `/git/sterling`

That separation avoids collisions with repositories cloned by AlfeCode during normal usage.

---

## Option A (recommended): One-command bootstrap script

Run on a fresh Debian host:

```bash
sudo apt-get update
sudo apt-get install -y git
git clone https://github.com/alfe-ai/alfe-ai.git /tmp/alfe-ai
sudo bash /tmp/alfe-ai/AlfeCode/deploy/debian/bootstrap_alfecode_debian.sh
```

What the script does:

1. Installs required system packages (`git`, `nodejs`, `npm`, `build-essential`, etc.).
2. Clones/pulls this repository to `/git/alfe-ai`.
3. Creates `/git/sterling` for user repositories.
4. Runs `npm install` in `/git/alfe-ai/AlfeCode`.
5. Runs `install-qwen-0.10.1-from-git.sh` to install and link `qwen`.
6. Verifies `qwen --version` succeeds.
7. Creates `data/config/repo_config.json` if missing.

---

## Option B: Manual step-by-step deployment

### 1) Install system dependencies

```bash
sudo apt-get update
sudo apt-get install -y \
  ca-certificates curl git openssh-client npm nodejs build-essential
```

### 2) Create `/git` layout and clone AlfeCode repository

```bash
sudo mkdir -p /git
sudo git clone https://github.com/alfe-ai/alfe-ai.git /git/alfe-ai
sudo mkdir -p /git/sterling
sudo chown -R "$USER:$USER" /git/alfe-ai /git/sterling
```

### 3) Install AlfeCode node dependencies

```bash
cd /git/alfe-ai/AlfeCode
npm install
```

### 4) Install Qwen CLI from project installer

```bash
cd /git/alfe-ai/AlfeCode
sudo bash ./install-qwen-0.10.1-from-git.sh
qwen --version
```

Expected: `qwen` prints a version and exits successfully.

### 5) Prepare runtime config + secrets

```bash
mkdir -p /git/alfe-ai/AlfeCode/data/config
touch /git/alfe-ai/AlfeCode/data/config/repo_config.json
```

Create `.env` in `/git/alfe-ai/AlfeCode` and set required keys.

### 6) Run AlfeCode

```bash
cd /git/alfe-ai/AlfeCode
./run.sh
```

Open:

- `http://localhost:3001`

---

## Quick validation checklist

```bash
test -d /git/alfe-ai && echo "OK: /git/alfe-ai exists"
test -d /git/alfe-ai/AlfeCode && echo "OK: app directory exists"
test -d /git/sterling && echo "OK: /git/sterling (user repos root) exists"
command -v qwen && echo "OK: qwen is on PATH"
qwen --version
```

If any command fails, re-run the bootstrap script and inspect output.
