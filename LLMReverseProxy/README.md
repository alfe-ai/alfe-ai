# LLMReverseProxy

A reverse proxy solution that enables SSH access to local machines from a remote AWS host.

## Components

1. **Client Script** - Runs on local desktops to connect to the reverse proxy server
2. **Reverse Proxy Server** - Runs on AWS to route SSH connections to online clients

## Features

- Seamless SSH connections from AWS to local machines
- Automatic reconnection on client restart
- Secure tunnel establishment
- Boot-time startup configuration