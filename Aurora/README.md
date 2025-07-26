# TaskQueue

Small Node.js utility that stores tasks in a local SQLite database.

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
| `OPENAI_API_KEY` | OpenAI API key for AI features ([get here](https://platform.openai.com/api-keys)) |
| `AI_MODEL`   | (Optional) Default AI model used if the database has no value (default: deepseek/deepseek-chat) |
| `STABILITY_API_KEY` | (Optional) API key for the Stability AI upscaler |
| `PRINTIFY_SCRIPT_PATH` | (Optional) Path to the Printify submission script. Defaults to the included run.sh |
| `PRINTIFY_PRICE_SCRIPT_PATH` | (Optional) Path to the Printify price update script. Defaults to `/home/admin/Puppets/PrintifyPricePuppet/run.sh` |
| `PRINTIFY_TITLE_FIX_SCRIPT_PATH` | (Optional) Path to the script used for the Printify API Title Fix step. Defaults to `scripts/printifyTitleFix.js`. The script now also receives the current image title for additional context. |
| `PROGRAMATIC_PUPPET_API_BASE` | (Optional) Base URL for the ProgramaticPuppet API used for Fix Mockups and Finalize steps (default: `https://localhost:3005`) |
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
| `WHITELIST_IP` | (Optional) Comma-separated list of IP addresses allowed to access the UI. Requests from `localhost` are always permitted |

Run `../setup_certbot.sh <domain> <email>` to quickly generate these files with
Let's Encrypt. After generation, execute `../setup_ssl_permissions.sh <domain> [user]`
so the specified user can access the key and certificate without root.

### Obtaining API Keys
1. **OpenAI API Key**:
   - Visit [OpenAI API Keys](https://platform.openai.com/api-keys)
   - Create new secret key and paste into `.env`


### Job Queue Node API
A small helper class is provided for interacting with the printify pipeline queue from other Node.js processes. This allows running another Aurora server instance on a different machine and enqueueing jobs remotely.

```javascript
import JobQueueApi from './src/jobQueueApi.js';

const api = new JobQueueApi({ baseURL: 'http://remote-host:3000' });

// Add a job
await api.enqueue('image.png', 'upscale');

// Check current queue
const queue = await api.list();
console.log(queue);
```

All queue endpoints exposed by `server.js` are available through this API: `enqueue`, `remove`, `removeByDbId`, `removeFinished`, `stopAll`, `pause`, `resume`, and `state`.
