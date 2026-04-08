const fs = require("fs");
const path = require("path");
const { execFileSync, spawn } = require("child_process");
const express = require("express");

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

function requireAuth(req, res, next) {
  if (!API_TOKEN) {
    return next();
  }
  const header = (req.headers.authorization || "").trim();
  const expected = `Bearer ${API_TOKEN}`;
  if (header !== expected) {
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

function maybeStartGitDaemon() {
  if (String(process.env.GIT_SERVER_DISABLE_EMBEDDED_DAEMON || "").toLowerCase() === "true") {
    return;
  }
  const child = spawn(
    "git",
    [
      "daemon",
      "--reuseaddr",
      "--base-path",
      REPO_ROOT,
      "--export-all",
      "--enable=receive-pack",
      "--listen",
      GIT_DAEMON_HOST,
      "--port",
      `${GIT_DAEMON_PORT}`,
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

app.get("/health", (_req, res) => {
  res.json({ ok: true, repoRoot: REPO_ROOT, daemon: { host: GIT_DAEMON_HOST, port: GIT_DAEMON_PORT } });
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

ensureRepoRoot();
maybeStartGitDaemon();
app.listen(API_PORT, API_HOST, () => {
  console.log(`[GitServer] API listening on http://${API_HOST}:${API_PORT}`);
  console.log(`[GitServer] Serving repositories from ${REPO_ROOT}`);
  console.log(`[GitServer] Clone URL base: git://${CLONE_HOST}:${CLONE_PORT}`);
});
