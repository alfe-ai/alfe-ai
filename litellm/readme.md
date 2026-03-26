Place files in /opt/litellm 

https://chatgpt.com/c/697f7707-9164-832e-83b4-7599ad9f2bdf

2) Restart LiteLLM

   cd /opt/litellm
   docker compose restart litellm
   docker compose logs -f --tail=200 litellm


3) Test fallback works (force it)

LiteLLM supports forcing fallbacks by sending mock_testing_fallbacks: true in the request body.

MASTER=$(grep '^LITELLM_MASTER_KEY=' .env | cut -d= -f2)

curl -sS http://127.0.0.1:4000/v1/chat/completions \
-H "Content-Type: application/json" \
-H "Authorization: Bearer $MASTER" \
-d '{
"model": "glm-4.5-air",
"messages": [{"role":"user","content":"ping"}],
"mock_testing_fallbacks": true
}' | head -c 1000 && echo



Recommended: HTTPS via Caddy (real domain)
1) Install Caddy (Ubuntu 22.04)
   sudo apt update
   sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
   sudo apt update
   sudo apt install -y caddy

2) Point DNS to your server

Create an A record like litellm.alfe.sh -> <your public IP>.

Open inbound ports in your security group/firewall:

80/tcp and 443/tcp (for cert issuance + HTTPS)

Keep 4000 closed publicly

3) Configure Caddy reverse proxy
cat /etc/caddy/Caddyfile
   litellm.alfe.sh {
   tls /etc/caddy/certs/litellm.alfe.sh/fullchain.pem /etc/caddy/certs/litellm.alfe.sh/privkey.pem

        # --- UI allowlist ---
        # allows admin page 
        @ui path /ui*

        @ui_allowed {
                path /ui*
                remote_ip xx.xx.xx.xx
        }

        # Allowed IPs can access /ui
        handle @ui_allowed {
                reverse_proxy 127.0.0.1:4000
        }

        # Everyone else gets blocked from /ui
        handle @ui {
                respond "Forbidden" 403
        }

        # --- everything except /ui allowlist ---
        @non_ui {
                not path /ui /ui/*
        }

        # this allows for the LLM prompts 
        @non_ui_allowed {
                not path /ui /ui/*
                remote_ip xx.xx.xx.xx
        }

        handle @non_ui_allowed {
                reverse_proxy 127.0.0.1:4000
        }

        handle @non_ui {
                respond "Forbidden" 403
        }
}


sudo systemctl reload caddy


Add -k flag to curl (equiv to --insecure) if testing with self-signed certs.

curl -k -sS https://localhost/v1/chat/completions \
-H "Content-Type: application/json" \
-H "Authorization: Bearer $MASTER" \
-d '{
"model": "glm-4.5-air",
"messages": [{"role":"user","content":"ping"}],
"mock_testing_fallbacks": true
}' | head -c 1000 && echo


## Expired key error (`Authentication Error - Expired Key`)

If you see an error like:

`[API Error: 400 Authentication Error - Expired Key ...]`

and your provider key (for example OpenRouter) is still active, this usually means a **LiteLLM proxy key** expired (not your upstream provider key).

### 1) Generate a new LiteLLM master key (Linux/Mac)

```bash
export LITELLM_MASTER_KEY="sk-$(openssl rand -base64 32 | tr -d '\n')"
echo "$LITELLM_MASTER_KEY"
```

If you run with Docker Compose, put this value in `/opt/litellm/.env` as `LITELLM_MASTER_KEY=...` and restart:

```bash
cd /opt/litellm
docker compose restart litellm
docker compose logs -f --tail=200 litellm
```

### 2) Use the master key to generate a new virtual key

```bash
MASTER=$(grep '^LITELLM_MASTER_KEY=' /opt/litellm/.env | cut -d= -f2)

curl -sS -X POST http://127.0.0.1:4000/key/generate \
  -H "Authorization: Bearer $MASTER" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "default-user",
    "models": ["openrouter/*"],
    "duration": null
  }'
```

Set `"duration": null` to avoid automatic expiry for that generated key.

### 3) Confirm where the error is coming from

The timestamped expiry message format indicates LiteLLM key management rejected the proxy key before/while routing the request.  
Check LiteLLM logs:

```bash
cd /opt/litellm
docker compose logs -f --tail=200 litellm
```
