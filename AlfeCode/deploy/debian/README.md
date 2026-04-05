# Debian From-Scratch Deployment (Standardized)

This guide standardizes a fresh Debian deployment for **AlfeCode** with the required path:

- `/git/sterling`

And includes **Qwen CLI** installation + verification.

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
2. Clones/pulls this repository to `/git/sterling`.
3. Runs `npm install` in `/git/sterling/AlfeCode`.
4. Runs `install-qwen-0.10.1-from-git.sh` to install and link `qwen`.
5. Verifies `qwen --version` succeeds.
6. Creates `data/config/repo_config.json` if missing.

---

## Option B: Manual step-by-step deployment

### 1) Install system dependencies

```bash
sudo apt-get update
sudo apt-get install -y \
  ca-certificates curl git openssh-client npm nodejs build-essential
```

### 2) Create `/git/sterling` and clone repository

```bash
sudo mkdir -p /git
sudo git clone https://github.com/alfe-ai/alfe-ai.git /git/sterling
sudo chown -R "$USER:$USER" /git/sterling
```

### 3) Install AlfeCode node dependencies

```bash
cd /git/sterling/AlfeCode
npm install
```

### 4) Install Qwen CLI from project installer

```bash
cd /git/sterling/AlfeCode
sudo bash ./install-qwen-0.10.1-from-git.sh
qwen --version
```

Expected: `qwen` prints a version and exits successfully.

### 5) Prepare runtime config + secrets

```bash
mkdir -p /git/sterling/AlfeCode/data/config
touch /git/sterling/AlfeCode/data/config/repo_config.json
```

Create `.env` in `/git/sterling/AlfeCode` and set required keys.

### 6) Run AlfeCode

```bash
cd /git/sterling/AlfeCode
./run.sh
```

Open:

- `http://localhost:3001`

---

## Quick validation checklist

```bash
test -d /git/sterling && echo "OK: /git/sterling exists"
test -d /git/sterling/AlfeCode && echo "OK: app directory exists"
command -v qwen && echo "OK: qwen is on PATH"
qwen --version
```

If any command fails, re-run the bootstrap script and inspect output.
