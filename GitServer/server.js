const fs = require("fs");
const path = require("path");
const https = require("https");
const { execFileSync, spawn } = require("child_process");
const express = require("express");

function loadDotEnv(envFilePath) {
  if (!fs.existsSync(envFilePath)) {
    return;
  }

  const fileContent = fs.readFileSync(envFilePath, "utf-8");
  for (const rawLine of fileContent.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    let value = line.slice(separatorIndex + 1).trim();
    const isWrappedWithQuotes =
      (value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"));
    if (isWrappedWithQuotes) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

loadDotEnv(path.join(__dirname, ".env"));

const app = express();
app.use(express.json());

const API_PORT = Number.parseInt(process.env.GIT_SERVER_API_PORT || "4005", 10);
const API_HOST = process.env.GIT_SERVER_API_HOST || "0.0.0.0";
const REPO_ROOT = path.resolve(process.env.GIT_SERVER_REPO_ROOT || path.join(__dirname, "data", "repositories"));
const API_TOKEN = (process.env.GIT_SERVER_API_TOKEN || "").trim();
const GIT_DAEMON_HOST = process.env.GIT_DAEMON_LISTEN_HOST || "0.0.0.0";
const GIT_DAEMON_PORT = Number.parseInt(process.env.GIT_DAEMON_PORT || "9418", 10);
const CLONE_HOST = process.env.GIT_DAEMON_PUBLIC_HOST || "127.0.0.1";
const CLONE_PORT = Number.parseInt(process.env.GIT_DAEMON_PUBLIC_PORT || `${GIT_DAEMON_PORT}`, 10);
const ADMIN_HTTPS_ENABLED = String(process.env.GIT_SERVER_ADMIN_HTTPS_ENABLED || "true").toLowerCase() !== "false";
const ADMIN_HTTPS_HOST = process.env.GIT_SERVER_ADMIN_HTTPS_HOST || "";
const ADMIN_HTTPS_PORT = Number.parseInt(process.env.GIT_SERVER_ADMIN_HTTPS_PORT || "443", 10);
const ADMIN_TLS_KEY_PATH = process.env.GIT_SERVER_ADMIN_TLS_KEY_PATH || "";
const ADMIN_TLS_CERT_PATH = process.env.GIT_SERVER_ADMIN_TLS_CERT_PATH || "";

function normalizeHostName(rawHost) {
  const host = String(rawHost || "").trim();
  if (!host) {
    return "";
  }
  if (host.startsWith("[") && host.endsWith("]")) {
    return host.slice(1, -1);
  }
  const colonCount = (host.match(/:/g) || []).length;
  if (colonCount <= 1) {
    return host.split(":")[0] || "";
  }
  return host;
}

function resolveAdminHost(req) {
  if (ADMIN_HTTPS_HOST) {
    return ADMIN_HTTPS_HOST;
  }
  const requestHost = normalizeHostName(req?.headers?.host || "");
  if (requestHost) {
    return requestHost;
  }
  return "127.0.0.1";
}

function buildAdminBaseUrl(req) {
  const host = resolveAdminHost(req);
  const portSegment = ADMIN_HTTPS_PORT === 443 ? "" : `:${ADMIN_HTTPS_PORT}`;
  return `https://${host}${portSegment}`;
}

function requireAuth(req, res, next) {
  if (!API_TOKEN) {
    return next();
  }
  const header = String(req.headers.authorization || "").trim();
  const tokenMatch = header.match(/^Bearer\s+(.+)$/i);
  const providedToken = (tokenMatch ? tokenMatch[1] : header).trim();
  if (providedToken !== API_TOKEN) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return next();
}

function sanitizeRepoName(rawName) {
  const normalized = String(rawName || "").trim().toLowerCase();
  if (!normalized) {
    return "";
  }
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(normalized)) {
    return "";
  }
  return normalized.replace(/\.git$/i, "");
}

function repoPath(repoName) {
  return path.join(REPO_ROOT, `${repoName}.git`);
}

function cloneUrl(repoName) {
  const hostWithPort = CLONE_PORT === 9418 ? CLONE_HOST : `${CLONE_HOST}:${CLONE_PORT}`;
  return `git://${hostWithPort}/${repoName}.git`;
}

function ensureRepoRoot() {
  if (!fs.existsSync(REPO_ROOT)) {
    fs.mkdirSync(REPO_ROOT, { recursive: true });
  }
}

function createBareRepo(repoName) {
  const fullPath = repoPath(repoName);
  if (!fs.existsSync(fullPath)) {
    execFileSync("git", ["init", "--bare", fullPath], { stdio: "ignore" });
  }

  const exportOk = path.join(fullPath, "git-daemon-export-ok");
  if (!fs.existsSync(exportOk)) {
    fs.writeFileSync(exportOk, "", "utf-8");
  }

  return fullPath;
}

function safeStat(fullPath) {
  try {
    return fs.statSync(fullPath);
  } catch (_error) {
    return null;
  }
}

function collectRepoMetrics(dirPath) {
  let totalSizeBytes = 0;
  let lastModifiedAtMs = 0;
  const stack = [dirPath];

  while (stack.length > 0) {
    const currentPath = stack.pop();
    const stat = safeStat(currentPath);
    if (!stat) {
      continue;
    }

    lastModifiedAtMs = Math.max(lastModifiedAtMs, stat.mtimeMs || 0);

    if (stat.isDirectory()) {
      let entries = [];
      try {
        entries = fs.readdirSync(currentPath, { withFileTypes: true });
      } catch (_error) {
        entries = [];
      }
      for (const entry of entries) {
        stack.push(path.join(currentPath, entry.name));
      }
    } else {
      totalSizeBytes += stat.size || 0;
    }
  }

  return {
    totalSizeBytes,
    lastModifiedAt: lastModifiedAtMs > 0 ? new Date(lastModifiedAtMs).toISOString() : null,
  };
}

function getRepoCreatedAtIso(stat) {
  if (!stat) {
    return null;
  }
  const timeMs = stat.birthtimeMs && stat.birthtimeMs > 0 ? stat.birthtimeMs : stat.ctimeMs;
  if (!timeMs || timeMs <= 0) {
    return null;
  }
  return new Date(timeMs).toISOString();
}

function listRepositories() {
  ensureRepoRoot();
  const entries = fs.readdirSync(REPO_ROOT, { withFileTypes: true });
  const repos = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.endsWith(".git")) {
      continue;
    }

    const repoName = entry.name.replace(/\.git$/i, "");
    const fullPath = path.join(REPO_ROOT, entry.name);
    const stat = safeStat(fullPath);
    const metrics = collectRepoMetrics(fullPath);

    repos.push({
      repoName,
      path: fullPath,
      cloneUrl: cloneUrl(repoName),
      createdAt: getRepoCreatedAtIso(stat),
      lastModifiedAt: metrics.lastModifiedAt,
      totalSizeBytes: metrics.totalSizeBytes,
    });
  }

  repos.sort((left, right) => left.repoName.localeCompare(right.repoName));
  return repos;
}

function deleteRepository(repoName) {
  const fullPath = repoPath(repoName);
  if (!fs.existsSync(fullPath)) {
    return false;
  }
  fs.rmSync(fullPath, { recursive: true, force: true });
  return true;
}

function maybeStartGitDaemon() {
  if (String(process.env.GIT_SERVER_DISABLE_EMBEDDED_DAEMON || "").toLowerCase() === "true") {
    return;
  }
  const child = spawn(
    "git",
    [
      "daemon",
      "--reuseaddr",
      `--base-path=${REPO_ROOT}`,
      "--export-all",
      "--enable=receive-pack",
      `--listen=${GIT_DAEMON_HOST}`,
      `--port=${GIT_DAEMON_PORT}`,
      REPO_ROOT,
    ],
    {
      stdio: "inherit",
      detached: false,
    },
  );

  child.on("exit", (code, signal) => {
    console.warn(`[GitServer] git daemon exited (code=${code}, signal=${signal || "none"}).`);
  });
}

function formatSize(sizeBytes) {
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0) {
    return "-";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = sizeBytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const rounded = value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1);
  return `${rounded} ${units[unitIndex]}`;
}

app.get("/", (_req, res) => {
  if (ADMIN_HTTPS_ENABLED && !_req.secure) {
    const adminUrl = `${buildAdminBaseUrl(_req)}/`;
    return res.redirect(302, adminUrl);
  }

  res.type("html").send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>GitServer Admin</title>
<style>
  body { font-family: Arial, sans-serif; margin: 24px; color: #222; }
  h1 { margin-bottom: 4px; }
  .sub { color: #666; margin-bottom: 20px; }
  .toolbar { margin-bottom: 12px; display: flex; gap: 8px; align-items: center; }
  button { cursor: pointer; }
  input[type="password"] { padding: 4px 6px; min-width: 240px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 14px; }
  th { background: #f5f5f5; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
  .actions button { padding: 4px 8px; }
  .status { margin-top: 10px; min-height: 1.2em; }
  .err { color: #b00020; }
</style>
</head>
<body>
  <h1>GitServer Admin</h1>
  <div class="sub">Repository root: <span class="mono" id="repoRoot">loading...</span></div>
  <div class="toolbar">
    <button id="refreshBtn">Refresh</button>
    <span>Total repos: <strong id="repoCount">0</strong></span>
    <label for="authToken" class="mono">API token:</label>
    <input id="authToken" type="password" autocomplete="off" placeholder="Paste API token" />
    <button id="saveTokenBtn">Save token</button>
  </div>
  <table>
    <thead>
      <tr>
        <th>Repository</th>
        <th>Created</th>
        <th>Last Modified</th>
        <th>Total Size</th>
        <th>Clone URL</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody id="repoRows">
      <tr><td colspan="6">Loading…</td></tr>
    </tbody>
  </table>
  <div class="status" id="status"></div>

<script>
const repoRows = document.getElementById("repoRows");
const repoCount = document.getElementById("repoCount");
const repoRoot = document.getElementById("repoRoot");
const statusEl = document.getElementById("status");
const refreshBtn = document.getElementById("refreshBtn");
const authTokenInput = document.getElementById("authToken");
const saveTokenBtn = document.getElementById("saveTokenBtn");

function readTokenFromLocation() {
  try {
    const params = new URLSearchParams(window.location.search);
    const token = (params.get("token") || "").trim();
    return token;
  } catch (_error) {
    return "";
  }
}

function loadStoredToken() {
  const fromQuery = readTokenFromLocation();
  if (fromQuery) {
    try {
      window.localStorage.setItem("gitServerApiToken", fromQuery);
    } catch (_error) {
      // Ignore unavailable storage.
    }
    return fromQuery;
  }

  try {
    return (window.localStorage.getItem("gitServerApiToken") || "").trim();
  } catch (_error) {
    return "";
  }
}

function saveStoredToken(token) {
  let cleanToken = String(token || "").trim();
  cleanToken = cleanToken.replace(/^Bearer\s+/i, "").trim();
  try {
    if (cleanToken) {
      window.localStorage.setItem("gitServerApiToken", cleanToken);
    } else {
      window.localStorage.removeItem("gitServerApiToken");
    }
  } catch (_error) {
    // Ignore unavailable storage.
  }
  return cleanToken;
}

let authToken = loadStoredToken();

function fmtIso(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function esc(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setStatus(message, isError = false) {
  statusEl.textContent = message || "";
  statusEl.className = isError ? "status err" : "status";
}

async function loadRepos() {
  setStatus("");
  repoRows.innerHTML = '<tr><td colspan="6">Loading…</td></tr>';
  const headers = authToken ? { Authorization: "Bearer " + authToken } : {};
  const response = await fetch("/api/repos", { headers });
  const payload = await response.json();
  if (!response.ok) {
    if (response.status === 401 && !authToken) {
      throw new Error('Unauthorized. Enter API token and click "Save token".');
    }
    throw new Error(payload.error || "Request failed (" + response.status + ")");
  }

  repoRoot.textContent = payload.repoRoot;
  const repos = payload.repositories || [];
  repoCount.textContent = String(repos.length);

  if (repos.length === 0) {
    repoRows.innerHTML = '<tr><td colspan="6">No repositories found.</td></tr>';
    return;
  }

  repoRows.innerHTML = repos.map((repo) => {
    const repoName = esc(repo.repoName);
    const cloneUrl = esc(repo.cloneUrl || "-");
    const created = esc(fmtIso(repo.createdAt));
    const modified = esc(fmtIso(repo.lastModifiedAt));
    const size = esc(repo.totalSizeHuman || "-");
    return '<tr>'
      + '<td class="mono">' + repoName + '</td>'
      + '<td>' + created + '</td>'
      + '<td>' + modified + '</td>'
      + '<td>' + size + '</td>'
      + '<td class="mono">' + cloneUrl + '</td>'
      + '<td class="actions"><button data-repo="' + repoName + '">Delete</button></td>'
      + '</tr>';
  }).join("");
}

let pendingDeleteRepoName = "";
let pendingDeleteTimer = null;

function resetDeleteConfirmation(button) {
  if (!button) {
    return;
  }
  button.dataset.confirming = "";
  button.textContent = "Delete";
  if (pendingDeleteTimer) {
    window.clearTimeout(pendingDeleteTimer);
    pendingDeleteTimer = null;
  }
}

repoRows.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-repo]");
  if (!button) {
    return;
  }

  const repoName = button.getAttribute("data-repo");
  if (!repoName) {
    return;
  }

  const isConfirming = button.dataset.confirming === "true" && pendingDeleteRepoName === repoName;
  if (!isConfirming) {
    const existing = repoRows.querySelector('button[data-confirming="true"]');
    if (existing && existing !== button) {
      resetDeleteConfirmation(existing);
    }
    pendingDeleteRepoName = repoName;
    button.dataset.confirming = "true";
    button.textContent = "Confirm";
    setStatus('Click "Confirm" again to delete "' + repoName + '".', true);
    if (pendingDeleteTimer) {
      window.clearTimeout(pendingDeleteTimer);
    }
    pendingDeleteTimer = window.setTimeout(() => {
      if (button.dataset.confirming === "true") {
        resetDeleteConfirmation(button);
        if (pendingDeleteRepoName === repoName) {
          pendingDeleteRepoName = "";
        }
      }
    }, 5000);
    return;
  }

  button.disabled = true;
  button.textContent = "Deleting...";
  if (pendingDeleteTimer) {
    window.clearTimeout(pendingDeleteTimer);
    pendingDeleteTimer = null;
  }
  setStatus("Deleting " + repoName + "...");

  try {
    const response = await fetch('/api/repos/' + encodeURIComponent(repoName), {
      method: "DELETE",
      headers: authToken ? { Authorization: "Bearer " + authToken } : {},
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Request failed (" + response.status + ")");
    }
    pendingDeleteRepoName = "";
    setStatus("Deleted " + repoName + ".");
    await loadRepos();
  } catch (error) {
    button.disabled = false;
    resetDeleteConfirmation(button);
    pendingDeleteRepoName = "";
    setStatus(error.message || "Delete failed", true);
  }
});

if (authTokenInput) {
  authTokenInput.value = authToken;
}

if (saveTokenBtn) {
  saveTokenBtn.addEventListener("click", async () => {
    authToken = saveStoredToken(authTokenInput ? authTokenInput.value : "");
    if (authTokenInput) {
      authTokenInput.value = authToken;
    }
    setStatus(authToken ? "Saved API token." : "Cleared API token.");
    try {
      await loadRepos();
    } catch (error) {
      setStatus(error.message || "Failed to load repositories", true);
    }
  });
}

refreshBtn.addEventListener("click", () => {
  loadRepos().catch((error) => setStatus(error.message || "Failed to load repositories", true));
});

loadRepos().catch((error) => setStatus(error.message || "Failed to load repositories", true));
</script>
</body>
</html>`);
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, repoRoot: REPO_ROOT, daemon: { host: GIT_DAEMON_HOST, port: GIT_DAEMON_PORT } });
});

app.get("/api/repos", requireAuth, (_req, res) => {
  try {
    const repositories = listRepositories().map((repo) => ({
      ...repo,
      totalSizeHuman: formatSize(repo.totalSizeBytes),
    }));

    return res.json({
      repoRoot: REPO_ROOT,
      repositories,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post("/api/repos", requireAuth, (req, res) => {
  try {
    const cleanedRepoName = sanitizeRepoName(req.body?.repoName);
    if (!cleanedRepoName) {
      return res.status(400).json({ error: "repoName is required and must be [a-z0-9._-]" });
    }
    ensureRepoRoot();
    const fullPath = createBareRepo(cleanedRepoName);
    return res.status(201).json({
      repoName: cleanedRepoName,
      path: fullPath,
      cloneUrl: cloneUrl(cleanedRepoName),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.delete("/api/repos/:repoName", requireAuth, (req, res) => {
  try {
    const cleanedRepoName = sanitizeRepoName(req.params.repoName);
    if (!cleanedRepoName) {
      return res.status(400).json({ error: "repoName is required and must be [a-z0-9._-]" });
    }

    const deleted = deleteRepository(cleanedRepoName);
    if (!deleted) {
      return res.status(404).json({ error: "Repository not found" });
    }

    return res.json({ ok: true, repoName: cleanedRepoName });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

ensureRepoRoot();
maybeStartGitDaemon();
app.listen(API_PORT, API_HOST, () => {
  console.log(`[GitServer] API listening on http://${API_HOST}:${API_PORT}`);
  if (ADMIN_HTTPS_ENABLED) {
    console.log(`[GitServer] Admin page redirect is enabled: https://${ADMIN_HTTPS_HOST || "<request-host>"}:${ADMIN_HTTPS_PORT}`);
  }
  console.log(`[GitServer] Serving repositories from ${REPO_ROOT}`);
  console.log(`[GitServer] Clone URL base: git://${CLONE_HOST}:${CLONE_PORT}`);
});

if (ADMIN_HTTPS_ENABLED) {
  if (!ADMIN_TLS_KEY_PATH || !ADMIN_TLS_CERT_PATH) {
    console.warn("[GitServer] Admin HTTPS is enabled but TLS paths are missing; skipping HTTPS listener.");
  } else if (!fs.existsSync(ADMIN_TLS_KEY_PATH) || !fs.existsSync(ADMIN_TLS_CERT_PATH)) {
    console.warn(`[GitServer] Admin TLS files were not found (key: ${ADMIN_TLS_KEY_PATH}, cert: ${ADMIN_TLS_CERT_PATH}); skipping HTTPS listener.`);
  } else {
    const tlsOptions = {
      key: fs.readFileSync(ADMIN_TLS_KEY_PATH),
      cert: fs.readFileSync(ADMIN_TLS_CERT_PATH),
    };
    https.createServer(tlsOptions, app).listen(ADMIN_HTTPS_PORT, API_HOST, () => {
      console.log(`[GitServer] Admin HTTPS listening on https://${API_HOST}:${ADMIN_HTTPS_PORT}`);
    });
  }
}
