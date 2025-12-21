# Alfe AI (Aurora) — Self-Hosting Guide

This repository contains the **Aurora** web app and API used by Alfe AI. Follow the steps below to run it end-to-end on your own server.

## 1) Prerequisites

- **Node.js** (LTS recommended)
- **npm** (ships with Node)
- **git**
- Optional (for HTTPS): **Certbot** + a domain name

## 2) Clone the repository

```bash
git clone https://github.com/alfe-ai/alfe-ai.git
cd alfe-ai
```

## 3) Configure environment variables

Aurora reads configuration from `Aurora/.env`.

```bash
cd Aurora
cp .env.example .env
```

Open `Aurora/.env` and set the values you need. Common settings:

| Variable | Purpose | Example |
| --- | --- | --- |
| `OPENAI_API_KEY` | Enable AI features | `sk-...` |
| `AI_MODEL` | Default model if DB is empty | `openrouter/qwen/qwen3-30b-a3b-instruct-2507` |
| `AURORA_PORT` | Web server port | `3000` |
| `DISABLE_2FA` | Skip TOTP in local testing | `true` |
| `WHITELIST_IP` | Restrict UI access by IP | `1.2.3.4,5.6.7.8` |
| `HTTPS_KEY_PATH` | SSL private key path | `/etc/letsencrypt/live/yourdomain/privkey.pem` |
| `HTTPS_CERT_PATH` | SSL certificate path | `/etc/letsencrypt/live/yourdomain/fullchain.pem` |
| `SQL_SERVER_PORT` | SQL passthrough server port | `7000` |

Optional feature flags you may want to toggle:

- `ACCOUNTS_ENABLED=true` to enable login/registration.
- `AURORA_PROJECTVIEW_ENABLED=true` to enable the ProjectView UI.
- `AURORA_LIMITS_ENABLED=false` to disable image/search limits.

## 4) Install dependencies

From `alfe-ai/Aurora`:

```bash
npm install
```

## 5) Start the server

```bash
npm run web
```

Or run the provided script:

```bash
./run_server.sh
```

The server listens on `AURORA_PORT` (default `3000`).

Open the UI:

```
http://localhost:3000/
```

## 6) (Optional) Enable HTTPS

If you want HTTPS, you can generate certificates with the helper scripts in the repo root:

```bash
cd ..
./setup_certbot.sh <domain> <email>
./setup_ssl_permissions.sh <domain> [user]
```

Then set `HTTPS_KEY_PATH` and `HTTPS_CERT_PATH` in `Aurora/.env`.

### Listening on port 443 without root

Aurora reads `AURORA_PORT` (default `3000`). If you want the service accessible on port `443` without running Node as root, forward port `443` to your chosen `AURORA_PORT`:

```bash
sudo ./forward_port_443.sh 3000
```

## 7) (Optional) SQL passthrough server

If you set `SQL_SERVER_PORT`, you can start the SQL server with:

```bash
npm run sqlserver
```

Requests are accepted at `/sql` with a JSON body like:

```json
{ "sql": "select * from issues", "params": [] }
```

## 8) Updating your deployment

To update Aurora after pulling new changes:

```bash
git pull
cd Aurora
npm install
npm run web
```

---

If you need additional service-specific instructions, see:

- `RUNNING.md` for UI/Mosaic behavior notes.
- `Aurora/.env.example` for the full list of supported environment variables.
