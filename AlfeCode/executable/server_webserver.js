const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");
const dotenvCandidates = [
    process.env.ALFECODE_DOTENV_PATH,
    path.resolve(process.cwd(), ".env"),
    path.resolve(__dirname, "..", ".env"),
].filter(Boolean);
const loadedDotenvPaths = new Set();
dotenvCandidates.forEach((candidate) => {
    if (loadedDotenvPaths.has(candidate)) {
        return;
    }
    loadedDotenvPaths.add(candidate);
    if (fs.existsSync(candidate)) {
        dotenv.config({ path: candidate, override: true });
    }
});
if (!loadedDotenvPaths.size) {
    dotenv.config({ override: true });
}
const express = require("express");
const globalTaskCounter = require("./globalTaskCounter");
const os = require("os");
const { exec, execSync, spawn } = require("child_process");
const { randomUUID } = require("crypto");
const multer = require("multer");
const bodyParser = require("body-parser");
const cron = require("node-cron");
const http = require("http");
const https = require("https");
const net = require("net");
const { OpenAI } = require("openai");
const rdsStore = require("../rds_store");
const app = express();

const vmManager = require("./vm_manager");
const vmRunsRouter = require("./vm_runs_router");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const DEFAULT_AIMODEL = "deepseek/deepseek-chat";
const DEFAULT_GIT_COMMIT_GRAPH_LIMIT = 400;
const MAX_GIT_COMMIT_GRAPH_LIMIT = 2000;
const GITHOST_SCRIPT_PATH = path.join(PROJECT_ROOT, "githost", "git-server.sh");
const GITHOST_REPO_ROOT = path.join(path.sep, "srv", "git", "repositories");
const SESSION_GIT_BASE_PATH = (function(){
    // Prefer an explicit env override for session git base path. If not set,
    // store session repos under the application's data directory so the
    // process typically has write permission. Fall back to OS temp dir.
    const candidate = process.env.SESSION_GIT_BASE_PATH || path.join(path.sep, 'git');
    try {
        // Ensure directory exists
        if (!fs.existsSync(candidate)) fs.mkdirSync(candidate, { recursive: true });
        return candidate;
    } catch (e) {
        // Last resort: OS temp dir
        return os.tmpdir();
    }
})();
const NEW_SESSION_REPO_NAME = "Default";

const vmPortStartEnv = Number.parseInt(process.env.ALFECODE_VM_PORT_START, 10);
const vmPortEndEnv = Number.parseInt(process.env.ALFECODE_VM_PORT_END, 10);
const VM_PORT_START = Number.isFinite(vmPortStartEnv) && vmPortStartEnv > 0 ? vmPortStartEnv : 32000;
const VM_PORT_END = (Number.isFinite(vmPortEndEnv) && vmPortEndEnv >= VM_PORT_START) ? vmPortEndEnv : VM_PORT_START + 999;
const DEFAULT_VM_IMAGE_PATH = path.join(PROJECT_ROOT, '..', 'example', 'alfe-agent.qcow2');
const VM_IMAGE_PATH = process.env.ALFECODE_VM_IMAGE_PATH || process.env.AURORA_QEMU_IMAGE || DEFAULT_VM_IMAGE_PATH;
const VM_LOG_DIR = path.join(PROJECT_ROOT, 'data', 'vm_runs_logs');
const IS_ALFECODE_NODE = parseBooleanEnv(process.env.ALFECODE_NODE, false);
const ALFECODE_CNC_IP = normalizeBaseUrl(process.env.ALFECODE_CNC_IP || '');
const NODE_HEARTBEAT_INTERVAL_MS = 1000;
const NODE_HEARTBEAT_ID = process.env.ALFECODE_NODE_ID || '';
const NODE_PING_SHARED_KEY = (process.env.ALFECODE_NODE_PING_KEY || '').trim();

function parseBooleanEnv(value, defaultValue = false) {
    if (typeof value === "undefined" || value === null) {
        return defaultValue;
    }
    const normalized = String(value).trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) {
        return true;
    }
    if (["false", "0", "no", "off"].includes(normalized)) {
        return false;
    }
    return defaultValue;
}

function normalizeBaseUrl(candidate) {
    if (typeof candidate !== "string") {
        return "";
    }
    const trimmed = candidate.trim();
    if (!trimmed) {
        return "";
    }
    return trimmed.replace(/\/+$/, "");
}

function resolveCncBaseUrl() {
    if (!ALFECODE_CNC_IP) {
        return "";
    }
    if (/^https?:\/\//i.test(ALFECODE_CNC_IP)) {
        return normalizeBaseUrl(ALFECODE_CNC_IP);
    }
    return `http://${normalizeBaseUrl(ALFECODE_CNC_IP)}`;
}

function startNodeHeartbeat() {
    if (!IS_ALFECODE_NODE) {
        return;
    }
    if (!NODE_PING_SHARED_KEY) {
        console.warn("[WARN] ALFECODE_NODE_PING_KEY is not set; skipping node heartbeat ping.");
        return;
    }
    const baseUrl = resolveCncBaseUrl();
    if (!baseUrl) {
        console.warn("[WARN] ALFECODE_NODE is true, but ALFECODE_CNC_IP is not set.");
        return;
    }

    let pingUrl;
    try {
        pingUrl = new URL("/vm_runs/ping", baseUrl);
    } catch (err) {
        console.warn("[WARN] Invalid ALFECODE_CNC_IP for node heartbeat:", err.message);
        return;
    }
    if (pingUrl.protocol !== "https:") {
        console.warn("[WARN] Node heartbeat requires HTTPS; skipping ping for:", pingUrl.href);
        return;
    }

    const transport = https;
    const hostname = os.hostname();
    const payload = JSON.stringify({ hostname, nodeId: NODE_HEARTBEAT_ID });
    const headers = {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
    };
    headers["x-alfecode-node-key"] = NODE_PING_SHARED_KEY;
    const requestOptions = {
        method: "POST",
        hostname: pingUrl.hostname,
        port: pingUrl.port || (pingUrl.protocol === "https:" ? 443 : 80),
        path: `${pingUrl.pathname}${pingUrl.search}`,
        headers,
    };

    const sendPing = () => {
        const req = transport.request(requestOptions, (res) => {
            res.on("data", () => {});
            res.on("end", () => {});
        });
        req.on("error", (err) => {
            console.warn(`[WARN] Node heartbeat failed: ${err.message}`);
        });
        req.write(payload);
        req.end();
    };

    sendPing();
    setInterval(sendPing, NODE_HEARTBEAT_INTERVAL_MS);
}

const DEFAULT_STERLING_CODEX_BASE_URL = "https://sterlingcodex/agent";
const ENV_STERLING_CODEX_BASE_URL = normalizeBaseUrl(
    process.env.STERLING_CODEX_BASE_URL
        || process.env.STERLING_CODEX_URL
        || process.env.STERLING_CODEX_HOST,
);
const ENV_EDITOR_BASE_URL = normalizeBaseUrl(
    process.env.EDITOR_BASE_URL
        || process.env.STERLING_CODEX_BASE_URL
        || process.env.STERLING_CODEX_URL
        || process.env.STERLING_CODEX_HOST,
);

function resolveSterlingCodexBaseUrl(req) {
    if (ENV_STERLING_CODEX_BASE_URL) {
        return ENV_STERLING_CODEX_BASE_URL;
    }

    const forwardedProtoHeader = (req && req.headers && req.headers["x-forwarded-proto"]) || "";
    const forwardedProto = forwardedProtoHeader.split(",").map(segment => segment.trim()).find(Boolean);
    const protocol = forwardedProto
        || (req && typeof req.protocol === "string" && req.protocol)
        || (req && req.secure ? "https" : "http");

    // Grab host header but defensively strip any accidental path segments
    let hostHeaderRaw = (req && typeof req.get === "function" && req.get("host"))
        || (req && req.headers && req.headers.host)
        || "";
    // Some proxies may incorrectly include path info; only keep the hostname[:port]
    let hostHeader = "";
    try {
        hostHeader = String(hostHeaderRaw || "").split('/')[0].trim();
    } catch (_e) {
        hostHeader = String(hostHeaderRaw || "");
    }

    if (hostHeader) {
        return normalizeBaseUrl(`${protocol || "http"}://${hostHeader}/agent`);
    }

    return DEFAULT_STERLING_CODEX_BASE_URL;
}

function stripAgentPath(baseUrl) {
    const sanitized = normalizeBaseUrl(baseUrl);
    if (!sanitized) {
        return "";
    }
    try {
        const parsed = new URL(sanitized);
        parsed.search = "";
        parsed.hash = "";
        const normalizedPath = parsed.pathname.replace(/\/agent\/?$/, "");
        parsed.pathname = normalizedPath || "/";
        return parsed.toString().replace(/\/$/, "");
    } catch (_err) {
        return sanitized.replace(/\/agent\/?$/, "");
    }
}

function resolveEditorBaseUrl(req) {
    if (ENV_EDITOR_BASE_URL) {
        return stripAgentPath(ENV_EDITOR_BASE_URL);
    }
    return stripAgentPath(resolveSterlingCodexBaseUrl(req));
}

function buildSterlingCodexUrl(baseUrl, repoPath) {
    const sanitizedBase = normalizeBaseUrl(baseUrl);
    const sanitizedRepoPath = typeof repoPath === "string" ? repoPath.trim() : "";

    if (!sanitizedBase || !sanitizedRepoPath) {
        return "";
    }

    const separator = sanitizedBase.includes("?") ? "&" : "?";
    return `${sanitizedBase}${separator}repo_directory=${encodeURIComponent(sanitizedRepoPath)}`;
}

/**
 * Global Agent Instructions
 */
const GLOBAL_INSTRUCTIONS_PATH = path.join(
    PROJECT_ROOT,
    "data",
    "config",
    "global_agent_instructions.txt"
);
const GLOBAL_INSTRUCTIONS_KEY = "codex_global_instructions";
function loadGlobalInstructions() {
    console.log(`[DEBUG] loadGlobalInstructions() => Entered function.`);
    try {
        if (rdsStore.enabled) {
            const stored = rdsStore.getSetting(GLOBAL_INSTRUCTIONS_KEY);
            if (typeof stored === "string") {
                return stored;
            }
            return "";
        }
        if (!fs.existsSync(GLOBAL_INSTRUCTIONS_PATH)) {
            console.log(`[DEBUG] loadGlobalInstructions => File does not exist at ${GLOBAL_INSTRUCTIONS_PATH}`);
            return "";
        }
        console.log(`[DEBUG] loadGlobalInstructions => Found file at ${GLOBAL_INSTRUCTIONS_PATH}, reading...`);
        const content = fs.readFileSync(GLOBAL_INSTRUCTIONS_PATH, "utf-8");
        console.log(`[DEBUG] loadGlobalInstructions => Successfully read instructions. Length: ${content.length}`);
        return content;
    } catch (e) {
        console.error("Error reading global instructions:", e);
        return "";
    }
}
function saveGlobalInstructions(newInstructions) {
    if (rdsStore.enabled) {
        rdsStore.setSetting(GLOBAL_INSTRUCTIONS_KEY, newInstructions);
        return;
    }
    fs.writeFileSync(GLOBAL_INSTRUCTIONS_PATH, newInstructions, "utf-8");
}

/**
 * Convert a Git URL (SSH or HTTPS) to a clean HTTPS form for browser links.
 *  • git@github.com:user/repo.git  → https://github.com/user/repo
 *  • https://github.com/user/repo.git → https://github.com/user/repo
 *  • already-clean HTTPS links pass through untouched.
 */
function convertGitUrlToHttps(url) {
    if (!url) return "#";
    const trimmed = typeof url === "string" ? url.trim() : "";
    if (!trimmed) return "#";

    // SSH form: git@github.com:user/repo(.git)
    if (trimmed.startsWith("git@github.com:")) {
        let repo = trimmed.slice("git@github.com:".length);
        if (repo.endsWith(".git")) repo = repo.slice(0, -4);
        return `https://github.com/${repo}`;
    }

    let candidate = trimmed;
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)
        && /^(?:www\.)?github\.com\//i.test(candidate)) {
        candidate = `https://${candidate}`;
    }

    try {
        const parsed = new URL(candidate);
        let hostname = parsed.hostname.toLowerCase();
        if (hostname === "www.github.com") {
            hostname = "github.com";
        }
        if (hostname === "github.com") {
            const segments = parsed.pathname.split("/").filter(Boolean);
            if (segments.length >= 2) {
                const owner = segments[0];
                const repo = segments[1].replace(/\.git$/i, "");
                return `https://github.com/${owner}/${repo}`;
            }
        }
    } catch (error) {
        // fall through
    }

    // HTTPS with .git suffix
    if (candidate.startsWith("https://github.com/") && candidate.endsWith(".git")) {
        return candidate.slice(0, -4);
    }

    return trimmed;
}

/**
 * Import code-flow analyzer & helpers
 */
const { analyzeCodeFlow } = require("./code_flow_analyzer");
const {
    loadSingleRepoConfig,
    saveRepoConfig,
    getGitFileMetaData,
    loadRepoConfig,
    loadRepoJson,
    saveRepoJson,
    loadCodexConfig,
    saveCodexConfig,
    getDefaultCodexModel,
    getSessionCodexModel,
    setSessionCodexModel,
    resolveCodexModelForSession,
    DEFAULT_CODEX_MODEL,
    CODEX_MODEL_PATTERN,
    sanitizeSessionId,
    loadCodexRuns,
    upsertCodexRun,
} = require("../server_defs");

console.log("[DEBUG] Starting server_webserver.js => CWD:", process.cwd());
try {
    const defaultCodexModel = getDefaultCodexModel();
    console.log(`[INFO] Default Codex model resolved at startup: "${defaultCodexModel}"`);
} catch (err) {
    console.error(`[ERROR] Failed to resolve default Codex model at startup: ${err.message}`);
}

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

function normalizeHostname(req) {
    const header = req.hostname || req.get("host") || "";
    return header.split(":")[0].toLowerCase();
}

function buildSessionCookie(sessionId, hostname) {
    const expires = new Date(Date.now() + ONE_YEAR_MS);
    const parts = [
        `sessionId=${encodeURIComponent(sessionId)}`,
        "Path=/",
        `Expires=${expires.toUTCString()}`,
        `Max-Age=${Math.floor(ONE_YEAR_MS / 1000)}`,
    ];

    if (hostname === "alfe.sh" || hostname.endsWith(".alfe.sh")) {
        parts.push("Domain=.alfe.sh");
    }

    return parts.join("; ");
}

function ensureDirectory(targetPath) {
    if (!targetPath) {
        return;
    }
    if (!fs.existsSync(targetPath)) {
        fs.mkdirSync(targetPath, { recursive: true });
    }
}

function sanitizeRepoSegment(name, fallback = "repo") {
    if (typeof name !== "string") {
        return fallback;
    }
    const trimmed = name.trim();
    if (!trimmed) {
        return fallback;
    }
    return trimmed.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 160) || fallback;
}

function buildSessionRemoteRepoName(sessionId, repoName = NEW_SESSION_REPO_NAME) {
    const safeSessionId = sanitizeSessionId(sessionId) || "session";
    const safeRepoName = sanitizeRepoSegment(repoName);
    return sanitizeRepoSegment(`${safeSessionId}-${safeRepoName}`, `${safeRepoName}-session`);
}

function getSessionGitRoot(sessionId) {
    const safeId = sanitizeSessionId(sessionId);
    if (!safeId) {
        return null;
    }
    return path.join(SESSION_GIT_BASE_PATH, safeId);
}

function getSessionRepoPath(sessionId, repoName = NEW_SESSION_REPO_NAME) {
    const gitRoot = getSessionGitRoot(sessionId);
    if (!gitRoot) {
        return null;
    }
    return path.join(gitRoot, repoName);
}

function ensureGitRepository(repoDir) {
    if (!repoDir) {
        return;
    }
    const gitMetaDir = path.join(repoDir, ".git");
    if (fs.existsSync(gitMetaDir)) {
        return;
    }
    try {
        execSync("git init --initial-branch=main", {
            cwd: repoDir,
            stdio: "ignore",
        });
    } catch (error) {
        console.error(`[ERROR] ensureGitRepository: Failed to init ${repoDir} => ${error.message}`);
    }
}

function ensureSessionDefaultRepo(sessionId, repoName = NEW_SESSION_REPO_NAME) {
    if (!sessionId) {
        return;
    }
    const repoDir = getSessionRepoPath(sessionId, repoName);
    if (!repoDir) {
        return;
    }
    ensureDirectory(path.dirname(repoDir));

    const remoteRepoName = buildSessionRemoteRepoName(sessionId, repoName);
    const remoteRepoPath = path.join(GITHOST_REPO_ROOT, `${remoteRepoName}.git`);
    const gitHostScriptExists = fs.existsSync(GITHOST_SCRIPT_PATH);
    let clonedFromRemote = false;

    if (gitHostScriptExists) {
        try {
            execSync(`sudo "${GITHOST_SCRIPT_PATH}" create-repo "${remoteRepoName}"`, {
                stdio: "inherit",
            });
        } catch (error) {
            console.error(
                `[ERROR] ensureSessionDefaultRepo => Failed to create remote repo '${remoteRepoName}': ${error.message}`,
            );
        }

        if (fs.existsSync(remoteRepoPath)) {
            try {
                if (fs.existsSync(repoDir)) {
                    const entries = fs.readdirSync(repoDir);
                    if (entries.length > 0) {
                        fs.rmSync(repoDir, { recursive: true, force: true });
                        ensureDirectory(repoDir);
                    }
                } else {
                    ensureDirectory(repoDir);
                }

                execSync(`git clone "${remoteRepoPath}" "${repoDir}"`, {
                    stdio: "ignore",
                });
                clonedFromRemote = true;
            } catch (cloneError) {
                console.error(
                    `[ERROR] ensureSessionDefaultRepo => Failed to clone remote repo '${remoteRepoName}': ${cloneError.message}`,
                );
            }
        }
    }

    if (!clonedFromRemote) {
        ensureDirectory(repoDir);
        ensureGitRepository(repoDir);
    }

    // Create blank AGENTS.md and make an initial commit if repo has no commits
    try {
        const agentsPath = path.join(repoDir, "AGENTS.md");
        if (!fs.existsSync(agentsPath)) {
            fs.writeFileSync(agentsPath, "", { encoding: "utf-8" });
        }
        // Only create an initial commit if repository has no commits yet
        let hasCommit = true;
        try {
            execSync("git rev-parse --verify HEAD", { cwd: repoDir, stdio: "ignore" });
        } catch (e) {
            hasCommit = false;
        }
        if (!hasCommit) {
            try {
                execSync("git checkout -B main", { cwd: repoDir, stdio: "ignore" });
                execSync("git add AGENTS.md", { cwd: repoDir, stdio: "ignore" });
                execSync('git commit -m "Initial commit"', { cwd: repoDir, stdio: "ignore" });
                if (clonedFromRemote) {
                    try {
                        execSync("git push -u origin main", { cwd: repoDir, stdio: "ignore" });
                    } catch (pushErr) {
                        console.error(
                            `[ERROR] ensureSessionDefaultRepo => Failed to push initial commit to remote: ${pushErr.message}`,
                        );
                    }
                }
                console.debug(`[Server Debug] ensureSessionDefaultRepo => Created initial commit in ${repoDir}`);
            } catch (commitErr) {
                console.error(`[ERROR] ensureSessionDefaultRepo => Failed to create initial commit: ${commitErr.message}`);
            }
        }
    } catch (err) {
        console.error(`[ERROR] ensureSessionDefaultRepo => Failed to create AGENTS.md or commit: ${err.message}`);
    }

    try {
        const repoConfig = loadRepoConfig(sessionId) || {};
        const normalizedPath = repoDir;
        const gitRepoURL = clonedFromRemote && fs.existsSync(remoteRepoPath) ? remoteRepoPath : "";
        const existingEntry = repoConfig[repoName];
        const isDemoRepo = repoName === NEW_SESSION_REPO_NAME;
        const nextIsDemo = isDemoRepo ? true : existingEntry?.isDemo;
        const needsUpdate = !existingEntry
            || existingEntry.gitRepoLocalPath !== normalizedPath
            || (isDemoRepo && existingEntry?.isDemo !== true);
        if (needsUpdate) {
            repoConfig[repoName] = {
                ...(existingEntry || {}),
                gitRepoLocalPath: normalizedPath,
                gitRepoURL,
                isDemo: nextIsDemo,
            };
            saveRepoConfig(repoConfig, sessionId);
        }
    } catch (error) {
        console.error(`[ERROR] ensureSessionDefaultRepo: ${error.message}`);
    }
}

function parseCookies(req) {
    const header = req.headers.cookie || "";
    const cookies = {};
    header.split(";").forEach((c) => {
        const idx = c.indexOf("=");
        if (idx === -1) return;
        const name = c.slice(0, idx).trim();
        if (!name) return;
        const val = decodeURIComponent(c.slice(idx + 1).trim());
        cookies[name] = val;
    });
    return cookies;
}

function getSessionIdFromRequest(req) {
    const cookies = parseCookies(req);
    return cookies.sessionId || "";
}

function isPageViewRequest(req) {
    if ((req.method || "").toUpperCase() !== "GET") {
        return false;
    }
    const reqPath = req.path || req.url || "";
    if (!reqPath || reqPath.startsWith("/api/")) {
        return false;
    }
    if (/\.(?:js|mjs|css|png|jpe?g|gif|webp|svg|ico|map|json|txt|woff2?|ttf|eot)$/i.test(reqPath)) {
        return false;
    }
    const accept = (req.headers.accept || "").toLowerCase();
    return accept.includes("text/html") || accept.includes("application/xhtml+xml");
}


function getRequestIpAddresses(req) {
    const candidates = [];
    const forwarded = req.headers["x-forwarded-for"];
    if (Array.isArray(forwarded)) {
        forwarded.forEach((entry) => {
            String(entry || "").split(",").forEach((part) => candidates.push(part.trim()));
        });
    } else if (forwarded) {
        String(forwarded).split(",").forEach((part) => candidates.push(part.trim()));
    }
    if (req.ip) candidates.push(String(req.ip).trim());
    if (req.connection?.remoteAddress) candidates.push(String(req.connection.remoteAddress).trim());
    if (req.socket?.remoteAddress) candidates.push(String(req.socket.remoteAddress).trim());

    let ipv4 = "";
    let ipv6 = "";
    for (const raw of candidates) {
        if (!raw) continue;
        const normalized = raw.replace(/^::ffff:/i, "");
        const version = net.isIP(normalized) ? net.isIP(normalized) : net.isIP(raw);
        if (version === 4 && !ipv4) {
            ipv4 = normalized;
        } else if (version === 6 && !ipv6) {
            ipv6 = raw;
        }
        if (ipv4 && ipv6) break;
    }
    return { ipv4, ipv6 };
}

function ensureSessionIdCookie(req, res) {
    let sessionId = getSessionIdFromRequest(req);
    let created = false;

    if (!sessionId) {
        sessionId = randomUUID();
        created = true;
        const hostname = normalizeHostname(req);
        const cookie = buildSessionCookie(sessionId, hostname);
        res.append("Set-Cookie", cookie);
        console.debug(
            `[Server Debug] ensureSessionIdCookie => Issued new session ${sessionId.slice(0, 8)}… for host ${hostname || "(unknown)"}`,
        );

        try {
            const safeSessionDir = sanitizeSessionId(sessionId);
            if (safeSessionDir) {
                const gitRoot = path.join(path.sep, "git");
                const gitSessionDir = path.join(gitRoot, safeSessionDir);
                if (!fs.existsSync(gitSessionDir)) {
                    fs.mkdirSync(gitSessionDir, { recursive: true });
                    console.debug(
                        `[Server Debug] ensureSessionIdCookie => Created git session directory at ${gitSessionDir}`,
                    );
                }
            }
        } catch (error) {
            console.error(
                `[ERROR] ensureSessionIdCookie => Failed to initialize git session directory: ${error.message}`,
            );
        }
    }

    if (created) {
        ensureSessionDefaultRepo(sessionId);
    }

    return { sessionId, created };
}

app.use((req, res, next) => {
    const { sessionId } = ensureSessionIdCookie(req, res);
    req.sessionId = sessionId;
    res.locals.sessionId = sessionId;
    if (isPageViewRequest(req)) {
        // Only count views for the main agent route, not for asset requests
        // We check if this is a request to the base /agent route (and not for assets)
        const reqPath = req.path || req.url || "";
        if (reqPath === "/agent" || reqPath.startsWith("/agent/")) {
            const ipAddresses = getRequestIpAddresses(req);
            Promise.resolve(rdsStore.incrementSessionViewCount(sessionId, ipAddresses, reqPath)).catch((error) => {
                console.error(`[RdsStore] Failed to track page view: ${error?.message || error}`);
            });
        }
    }
    next();
});

// Serve static assets
app.use(express.static(path.join(PROJECT_ROOT, "public")));
app.use(express.static(path.join(PROJECT_ROOT, "images")));

app.use((req, res, next) => {
    res.locals.sterlingCodexBaseUrl = resolveSterlingCodexBaseUrl(req);
    res.locals.editorBaseUrl = resolveEditorBaseUrl(req);
    next();
});

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Multer upload dir
const UPLOAD_DIR = path.join(PROJECT_ROOT, "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const storage = multer.diskStorage({
    destination: (_, __, cb) => cb(null, UPLOAD_DIR),
    filename: (_, file, cb) => cb(null, file.originalname),
});
const upload = multer({ storage });

// Local-domain env banner
app.use((req, res, next) => {
    const host = req.headers.host;
    let environment = "unknown";
    if (
        host.includes("localwhimsy") ||
        host.includes("local.whimsy") ||
        host.includes("prod.whimsy")
    ) {
        environment = "PROD";
    } else if (host.includes("devwhimsy") || host.includes("dev.whimsy")) {
        environment = "DEV";
    }

    // if DEBUG=true from .env, set environment = "DEV"
    if (process.env.DEBUG) {
        environment = "DEV";
    }

    res.locals.environment = environment;
    if (process.env.DEBUG) {
        console.log(`[DEBUG] Host: ${host}, Environment: ${environment}`);
    }
    next();
});

// Pass debug mode to templates if DEBUG is set
app.use((req, res, next) => {
    res.locals.debugMode = !!process.env.DEBUG;
    next();
});

// EJS
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

/**
 * Normalize provider names to ensure OpenRouter usage.
 */
function normalizeProviderName(provider) {
    const normalized = (provider || "").toString().trim().toLowerCase();
    if (!normalized) {
        return "";
    }
    if (normalized === "openai") {
        return "openrouter";
    }
    return normalized;
}

/**
 * Create OpenAI-compatible client for chosen provider
 */
function getOpenAIClient(provider) {
    provider = normalizeProviderName(provider);

    if (provider === "openrouter") {
        const apiKey = process.env.OPENROUTER_API_KEY;
        if (!apiKey) {
            console.warn(
                "[WARN] getOpenAIClient: OPENROUTER_API_KEY missing; OpenRouter provider unavailable."
            );
            return null;
        }
        const refererHeader =
            process.env.OPENROUTER_HTTP_REFERER
            || process.env.HTTP_REFERER
            || "https://code-s.alfe.sh231";
        const baseRefererHeader =
            typeof refererHeader === "string" && refererHeader.trim()
                ? refererHeader.trim()
                : "https://code-s.alfe.sh231";
        const baseTitleHeader =
            process.env.OPENROUTER_APP_TITLE
            || process.env.X_TITLE
            || "Alfe AI";
        let titleWithTaskId = baseTitleHeader;
        let refererWithTaskId = baseRefererHeader;
        try {
            const taskInfo = globalTaskCounter.getNextTaskInfo(baseTitleHeader);
            titleWithTaskId = taskInfo.title;
            if (typeof taskInfo.taskId === "number" && Number.isFinite(taskInfo.taskId)) {
                refererWithTaskId = `${baseRefererHeader}${taskInfo.taskId}`;
            }
        } catch (error) {
            console.warn(
                `[WARN] Failed to allocate global agent task title: ${error.message}`
            );
        }
        return new OpenAI({
            baseURL: "https://openrouter.ai/api/v1",
            apiKey,
            defaultHeaders: {
                "HTTP-Referer": refererWithTaskId,
                "X-Title": titleWithTaskId,
            },
        });
    }
    if (provider === "litellm" || provider === "lite_llm") {
        const { LiteLLM } = require("litellm");
        return new LiteLLM({});
    }
    if (provider === "deepseek api") {
        const apiKey = process.env.DEEPSEEK_API_KEY;
        if (!apiKey) {
            console.warn(
                "[WARN] getOpenAIClient: DEEPSEEK_API_KEY missing; DeepSeek API provider unavailable."
            );
            return null;
        }
        return new OpenAI({
            baseURL: "https://api.deepseek.ai/v1",
            apiKey,
        });
    }
    if (provider === "deepseek local") {
        const apiKey = process.env.DEEPSEEK_API_KEY;
        if (!apiKey) {
            console.warn(
                "[WARN] getOpenAIClient: DEEPSEEK_API_KEY missing; DeepSeek local provider unavailable."
            );
            return null;
        }
        return new OpenAI({
            baseURL: "http://localhost:8000/v1",
            apiKey,
        });
    }
    throw new Error(`Unknown provider: ${provider}`);
}

/**
 * Cache of available models per provider
 */
let AIModels = {};
/**
 * Cache of context limits (max tokens) per provider -> model id.
 */
let AIModelContextLimits = {};

/**
 * Fetch & cache model list
 */
async function fetchAndSortModels(provider) {
    const normalizedProvider = normalizeProviderName(provider);
    try {
        if (!normalizedProvider) {
            console.warn("[WARN] fetchAndSortModels: Provider name missing.");
            return;
        }
        console.log(`[DEBUG] Fetching model list for provider: ${normalizedProvider}`);
        const client = getOpenAIClient(normalizedProvider);
        if (!client) {
            console.warn(
                `[WARN] fetchAndSortModels: Skipping provider '${normalizedProvider}' because it is not configured.`
            );
            AIModels[normalizedProvider] = [];
            return;
        }
        const models = await client.models.list();
        const modelList = models.data || [];
        const limitsMap = {};
        const normalizedModels = modelList
            .map((m) => {
                if (!m || typeof m.id !== "string") {
                    return null;
                }
                const id = m.id;
                let limit = null;
                // Prefer explicit provider fields if available
                if (m.max_tokens != null) limit = Number(m.max_tokens);
                if (limit == null && m.context_length != null) limit = Number(m.context_length);
                if (limit == null && m.max_context_length != null) limit = Number(m.max_context_length);
                if (limit == null && m.max_request_tokens != null) limit = Number(m.max_request_tokens);

                // Heuristics by model family/name if still null
                if (limit == null || Number.isNaN(limit)) {
                    const lower = id.toLowerCase();
                    if (lower.includes("gpt-5")) limit = 200000;
                    else if (lower.includes("gpt-4-turbo") || lower.includes("gpt-4o")) limit = 128000;
                    else if (lower.includes("gpt-4")) limit = 8192;
                    else if (lower.includes("claude-3")) limit = 200000;
                    else if (lower.includes("claude-2")) limit = 100000;
                    else if (lower.includes("mistral-large")) limit = 128000;
                    else if (lower.includes("llama-3")) limit = 128000;
                }

                // Cache it for later use
                if (limit != null) {
                    limitsMap[id] = limit;
                }

                return {
                    id,
                    name: id,
                    maxContextLength: limit,
                    provider: normalizedProvider
                };
            })
            .filter(Boolean);

        AIModels[normalizedProvider] = normalizedModels;
        AIModelContextLimits[normalizedProvider] = limitsMap;
    } catch (error) {
        console.error(`[ERROR] fetchAndSortModels: ${error.message}`);
        AIModels[normalizedProvider] = [];
        AIModelContextLimits[normalizedProvider] = {};
    }
}

// Load and return the list of models for specified provider.
async function getProviderModels(provider) {
    const normalizedProvider = normalizeProviderName(provider);
    if (!normalizedProvider) {
        console.warn("[WARN] getProviderModels: Provider name missing.");
        return [];
    }
    if (!AIModels[normalizedProvider]) {
        await fetchAndSortModels(normalizedProvider);
    }
    return AIModels[normalizedProvider];
}

// Load and return the context limit for specified model or provider.
function getProviderContextLimit(provider, model) {
    const normalizedProvider = normalizeProviderName(provider);
    if (!normalizedProvider) {
        console.warn("[WARN] getProviderContextLimit: Provider name missing.");
        return null;
    }
    const limits = AIModelContextLimits[normalizedProvider] || {};
    return model ? limits[model] : null;
}

const modelLoaderTask = globalTaskCounter.newTask("Models", "Loading models");
modelLoaderTask.start();
fetchAndSortModels("openrouter")
    .then(() => {
        console.log("[DEBUG] Initial model list fetch complete.");
        modelLoaderTask.complete();
    })
    .catch((error) => {
        console.error("[ERROR] Initial model list fetch failed:", error.message);
        modelLoaderTask.fail(error);
    });

// --- Route handlers ---

const getRoutes = require("./webserver/get_routes.js");
const postRoutes = require("./webserver/post_routes.js");

// --- Apply routes to the app ---

getRoutes(app, rdsStore);
postRoutes(app, rdsStore);

// --- Main application routes ---
app.get("/", (req, res) => {
    console.debug("[Server Debug] GET / => Serving aurora.html");
    res.sendFile(path.join(PROJECT_ROOT, "public", "aurora.html"));
});

const projectViewPublicDir = path.join(PROJECT_ROOT, "public", "projectView");
const projectViewRouter = express.Router();

// ... (rest of the file continues as before)