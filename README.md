# Alfe AI / 2.30 Beta  

### Alfe AI: Software Development and Image Design Platform  

The first version of the Alfe AI Cloud Platform https://alfe.sh <!-- has been released --> (beta-2.30).  
This initial cloud release includes the image design component of the Alfe AI Platform.  
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

`HTTP_PORT` controls the port used for the HTTP redirect server (default: `80`).
Forward port `80` to this value if running without root privileges.

You can quickly obtain free certificates from Let's Encrypt by running the
`setup_certbot.sh` script. It installs Certbot and generates the key and
certificate files for the domain you specify.

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

To redirect plain HTTP traffic to HTTPS without running as root, forward port `80`
to your chosen `HTTP_PORT`:

```bash
sudo ./forward_port_80.sh 8080
```

Then set `HTTP_PORT=8080` when running the server.
