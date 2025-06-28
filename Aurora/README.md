# TaskQueue

Small Node.js utility that pulls open GitHub issues (labelled `task` by default) into an in-memory queue.

## Quick start
```bash
cd TaskQueue
cp sample.env .env   # add your API keys
npm install
npm start
```

### Environment variables

| Name             | Purpose                                               |
| ---------------- | ----------------------------------------------------- |
| `GITHUB_TOKEN`   | Personal access token (classic) with `repo` scope.    |
| `GITHUB_OWNER`   | Repository owner or organisation.                     |
| `GITHUB_REPO`    | Repository name.                                      |
| `GITHUB_LABEL`   | (Optional) Issue label to filter on. If omitted, **all** open issues are returned. |
| `OPENAI_API_KEY` | OpenAI API key for AI features ([get here](https://platform.openai.com/api-keys)) |
| `OPENAI_MODEL`   | (Optional) Model ID for completions (default: deepseek/deepseek-chat)  |
| `STABILITY_API_KEY` | (Optional) API key for the Stability AI upscaler |
| `PRINTIFY_SCRIPT_PATH` | (Optional) Path to the Printify submission script. Defaults to the included run.sh |
| `PRINTIFY_PRICE_SCRIPT_PATH` | (Optional) Path to the Printify price update script. Defaults to `/home/admin/Puppets/PrintifyPricePuppet/run.sh` |
| `PRINTIFY_TITLE_FIX_SCRIPT_PATH` | (Optional) Path to the script used for the Printify API Title Fix step. Defaults to `scripts/printifyTitleFix.js` |
| `PRINTIFY_API_TOKEN` | (Optional) API token for Printify REST API (legacy `PRINTIFY_TOKEN` also supported) |
| `PRINTIFY_SHOP_ID` | (Optional) Shop ID for Printify API requests |
| `STABLE_DIFFUSION_URL` | (Optional) Base URL for a self-hosted Stable Diffusion API |
| `HTTPS_KEY_PATH` | (Optional) Path to SSL private key for HTTPS |
| `HTTPS_CERT_PATH` | (Optional) Path to SSL certificate for HTTPS |
| `AURORA_PORT` | (Optional) Port for the web server (default: 3000) |
| `DISABLE_2FA` | (Optional) Set to `true` to skip TOTP verification during login |
| `AWS_DB_URL` | (Optional) PostgreSQL connection string for AWS RDS. If set, the local SQLite DB is ignored |
| `AWS_DB_HOST` | (Optional) Hostname for AWS RDS. If set (with other credentials), enables the RDS integration |
| `AWS_DB_USER` | (Optional) Username for AWS RDS |
| `AWS_DB_PASSWORD` | (Optional) Password for AWS RDS |
| `AWS_DB_NAME` | (Optional) Database name for AWS RDS |
| `AWS_DB_PORT` | (Optional) Port for AWS RDS (default: 5432) |
| `WHITELIST_IP` | (Optional) Only allow UI access from this IP |

Run `../setup_certbot.sh <domain> <email>` to quickly generate these files with
Let's Encrypt. After generation, execute `../setup_ssl_permissions.sh <domain> [user]`
so the specified user can access the key and certificate without root.

### Obtaining API Keys
1. **GitHub Token**:  
   - Go to **Settings → Developer settings → Personal access tokens → Tokens (classic)**  
   - Create token with `repo` scope

2. **OpenAI API Key**:  
   - Visit [OpenAI API Keys](https://platform.openai.com/api-keys)  
   - Create new secret key and paste into `.env`

The script prints matching open issues and the current queue size.
