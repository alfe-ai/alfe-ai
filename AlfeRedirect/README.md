# Alfe.sh Redirect

Simple Node.js server that listens on HTTPS port `3001` and redirects all traffic to [https://mvp2.alfe.sh](https://mvp2.alfe.sh).

## Setup
1. Ensure Node.js and npm are installed.
2. Install dependencies:
   ```bash
   npm install
   ```

## Running
Start the server with:
```bash
npm start
```

### Environment variables
Set `HTTPS_KEY_PATH` and `HTTPS_CERT_PATH` to the SSL key and certificate files for `alfe.sh`.
Run `../setup_certbot.sh alfe.sh <email>` to generate these files with Let's Encrypt.

`HTTP_PORT` sets the port for the HTTP redirect server (default `80`). Use `../forward_port_80.sh` to forward port 80 to this value when running without root.

If you want to accept connections on the standard HTTPS port without root, forward port `443` to `3001`:
```bash
sudo ../forward_port_443.sh 3001
```
