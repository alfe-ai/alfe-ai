# Debian From-Scratch Deployment (Standardized)

This guide standardizes a fresh Debian deployment for **AlfeCode**.

It keeps app code and user repos separate:

- **User repo workspace root:** `/git/sterling`

That separation avoids collisions with repositories cloned by AlfeCode during normal usage.

---

## Option A (recommended): One-command bootstrap script

Run on a fresh Debian host after cloning this repository:

```bash
sudo apt-get update
sudo apt-get install -y git
git clone https://github.com/ALSH-ai/ALSH.ai.git
cd ALSH.ai
sudo bash ./AlfeCode/deploy/debian/bootstrap_alfecode_debian.sh
```

For split frontend/CNC + worker deployment, run the bootstrap on **both servers** with role-specific mode:

- **Frontend/CNC server:** use default standard mode (no split flag):

```bash
sudo bash ./AlfeCode/deploy/debian/bootstrap_alfecode_debian.sh
```

- **Worker server:** use split mode:

```bash
sudo bash ./AlfeCode/deploy/debian/bootstrap_alfecode_debian.sh --split-deployment
```

> Important: `--split-deployment` is for worker-oriented installs and skips local git-daemon demo setup.

### **After deployment, Run:**

[Jump to Running AlfeCode Step](https://github.com/ALSH-ai/ALSH.ai/blob/main/AlfeCode/deploy/debian/README.md#7-run-alfecode)

What the script does:

1. Installs required system packages (`git`, `nodejs`, `npm`, `build-essential`, etc.).
2. Uses your existing checked-out repository (or `INSTALL_PATH` if set).
3. Creates `/git/sterling` for user repositories.
4. Runs `npm install` in `<your-checkout>/AlfeCode`.
5. Runs `install-qwen-0.10.1-from-git.sh` to install and link `qwen`.
6. Verifies `qwen --version` succeeds.
7. Configures local git host + demo repo (standard mode only).
8. Creates `data/config/repo_config.json` if missing.
9. In `--split-deployment` mode, skips local git-daemon demo setup for worker-oriented installs.

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
sudo git clone https://github.com/ALSH-ai/ALSH.ai.git /git/alfe-ai
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

### 5) Local git host server for demo repos (included in bootstrap)

If you are using manual setup, run:

```bash
cd /git/alfe-ai/AlfeCode
sudo bash ./githost/git-server.sh install
sudo bash ./githost/git-server.sh create-repo demo-repo
sudo bash ./githost/git-server.sh start-daemon
```

Demo clone URL from the same machine:

```bash
git clone git://127.0.0.1/demo-repo.git
```

### 6) Prepare runtime config + secrets

```bash
mkdir -p /git/alfe-ai/AlfeCode/data/config
touch /git/alfe-ai/AlfeCode/data/config/repo_config.json
```

Create `.env` in `/git/alfe-ai/AlfeCode` and set required keys.

### 7) Run AlfeCode

```bash
cd /git/alfe-ai/AlfeCode
./run.sh
```

#### HTTPS when running as a non-root user

`run.sh` supports non-root HTTPS by default using unprivileged ports:

- HTTPS app listener: `8443`
- HTTP→HTTPS redirect listener: `8080`
- Internal HTTP app listener: `3333`

Open locally:

- `https://localhost:8443`
- `http://localhost:8080` (redirects to HTTPS)

If you must expose standard public ports (`443`/`80`) while still running AlfeCode as non-root, place a reverse proxy in front.

#### Step-by-step: NGINX in front of AlfeCode (`8443`/`8080`)

1. **Run AlfeCode as a non-root user** and keep the default ports from `run.sh`:
   - HTTPS app listener: `8443`
   - HTTP→HTTPS redirect listener: `8080`

2. **Install NGINX + Certbot** (Debian/Ubuntu):

   ```bash
   sudo apt update
   sudo apt install -y nginx certbot python3-certbot-nginx
   ```

3. **TLS choice (production vs staging/dev)**:
   - **Production (public HTTPS):** issue/renew a certificate (replace with your real hostname):

     ```bash
     sudo certbot certonly --nginx -d your-host.example
     ```

   - **Staging/dev (no certificate):** skip Certbot and run HTTP only:

     ```bash
     ENABLE_HTTPS=false SERVER_PORT=3333 ./run.sh
     ```

4. **Create a site config** at `/etc/nginx/sites-available/alfe-code.conf`:
   - **Production (with cert):**

   ```nginx
   server {
     listen 80;
     listen [::]:80;
     server_name your-host.example;

     return 301 https://$host$request_uri;
   }

   server {
     listen 443 ssl http2;
     listen [::]:443 ssl http2;
     server_name your-host.example;

     ssl_certificate     /etc/letsencrypt/live/your-host.example/fullchain.pem;
     ssl_certificate_key /etc/letsencrypt/live/your-host.example/privkey.pem;

     location / {
       proxy_pass https://127.0.0.1:8443;

       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto https;

       proxy_http_version 1.1;
       proxy_read_timeout 300;
     }
   }
   ```

   - **Staging/dev (no cert, HTTP only):**

   ```nginx
   server {
     listen 80;
     listen [::]:80;
     server_name your-host.example;

     location / {
       proxy_pass http://127.0.0.1:3333;

       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto http;

       proxy_http_version 1.1;
       proxy_read_timeout 300;
     }
   }
   ```

5. **Enable the site and validate config**:

   ```bash
   sudo ln -sf /etc/nginx/sites-available/alfe-code.conf /etc/nginx/sites-enabled/alfe-code.conf
   sudo nginx -t
   ```

6. **Reload NGINX**:

   ```bash
   sudo systemctl reload nginx
   ```

7. **Confirm end-to-end behavior**:
   - **Production:** `http://your-host.example` redirects to HTTPS (`301`), and `https://your-host.example` serves AlfeCode through NGINX on port `443` while app runs non-root on `127.0.0.1:8443`.
   - **Staging/dev (no cert):** `http://your-host.example` serves AlfeCode through NGINX on port `80` while app runs on `127.0.0.1:3333` with `ENABLE_HTTPS=false`.

> Notes:
> - If your DNS is not pointed yet, cert issuance will fail.
> - Keep firewall open for inbound `80` and `443`.
> - If you changed `HTTPS_PORT` in `run.sh`, update `proxy_pass` accordingly.
> - For staging/dev without certs, keep traffic on trusted/internal networks only.

Optional override example:

```bash
ENABLE_HTTPS=true HTTPS_PORT=9443 HTTP_TO_HTTPS_REDIRECT_PORT=9080 ./run.sh
```

### 8) Optional split deployment wiring (frontend/CNC + worker)

If this machine is the **worker node**, set in `.env`:

```bash
ALFECODE_NODE=true
ALFECODE_CNC_IP=https://<frontend-cnc-host>
ALFECODE_NODE_PING_KEY=<shared-secret>
ALFECODE_NODE_ID=worker-01
SESSION_GIT_BASE_PATH=/git/sterling
```

If this machine is the **frontend/CNC**, set in `.env`:

```bash
ALFECODE_NODE_PING_KEY=<shared-secret>
ALFECODE_VM_HOST=<worker-host-or-ip>
ALFECODE_VM_SSH_PORT=22
ALFECODE_VM_USER=<worker-ssh-user>
```

---

## Quick validation checklist

```bash
test -d /git/alfe-ai && echo "OK: /git/alfe-ai exists" # Only if using this directory, you can install in a different directory
test -d /git/alfe-ai/AlfeCode && echo "OK: app directory exists"
test -d /git/sterling && echo "OK: /git/sterling (user repos root) exists"
command -v qwen && echo "OK: qwen is on PATH"
qwen --version
```

If using local git host for demo repos:

```bash
test -d /srv/git/repositories/demo-repo.git && echo "OK: demo-repo exists"
systemctl is-active git-daemon || systemctl is-active git-daemon.service
```

If any command fails, re-run the bootstrap script and inspect output.

---

## Split deployment: frontend/CNC + worker node (recommended for scale)

Use this pattern when you want user working directories and Qwen execution to run on a separate server from the AlfeCode web frontend.

### Server roles

- **Frontend/CNC server**
  - Runs AlfeCode web UI/API.
  - Receives worker heartbeat pings at `/vm_runs/ping`.
  - Triggers agent/Qwen runs over SSH to worker nodes.
- **Worker server**
  - Hosts user repo workspace (for example `/git/sterling`).
  - Runs Qwen CLI and agent execution workload.
  - Sends heartbeat pings to frontend/CNC.

### Frontend/CNC setup (`/git/alfe-ai/AlfeCode/.env`)

```bash
ALFECODE_NODE_PING_KEY=<shared-secret>
ALFECODE_VM_HOST=<worker-host-or-ip>
ALFECODE_VM_SSH_PORT=22
ALFECODE_VM_USER=<worker-ssh-user>
```

### Worker setup (`/git/alfe-ai/AlfeCode/.env`)

```bash
ALFECODE_NODE=true
ALFECODE_CNC_IP=https://<frontend-cnc-host>
ALFECODE_NODE_PING_KEY=<shared-secret>
ALFECODE_NODE_ID=worker-01
SESSION_GIT_BASE_PATH=/git/sterling
```

### Worker SSH prerequisites

On the worker, ensure the SSH user can:

- read/write the user workspace root (`/git/sterling`), and
- execute `node`, `npm`, and `qwen`.

### Split deployment validation

From worker:

```bash
command -v qwen && qwen --version
curl -k -X POST "https://<frontend-cnc-host>/vm_runs/ping" \
  -H "Content-Type: application/json" \
  -H "x-alfecode-node-key: <shared-secret>" \
  -d '{"hostname":"worker-01","nodeId":"worker-01"}'
```

From frontend:

```bash
ssh -p 22 <worker-ssh-user>@<worker-host-or-ip> 'command -v qwen && qwen --version'
```

## GitServer   
GitServer may also need to be deployed depending on your use case. Instructions for GitServer deployment can be found in the GitServer directory.
