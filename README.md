# Alfe AI / 2.30 Beta  

### Alfe AI: Project Management, Image Design, and Software Development Platform

The first version of the Alfe AI Cloud Platform https://alfe.sh <!-- has been released --> (beta-2.30).
This initial cloud release includes the image design component of the Alfe AI Platform.
It now defaults to OpenAI's **gpt-image-1** model for image generation via the built-in API. You
can change the model globally via the new `image_gen_model` setting which accepts `gptimage1`,
`dalle2`, or `dalle3`.
If the model returns a base64 string instead of a URL, the server automatically decodes and saves the image.
The server also includes an optional color swatch detector that can trim any palette band from the bottom of generated images. This feature is disabled by default and can be enabled via the `remove_color_swatches` setting.
The software development component is coming soon, and is available now as a Pre-release on GitHub.

![image](https://github.com/user-attachments/assets/b7d308f8-e2a6-4098-b707-8f8704a74049)  

Alfe AI beta-2.30+ (Image Design): https://github.com/alfe-ai/alfe-ai-2.0_beta  
Alfe AI beta-0.4x+ (Software Development): https://github.com/alfe-ai/Sterling  

## Deploying

```
wget https://raw.githubusercontent.com/alfe-ai/alfe-ai-Aurelix/refs/heads/Aurora/Aurelix/dev/main-rel2/deploy_aurelix.sh && chmod +x deploy_aurelix.sh && ./deploy_aurelix.sh
```

#### 2.0 Beta (Aurora/Aurelix)

![image](https://github.com/user-attachments/assets/ec47be87-5577-45b2-a3af-17475860df46)

### Environment variables

Set `HTTPS_KEY_PATH` and `HTTPS_CERT_PATH` to the SSL key and certificate files
to enable HTTPS across the included servers. If the files are missing the
services fall back to HTTP.

You can quickly obtain free certificates from Let's Encrypt by running the
`setup_certbot.sh` script. It installs Certbot and generates the key and
certificate files for the domain you specify.

After obtaining the certificates, run `setup_ssl_permissions.sh <domain> [user]`
to grant the specified user (default: `admin`) read access to the key and
certificate so Aurora can run without root privileges.

### Listening on port 443 without root

The Aurora server reads its port from the `AURORA_PORT` environment variable
(default: `3000`). Binding directly to port `443` typically requires root
privileges. If you prefer to run the server as a regular user, you can forward
incoming connections from port `443` to your configured `AURORA_PORT`.

Run the helper script with `sudo` to set up the forwarding rule:

```bash
sudo ./forward_port_443.sh 3000
```

Replace `3000` with your chosen `AURORA_PORT`. After adding the rule, start the
server normally and clients can connect using `https://your-domain/` on port
`443` while the Node.js process continues to run on the higher port.

### Passthrough SQL server

Set `SQL_SERVER_PORT` in `.env` (see `Aurora/.env.example`) to configure the port
for a simple HTTP interface to the SQLite database. Start the server with:

```bash
npm run sqlserver --prefix Aurora
```

Send POST requests to `/sql` with a JSON body containing a `sql` string and
optional `params` array. Select queries return rows while other statements
return change information.

## Perplexity CLI

A small command-line script `perplexity-cli.js` lets you query the official Perplexity API and prints any citation URLs from the response. A newer interactive version `pplx.js` is also provided.

Supported Perplexity models:

```
sonar
sonar-pro
sonar-reasoning
sonar-reasoning-pro
sonar-deep-research
r1-1776
```

### Prerequisites

```bash
npm install axios commander
```

Set your API key with `PERPLEXITY_API_KEY` or pass `--key` when running.

### Usage

```bash
chmod +x pplx.js
./pplx.js "What causes aurora borealis?"
```

The script outputs the answer and lists cited URLs if available.

## Perplexity API Quick Reference (2025)

The CLI follows Perplexity's official API which mirrors the OpenAI Chat
Completions format. Set your API key in the `PERPLEXITY_API_KEY` environment
variable and send requests to `https://api.perplexity.ai/chat/completions`.

```json
{
  "model": "sonar-pro",
  "messages": [
    { "role": "system", "content": "You are a helpful assistant." },
    { "role": "user", "content": "Who discovered penicillin?" }
  ],
  "max_tokens": 512,
  "temperature": 0.7
}
```

Responses include optional `citations` and `search_results` arrays with the
source URLs used. Common errors are a `400 Bad Request` when the model name is
wrong and `401`/`403` for missing or invalid API keys. Use plain model names
like `sonar`, `sonar-pro`, `sonar-reasoning`, `sonar-reasoning-pro`,
`sonar-deep-research`, or `r1-1776` without any provider prefix.

### Reasoning menu configuration

The order of models shown in the reasoning tooltip can be customized.
Edit `Aurora/public/reasoning_tooltip_config.js` and reorder the
`chatModels` and `reasoningModels` arrays to suit your preferences.

The chat model list now includes **Anthropic Claude Sonnet 4** as an
`ultimate` tier option. Pricing is $3 per million input tokens,
$15 per million output tokens, and $4.80 per thousand input images.

