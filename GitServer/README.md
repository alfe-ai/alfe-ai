# GitServer

External git server project for hosting AlfeCode demo repositories.

## What it does

- Exposes an API (`POST /api/repos`) to create bare repositories for demos.
- Starts a `git daemon` that serves repositories over the git protocol.
- Returns clone URLs like `git://<host>:<port>/<repo>.git`.

## Run

```bash
cd GitServer
npm install
cp sample.env .env
npm start
```

`server.js` automatically loads environment values from `GitServer/.env`.

## Environment variables

- `GIT_SERVER_API_HOST` (default `0.0.0.0`)
- `GIT_SERVER_API_PORT` (default `4005`)
- `GIT_SERVER_TLS_KEY_PATH` (optional path to TLS private key PEM; enables HTTPS when set with cert)
- `GIT_SERVER_TLS_CERT_PATH` (optional path to TLS certificate PEM; enables HTTPS when set with key)
- `GIT_SERVER_REPO_ROOT` (default `GitServer/data/repositories`)
- `GIT_SERVER_API_TOKEN` (optional bearer token for repo creation API)
- `GIT_DAEMON_LISTEN_HOST` (default `0.0.0.0`)
- `GIT_DAEMON_PORT` (default `9418`)
- `GIT_DAEMON_PUBLIC_HOST` (default `127.0.0.1`)
- `GIT_DAEMON_PUBLIC_PORT` (default same as `GIT_DAEMON_PORT`)
- `GIT_SERVER_DISABLE_EMBEDDED_DAEMON` (`true` to disable embedded daemon)

## Wire AlfeCode to external GitServer

Set these environment variables for `AlfeCode`:

- `DEMO_GIT_SERVER_API_URL=https://<git-server-host>:4005`
- `DEMO_GIT_SERVER_API_TOKEN=<optional-token>`
- `DEMO_GIT_SERVER_CLONE_BASE_URL=git://<git-server-host>:9418`

When a new user session is created, AlfeCode will provision that session's demo repository on this external git server and clone it locally.
