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
   sudo tee /etc/caddy/Caddyfile >/dev/null <<'EOF'
   localhost {
   reverse_proxy 127.0.0.1:4000
   }
   EOF

sudo systemctl reload caddy