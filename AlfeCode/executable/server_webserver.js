require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");
const globalTaskCounter = require("./globalTaskCounter");
const os = require("os");
const { exec, execSync, spawn } = require("child_process");
const { randomUUID } = require("crypto");
const multer = require("multer");
const bodyParser = require("body-parser");
const cron = require("node-cron");
const http = require("http");
const https = require("https");
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

                const normalized = {
                    ...m,
                    id,
                };
                if (!normalized.name) {
                    normalized.name = id;
                }
                if (limit != null && !Number.isNaN(limit)) {
                    normalized.max_tokens = limit;
                    limitsMap[id] = limit;
                }
                return normalized;
            })
            .filter(Boolean)
            .sort((a, b) => a.id.localeCompare(b.id));
        AIModelContextLimits[normalizedProvider] = limitsMap;
        AIModels[normalizedProvider] = normalizedModels;
        console.log(
            `[DEBUG] Loaded ${AIModels[normalizedProvider].length} models for provider: ${normalizedProvider}`
        );
    } catch (err) {
        console.error("[ERROR] fetchAndSortModels:", err);
        if (normalizedProvider) {
            AIModels[normalizedProvider] = [];
            AIModelContextLimits[normalizedProvider] = {};
        }
    }
}
["openrouter"].forEach(fetchAndSortModels);
cron.schedule("0 0 * * *", () =>
    ["openrouter"].forEach(fetchAndSortModels)
);

/**
 * Directory-analyzer
 */
const { analyzeProject } = require("./directory_analyzer");

/**
 * EXCLUDED_FILENAMES placeholder (currently empty set)
 */
const EXCLUDED_FILENAMES = new Set();

/**
 * Helper function to gather Git metadata for the repository (local).
 */
// Simple in-memory cache for git metadata and branches
const GIT_CACHE_TTL_MS = Number(process.env.GIT_CACHE_TTL_MS || 300000); // default 5 minutes
const gitMetaCache = new Map();
const gitBranchesCache = new Map();

function _getFromCache(cacheMap, repoPath) {
  try {
    const entry = cacheMap.get(repoPath);
    if (!entry) return null;
    if (Date.now() - entry.ts > GIT_CACHE_TTL_MS) {
      cacheMap.delete(repoPath);
      return null;
    }
    return entry.value;
  } catch (e) {
    return null;
  }
}

function _setCache(cacheMap, repoPath, value) {
  try {
    cacheMap.set(repoPath, { ts: Date.now(), value });
  } catch (e) { /* ignore */ }
}

function getGitMetaData(repoPathInput) {
    const repoPath = repoPathInput || process.cwd();

    // Try in-memory cache first
    const _cachedMeta = _getFromCache(gitMetaCache, repoPath);
    if (_cachedMeta) {
        return _cachedMeta;
    }

    let rev = "";
    let dateStr = "";
    let branchName = "";
    let latestTag = "";
    let remoteUrl = "";
    let remoteName = "";

    try {
        rev = execSync("git rev-parse HEAD", { cwd: repoPath })
            .toString()
            .trim();
        dateStr = execSync("git show -s --format=%ci HEAD", { cwd: repoPath })
            .toString()
            .trim();
        branchName = execSync("git rev-parse --abbrev-ref HEAD", {
            cwd: repoPath,
        })
            .toString()
            .trim();

        // Attempt to find a tag at HEAD
        try {
            latestTag = execSync("git describe --tags --abbrev=0 HEAD", {
                cwd: repoPath,
            })
                .toString()
                .trim();
        } catch (tagErr) {
            latestTag = "No tags available";
        }

        try {
            remoteUrl = execSync("git remote get-url origin", { cwd: repoPath })
                .toString()
                .trim();
            if (remoteUrl) {
                remoteName = "origin";
            }
        } catch (remoteErr) {
            try {
                const remotes = execSync("git remote", { cwd: repoPath })
                    .toString()
                    .trim()
                    .split("\n")
                    .map((line) => line.trim())
                    .filter(Boolean);
                if (remotes.length > 0) {
                    remoteName = remotes[0];
                    remoteUrl = execSync(`git remote get-url ${remoteName}`, {
                        cwd: repoPath,
                    })
                        .toString()
                        .trim();
                }
            } catch (fallbackErr) {
                remoteUrl = "";
                remoteName = "";
            }
        }
    } catch (e) {
        console.error("[ERROR] getGitMetaData:", e);
    }
    const _result = {
        rev,
        dateStr,
        branchName,
        latestTag,
        remoteUrl,
        remoteName,
    };
    try { _setCache(gitMetaCache, repoPath, _result); } catch(e){}
    return _result;
}


/**
 * Basic list of commits
 */
function getGitCommits(repoPath, options = {}) {
    const limitRaw = Number(options.limit);
    const skipRaw = Number(options.skip);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0
        ? Math.min(Math.floor(limitRaw), 500)
        : 0;
    const skip = Number.isFinite(skipRaw) && skipRaw > 0
        ? Math.min(Math.floor(skipRaw), Number.MAX_SAFE_INTEGER)
        : 0;

    const args = [
        "log",
        '--pretty=format:"%h - %an, %ad : %s"',
        "--date=iso",
    ];

    if (skip > 0) {
        args.push(`--skip=${skip}`);
    }
    if (limit > 0) {
        args.push(`-n ${limit}`);
    }

    try {
        const gitLog = execSync(`git ${args.join(" ")}`, {
            cwd: repoPath,
            maxBuffer: 1024 * 1024,
        }).toString();
        return gitLog
            .split("\n")
            .map((line) => line.trimEnd())
            .filter((line) => line.length > 0);
    } catch (err) {
        console.error("[ERROR] getGitCommits:", err);
        return [];
    }
}

/**
 * Build a commit graph
 */
function getGitCommitGraph(repoPath, options = {}) {
    const limitRaw = Number(options.limit);
    const skipRaw = Number(options.skip);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0
        ? Math.min(Math.floor(limitRaw), MAX_GIT_COMMIT_GRAPH_LIMIT)
        : DEFAULT_GIT_COMMIT_GRAPH_LIMIT;
    const skip = Number.isFinite(skipRaw) && skipRaw > 0 ? Math.max(Math.floor(skipRaw), 0) : 0;

    const args = [
        "log",
        '--pretty=format:"%h%x09%p%x09%an%x09%ad%x09%d%x09%s"',
        "--date=iso",
    ];

    if (skip > 0) {
        args.push(`--skip=${skip}`);
    }
    if (limit > 0) {
        args.push(`-n ${limit}`);
    }

    try {
        const gitLog = execSync(`git ${args.join(" ")}`, {
            cwd: repoPath,
            maxBuffer: 1024 * 1024,
        }).toString();

        return gitLog.split("\n").map((line) => {
            const parts = line.split("\t");
            const [hash, parents, author, date, refsOrMessage, maybeMessage] = parts;
            const hasRefs = parts.length >= 6;
            const message = hasRefs ? maybeMessage : refsOrMessage;
            const refs = hasRefs ? refsOrMessage : "";
            return {
                hash,
                parents: parents ? parents.split(" ") : [],
                author,
                date,
                refs: refs ? refs.trim() : "",
                message,
            };
        });
    } catch (err) {
        console.error("[ERROR] getGitCommitGraph:", err);
        return [];
    }
}

function getGitBranches(repoPath) {
    const _cachedBranches = _getFromCache(gitBranchesCache, repoPath);
    if (_cachedBranches) {
        return _cachedBranches;
    }
    try {
        const branchOutput = execSync(
            'git for-each-ref --sort=-committerdate --format="%(if)%(HEAD)%(then)*%(else) %(end)%(refname:short)\t%(objectname:short)\t%(authorname)\t%(committerdate:relative)\t%(refname)" refs/heads refs/remotes',
            {
                cwd: repoPath,
                maxBuffer: 1024 * 512,
            }
        )
            .toString()
            .split("\n");

        const branches = [];

        for (const rawLine of branchOutput) {
            const line = rawLine || "";
            if (!line.trim()) {
                continue;
            }

            const parts = line.split("\t");
            if (parts.length < 5) {
                continue;
            }

            const [nameToken, hash, author, dateRelative, fullRefName] = parts;
            const isCurrent = nameToken.trim().startsWith("*");
            const cleanedName = nameToken.replace(/^[*\s]+/, "").trim();

            if (!cleanedName || /\bHEAD\s*->/.test(cleanedName)) {
                continue;
            }

            const isRemote = (fullRefName || "").startsWith("refs/remotes/");

            let sterlingParent = "";
            try {
                const cfg = execSync(`git config branch."${cleanedName}".sterlingParent`, { cwd: repoPath, stdio: ['pipe','pipe','ignore'] }).toString().trim();
                if (cfg) sterlingParent = cfg;
            } catch (_e) {}

            branches.push({
                name: cleanedName,
                hash,
                sterlingParent: sterlingParent,
                author,
                dateRelative,
                isCurrent,
                isRemote,
                fullRefName,
            });
        }

        try { _setCache(gitBranchesCache, repoPath, branches); } catch(e){}
        return branches;
    } catch (err) {
        console.error("[ERROR] getGitBranches:", err);
        return [];
    }
}

/**
 * Update/pull from git
 */
function gitUpdatePull(repoPath) {
    return new Promise((resolve, reject) => {
        exec("git pull", { cwd: repoPath }, (err, stdout, stderr) => {
            if (err) {
                console.error("[ERROR] git pull failed:", stderr);
                reject(stderr);
                return;
            }
            console.log("[DEBUG] git pull success:", stdout);
            resolve(stdout);
        });
    });
}

/**
 * Generate directory tree as HTML, skipping hidden + excluded
 */
function generateDirectoryTree(dirPath, rootDir, repoName, attachedFiles) {
    if (!fs.existsSync(dirPath)) {
        return `<p>[Directory not found: ${dirPath}]</p>`;
    }
    let html = "<ul>";

    let items = fs.readdirSync(dirPath, { withFileTypes: true });
    items = items.filter((item) => {
        if (item.name.startsWith(".")) {
            return false;
        }
        if (EXCLUDED_FILENAMES.has(item.name)) {
            return false;
        }
        return true;
    });

    // directories first, then files
    items.sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
    });

    for (const item of items) {
        const absolutePath = path.join(dirPath, item.name);
        let stat;
        try {
            stat = fs.statSync(absolutePath);
        } catch (e) {
            continue;
        }
        const relativePath = path.relative(rootDir, absolutePath).split(path.sep).join("/");

        if (stat.isDirectory()) {
            html += `
<li class="folder collapsed">
  <span class="tree-label">${item.name}</span>
  ${generateDirectoryTree(absolutePath, rootDir, repoName, attachedFiles)}
</li>`;
        } else {
            const isAttached = attachedFiles.includes(relativePath);
            const selectedClass = isAttached ? "selected-file" : "";
            html += `
<li>
  <span class="file-item ${selectedClass}"
        data-repo="${repoName}"
        data-path="${relativePath}">
    ${item.name}
  </span>
</li>`;
        }
    }

    html += "</ul>";
    return html;
}

function generateFullDirectoryTree(repoPath, repoName, attachedFiles) {
    return generateDirectoryTree(repoPath, repoPath, repoName, attachedFiles);
}

/**
 * Distinguish active vs. inactive chats
 */
function getActiveInactiveChats(jsonObj) {
    const activeChats = [];
    const inactiveChats = [];
    const archivedChats = [];
    const archivedContextChats = [];
    for (const key of Object.keys(jsonObj)) {
        const chatNumber = parseInt(key, 10);
        if (isNaN(chatNumber)) continue;
        const status = (jsonObj[key].status || "INACTIVE").toUpperCase();
        if (status === "ACTIVE") {
            activeChats.push({ number: chatNumber, status: "ACTIVE" });
        } else if (status === "ARCHIVED_CONTEXT") {
            archivedContextChats.push({ number: chatNumber, status: "ARCHIVED_CONTEXT" });
        } else if (status === "ARCHIVED") {
            archivedChats.push({ number: chatNumber, status: "ARCHIVED" });
        } else {
            inactiveChats.push({ number: chatNumber, status: "INACTIVE" });
        }
    }
    return { activeChats, inactiveChats, archivedChats, archivedContextChats };
}

/**
 * Clone repository if needed
 */
function cloneRepository(repoName, repoURL, sessionId, callback) {
    const safeSession = sanitizeSessionId(sessionId) || "session";
    const cloneBase = path.join(path.sep, "git", "sterling", safeSession);
    const clonePath = path.join(cloneBase, repoName);

    if (!fs.existsSync(cloneBase)) fs.mkdirSync(cloneBase, { recursive: true });

    if (fs.existsSync(clonePath)) {
        console.log("[DEBUG] Repository already exists:", clonePath);
        return callback(null, clonePath);
    }

    exec(`git clone ${repoURL} "${clonePath}"`, (error, stdout, stderr) => {
        if (error) {
            const stderrText = typeof stderr === "string" ? stderr : "";
            const message = stderrText || error.message || "Failed to clone repository.";
            const permissionDenied =
                /permission denied \(publickey\)/i.test(stderrText)
                || /could not read from remote repository/i.test(stderrText);
            const enhancedError = new Error(message);
            enhancedError.code = error.code;
            enhancedError.sshKeyRequired = permissionDenied;
            enhancedError.stderr = stderrText;
            console.error("[ERROR] cloneRepository:", message);
            return callback(enhancedError, null);
        }
        console.log("[DEBUG] Successfully cloned:", repoName);
        callback(null, clonePath);
    });
}

/* ------------- REGISTER POST ROUTES (new refactor) ------------- */
const { setupPostRoutes } = require("./webserver/post_routes");
setupPostRoutes({
    app,
    upload,
    cloneRepository,
    loadRepoConfig,
    saveRepoConfig,
    loadRepoJson,
    saveRepoJson,
    loadSingleRepoConfig,
    saveGlobalInstructions,
    gitUpdatePull,
    getOpenAIClient,
    fetchAndSortModels,
    AIModels,
    AIModelContextLimits,
    DEFAULT_AIMODEL,
    PROJECT_ROOT,
    loadCodexConfig,
    saveCodexConfig,
    getDefaultCodexModel,
    getSessionCodexModel,
    setSessionCodexModel,
    resolveCodexModelForSession,
    DEFAULT_CODEX_MODEL,
    CODEX_MODEL_PATTERN,
    loadCodexRuns,
    upsertCodexRun,
});


app.use("/vm_runs", vmRunsRouter);

/* ------------- REGISTER GET ROUTES (new) ------------- */
const { setupGetRoutes } = require("./webserver/get_routes");
setupGetRoutes({
    app,
    loadRepoConfig,
    saveRepoConfig,
    loadRepoJson,
    saveRepoJson,
    loadSingleRepoConfig,
    loadCodexConfig,
    loadGlobalInstructions,
    getActiveInactiveChats,
    generateFullDirectoryTree,
    getGitMetaData,
    getGitCommits,
    getGitCommitGraph,
    getGitBranches,
    convertGitUrlToHttps,
    analyzeProject,
    analyzeCodeFlow,
    AIModels,
    AIModelContextLimits,
    DEFAULT_AIMODEL,
    execSync,
    PROJECT_ROOT,
    spawn,
    getDefaultCodexModel,
    getSessionCodexModel,
    resolveCodexModelForSession,
    DEFAULT_CODEX_MODEL,
    CODEX_MODEL_PATTERN,
    buildSterlingCodexUrl,
    loadCodexRuns,
    upsertCodexRun,
    vmManager,
    ensureSessionDefaultRepo,
    buildSessionCookie,
    normalizeHostname,
    rdsStore,
});

/**
 * Import the api_connector.js router
 */
const apiConnector = require("../alfe/Aurelix/dev/api_connector.js");

// Host the routes from apiConnector at /api
app.use("/api", apiConnector);


/**
 * Start server
 */
const debugPort = 3444;
let httpPort;
if (process.env.DEBUG) {
    console.log(`[DEBUG] environment variable set => Using debug port ${debugPort}`);
    httpPort = debugPort;
} else {
    httpPort = parseInt(process.env.SERVER_PORT, 10) || 3333;
}

const httpsPort = parseInt(process.env.HTTPS_PORT, 10) || 443;
const httpsDisabled = String(process.env.ENABLE_HTTPS || "true").toLowerCase() === "false";
const configDir = path.join(PROJECT_ROOT, "data", "config");
const defaultKeyPath = path.join(configDir, "selfsigned-key.pem");
const defaultCertPath = path.join(configDir, "selfsigned-cert.pem");

function ensureDirectory(targetPath) {
    if (!fs.existsSync(targetPath)) {
        fs.mkdirSync(targetPath, { recursive: true });
    }
}

function loadProvidedCertificates(keyPath, certPath) {
    if (!keyPath || !certPath) {
        return null;
    }
    if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
        return null;
    }

    try {
        return {
            key: fs.readFileSync(keyPath),
            cert: fs.readFileSync(certPath),
        };
    } catch (error) {
        console.error(`[ERROR] Failed to read provided HTTPS certificates: ${error.message}`);
        return null;
    }
}

function loadOrCreateSelfSignedCertificates() {
    try {
        ensureDirectory(configDir);

        const cn = process.env.SELFSIGNED_COMMON_NAME || "localhost";

        if (!fs.existsSync(defaultKeyPath) || !fs.existsSync(defaultCertPath)) {
            console.log("[DEBUG] Generating self-signed certificate for HTTPS server using OpenSSL.");
            const opensslAvailable = (() => {
                try {
                    execSync("openssl version", { stdio: "ignore" });
                    return true;
                } catch (error) {
                    console.error(`[ERROR] OpenSSL not available for self-signed certificate generation: ${error.message}`);
                    return false;
                }
            })();

            if (!opensslAvailable) {
                return null;
            }

            const tempConfigPath = path.join(configDir, `selfsigned-${Date.now()}.cnf`);
            const altNames = [
                { type: "DNS", value: cn },
                { type: "DNS", value: "localhost" },
                { type: "IP", value: "127.0.0.1" },
            ];

            const altNameLines = altNames
                .map((entry, index) => `${entry.type}.${index + 1} = ${entry.value}`)
                .join("\n");

            const configContent = [
                "[req]",
                "default_bits = 2048",
                "prompt = no",
                "default_md = sha256",
                "req_extensions = req_ext",
                "distinguished_name = dn",
                "",
                "[dn]",
                `CN = ${cn}`,
                "",
                "[req_ext]",
                "subjectAltName = @alt_names",
                "",
                "[alt_names]",
                altNameLines,
                "",
            ].join("\n");

            fs.writeFileSync(tempConfigPath, configContent);

            try {
                execSync(
                    `openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout "${defaultKeyPath}" -out "${defaultCertPath}" -config "${tempConfigPath}"`,
                    { stdio: "ignore" }
                );
                fs.chmodSync(defaultKeyPath, 0o600);
            } catch (error) {
                console.error(`[ERROR] Failed to generate self-signed certificate: ${error.message}`);
                return null;
            } finally {
                try {
                    fs.unlinkSync(tempConfigPath);
                } catch (cleanupError) {
                    console.error(`[WARN] Unable to remove temporary OpenSSL config: ${cleanupError.message}`);
                }
            }
        }

        return {
            key: fs.readFileSync(defaultKeyPath),
            cert: fs.readFileSync(defaultCertPath),
        };
    } catch (error) {
        console.error(`[ERROR] Unable to create or load self-signed certificates: ${error.message}`);
        return null;
    }
}

const providedKeyPath = process.env.HTTPS_KEY_PATH;
const providedCertPath = process.env.HTTPS_CERT_PATH;
let httpsOptions = loadProvidedCertificates(providedKeyPath, providedCertPath);

if (!httpsOptions && !httpsDisabled) {
    httpsOptions = loadOrCreateSelfSignedCertificates();
}



// Ensure port is free by attempting to find and kill existing listeners.
function ensurePortIsFree(port) {
    try {
        // Try lsof first
        const lsofCmd = `lsof -ti :${port}`;
        let out = null;
        try {
            out = execSync(lsofCmd, { encoding: 'utf8' }).toString().trim();
        } catch (e) {
            out = '';
        }
        if (out) {
            const pids = out.split(/\s+/).filter(Boolean);
            if (pids.length) {
                console.log(`[DEBUG] Port ${port} in use by pids ${pids.join(',')}; attempting to kill`);
                pids.forEach(pid => {
                    try { process.kill(Number(pid), 'SIGTERM'); } catch (e) { try { process.kill(Number(pid), 'SIGKILL'); } catch (e) {} }
                });
                return true;
            }
        }

        // Try fuser as a next option
        try {
            execSync(`fuser -k ${port}/tcp`, { stdio: 'ignore' });
            console.log(`[DEBUG] Used fuser to kill processes on port ${port}`);
            return true;
        } catch (e) {
            // ignore
        }

        // Fallback: try ss to detect process and kill
        try {
            const ssOut = execSync(`ss -ltnp sport = :${port}`, { encoding: 'utf8' }).toString();
            const lines = ssOut.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
            for (const line of lines) {
                const m = line.match(/pid=(\d+),/);
                if (m) {
                    const pid = m[1];
                    try { process.kill(Number(pid), 'SIGTERM'); } catch (e) { try { process.kill(Number(pid), 'SIGKILL'); } catch (e) {} }
                    console.log(`[DEBUG] Killed pid ${pid} from ss output for port ${port}`);
                    return true;
                }
            }
        } catch (e) {
            // ignore
        }
    } catch (err) {
        console.error(`[WARN] ensurePortIsFree failed for port ${port}: ${err && err.message}`);
    }
    return false;
}

let httpsServerStarted = false;
if (!httpsDisabled && httpsOptions) {
    try { ensurePortIsFree(httpsPort); } catch(e) { console.warn('[WARN] Failed to free httpsPort', e); }

    https.createServer(httpsOptions, app).listen(httpsPort, () => {
        console.log(`[DEBUG] HTTPS server running => https://localhost:${httpsPort}`);
    });
    httpsServerStarted = true;
} else {
    console.log("[DEBUG] HTTPS server disabled or certificates unavailable. Skipping HTTPS listener.");
}


if (httpsServerStarted && httpsPort === httpPort) {
    console.log(`[DEBUG] HTTP listener skipped because HTTPS is using port ${httpsPort}.`);
} else {
    try { ensurePortIsFree(httpPort); } catch(e) { console.warn('[WARN] Failed to free httpPort', e); }
    http.createServer(app).listen(httpPort, () => {
        console.log(`[DEBUG] Server running => http://localhost:${httpPort}`);
    });
}

startNodeHeartbeat();

const projectViewPublicDir = path.join(
  __dirname,
  "../public/ProjectView"
);

const projectViewRouter = express.Router();

projectViewRouter.get("/api/projects", async (req, res) => {
  const { sessionId } = ensureSessionIdCookie(req, res);
  try {
    const projects = await readProjectViewProjects(sessionId);
    res.json(projects);
  } catch (err) {
    console.error("[ProjectView] Failed to load projects:", err);
    res.status(500).json({ message: "Unable to load projects." });
  }
});

projectViewRouter.post("/api/projects", async (req, res) => {
  const { sessionId } = ensureSessionIdCookie(req, res);
  const projects = req.body;
  if (!Array.isArray(projects)) {
    return res
      .status(400)
      .json({ message: "Request body must be an array of projects." });
  }

  try {
    await writeProjectViewProjects(projects, sessionId);
    res.status(200).json({ message: "Projects saved successfully." });
  } catch (err) {
    console.error("[ProjectView] Failed to save projects:", err);
    res.status(500).json({ message: "Unable to save projects." });
  }
});



projectViewRouter.get('/api/filepath', (req, res) => {
  try {
    const { sessionId } = ensureSessionIdCookie(req, res);
    const dataDir = path.dirname(projectViewDataFile);
    const filePath = sessionId ? path.join(dataDir, `${sessionId}.json`) : projectViewDataFile;
    res.json({ path: filePath });
  } catch (err) {
    console.error('[ProjectView] Unable to retrieve projectView data file path:', err);
    res.status(500).json({ message: 'Unable to retrieve project data file path.' });
  }
});

// ProjectView data helpers (migrated from Aurora)
const { mkdir, readFile, writeFile, access, unlink, readdir } = fs.promises;
const projectViewDataFile = path.join(__dirname, "../data/projectView/projects.json");
const legacyProjectViewDataFile = path.join(__dirname, "../../ProjectView/data/projects.json");
let projectViewDataMigrationPromise = null;

function isSterlingGitProjectEntry(project) {
  if (!project || typeof project !== 'object') {
    return false;
  }

  if (
    project.isSterlingGitProject ||
    project.isSterlingGit ||
    project.sterlingGitProject ||
    (typeof project.source === 'string' && project.source.toLowerCase().includes('sterling-git'))
  ) {
    return true;
  }

  const typeCandidates = [project.type, project.category, project.projectType];
  if (
    typeCandidates.some(
      (value) => typeof value === 'string' && value.toLowerCase().includes('sterling'),
    )
  ) {
    return true;
  }

  const tagSets = [project.tags, project.labels];
  if (
    tagSets.some(
      (tags) =>
        Array.isArray(tags) &&
        tags.some((tag) => typeof tag === 'string' && tag.toLowerCase().includes('sterling')),
    )
  ) {
    return true;
  }

  const metadata = project.metadata && typeof project.metadata === 'object' ? project.metadata : null;
  if (metadata) {
    if (
      metadata.isSterlingGitProject ||
      metadata.isSterlingGit ||
      metadata.sterlingGitProject
    ) {
      return true;
    }

    const metadataTypeCandidates = [metadata.type, metadata.category, metadata.source];
    if (
      metadataTypeCandidates.some(
        (value) => typeof value === 'string' && value.toLowerCase().includes('sterling'),
      )
    ) {
      return true;
    }

    if (
      Array.isArray(metadata.tags) &&
      metadata.tags.some((tag) => typeof tag === 'string' && tag.toLowerCase().includes('sterling'))
    ) {
      return true;
    }
  }

  const gitIndicators = [
    project.gitRepoLocalPath,
    project.gitRepoNameCLI,
    project.gitRepoName,
    project.gitRepoURL,
    project.repoLocalPath,
  ];

  return gitIndicators.some((value) => typeof value === 'string' && value.trim() !== '');
}

function sanitizeProjectViewEntries(projectList) {
  if (!Array.isArray(projectList)) {
    return { sanitized: [], removed: 0 };
  }

  const normalized = projectList.filter((entry) => entry && typeof entry === 'object');
  const sanitized = normalized.filter((entry) => !isSterlingGitProjectEntry(entry));
  return { sanitized, removed: normalized.length - sanitized.length };
}

async function migrateLegacyProjectViewDataIfNeeded() {
  if (!projectViewDataMigrationPromise) {
    projectViewDataMigrationPromise = (async () => {
      try {
        await access(legacyProjectViewDataFile);
      } catch (err) {
        if (err?.code === 'ENOENT') {
          return;
        }
        console.warn('[ProjectView] Skipping legacy data migration: unable to access legacy file:', err);
        return;
      }
      try {
        const legacyPayload = await readFile(legacyProjectViewDataFile, 'utf-8');
        await mkdir(path.dirname(projectViewDataFile), { recursive: true });
        await writeFile(projectViewDataFile, legacyPayload, 'utf-8');
        try { await unlink(legacyProjectViewDataFile); } catch (removeErr) { if (removeErr?.code !== 'ENOENT') console.warn('[ProjectView] Migrated legacy data but failed to remove original file:', removeErr); }
        console.log('[ProjectView] Migrated legacy projects.json to Sterling/data/projectView/projects.json');
      } catch (migrationErr) {
        console.warn('[ProjectView] Failed to migrate legacy data:', migrationErr);
      }
    })();
  }
  return projectViewDataMigrationPromise;
}
async function loadGlobalProjectViewData(dataDir) {
  try {
    const file = await readFile(projectViewDataFile, 'utf-8');
    const parsed = JSON.parse(file);
    const { sanitized, removed } = sanitizeProjectViewEntries(parsed);
    if (removed > 0) {
      await mkdir(dataDir, { recursive: true });
      await writeFile(projectViewDataFile, JSON.stringify(sanitized, null, 2), 'utf-8');
    }
    return sanitized;
  } catch (err) {
    if (err?.code !== 'ENOENT') throw err;
  }
  try {
    const entries = await readdir(dataDir, { withFileTypes: true });
    const fallbackFiles = entries.filter(entry => entry.isFile() && entry.name.endsWith('.json') && !entry.name.endsWith('.queue.json') && entry.name !== path.basename(projectViewDataFile)).map(e=>e.name).sort();
    for (const name of fallbackFiles) {
      const fullPath = path.join(dataDir, name);
      try {
        const payload = await readFile(fullPath, 'utf-8');
        const parsed = JSON.parse(payload);
        const { sanitized, removed } = sanitizeProjectViewEntries(parsed);
        await mkdir(dataDir, { recursive: true });
        await writeFile(projectViewDataFile, JSON.stringify(sanitized, null, 2), 'utf-8');
        console.log(`[ProjectView] Seeded ${path.basename(projectViewDataFile)} from existing ${name}`);
        if (removed > 0) {
          console.warn(`[ProjectView] Removed ${removed} Sterling Git project(s) while seeding from ${name}.`);
        }
        return sanitized;
      } catch (fallbackErr) {
        console.warn(`[ProjectView] Unable to seed projects.json from ${name}:`, fallbackErr);
      }
    }
  } catch (dirErr) { if (dirErr?.code !== 'ENOENT') throw dirErr; }
  return null;
}
async function readProjectViewProjects(sessionId) {
  await migrateLegacyProjectViewDataIfNeeded();
  const dataDir = path.dirname(projectViewDataFile);
  if (sessionId && rdsStore.enabled) {
    const stored = await rdsStore.getProjectViewProjects(sessionId);
    if (stored) {
      const { sanitized, removed } = sanitizeProjectViewEntries(stored);
      if (removed > 0) {
        await rdsStore.setProjectViewProjects(sessionId, sanitized);
        console.log(`[ProjectView] Removed ${removed} Sterling Git project(s) from session database record.`);
      }
      return sanitized;
    }
  }
  if (sessionId) {
    const sessionFile = path.join(dataDir, `${sessionId}.json`);
    try {
      const file = await readFile(sessionFile, 'utf-8');
      const parsed = JSON.parse(file);
      const { sanitized, removed } = sanitizeProjectViewEntries(parsed);
      if (removed > 0) {
        await writeFile(sessionFile, JSON.stringify(sanitized, null, 2), 'utf-8');
        console.log(`[ProjectView] Removed ${removed} Sterling Git project(s) from session file ${path.basename(sessionFile)}.`);
      }
      return sanitized;
    } catch (err) {
      if (err?.code === 'ENOENT') {
        const fallback = await loadGlobalProjectViewData(dataDir);
        if (fallback) { await mkdir(dataDir, { recursive: true }); await writeFile(sessionFile, JSON.stringify(fallback, null, 2), 'utf-8'); return fallback; }
        return [];
      }
      throw err;
    }
  }
  const globalProjects = await loadGlobalProjectViewData(dataDir);
  return globalProjects ?? [];
}
async function writeProjectViewProjects(projects, sessionId) {
  await migrateLegacyProjectViewDataIfNeeded();
  const dataDir = path.dirname(projectViewDataFile);
  await mkdir(dataDir, { recursive: true });
  const payload = JSON.stringify(projects, null, 2);
  if (sessionId) {
    if (rdsStore.enabled) {
      await rdsStore.setProjectViewProjects(sessionId, projects);
      return;
    }
    const sessionFile = path.join(dataDir, `${sessionId}.json`);
    await writeFile(sessionFile, payload, 'utf-8');
  } else {
    await writeFile(projectViewDataFile, payload, 'utf-8');
  }
}
// Queue data storage for ProjectView
const projectViewQueueFile = path.join(__dirname, "../data/projectView/queue.json");

async function readProjectViewQueue(sessionId) {
  await migrateLegacyProjectViewDataIfNeeded();
  try {
    const dataDir = path.dirname(projectViewDataFile);
    if (sessionId) {
      const sessionFile = path.join(dataDir, `${sessionId}.queue.json`);
      try {
        const file = await readFile(sessionFile, 'utf-8');
        return JSON.parse(file);
      } catch (err) {
        if (err?.code === 'ENOENT') {
          try {
            const globalFile = await readFile(projectViewQueueFile, 'utf-8');
            const parsed = JSON.parse(globalFile);
            await mkdir(dataDir, { recursive: true });
            await writeFile(sessionFile, JSON.stringify(parsed, null, 2), 'utf-8');
            return parsed;
          } catch (globalErr) {
            if (globalErr?.code === 'ENOENT') {
              return [];
            }
            throw globalErr;
          }
        }
        throw err;
      }
    }

    try {
      const file = await readFile(projectViewQueueFile, 'utf-8');
      return JSON.parse(file);
    } catch (err) {
      if (err?.code === 'ENOENT') {
        return [];
      }
      throw err;
    }
  } catch (err) {
    throw err;
  }
}

async function writeProjectViewQueue(queue, sessionId) {
  await migrateLegacyProjectViewDataIfNeeded();
  const dataDir = path.dirname(projectViewDataFile);
  await mkdir(dataDir, { recursive: true });
  const payload = JSON.stringify(queue, null, 2);
  if (sessionId) {
    const sessionFile = path.join(dataDir, `${sessionId}.queue.json`);
    await writeFile(sessionFile, payload, 'utf-8');
  } else {
    await writeFile(projectViewQueueFile, payload, 'utf-8');
  }
}

projectViewRouter.get('/api/queue', async (req, res) => {
  const { sessionId } = ensureSessionIdCookie(req, res);
  try {
    const queue = await readProjectViewQueue(sessionId);
    res.json(queue);
  } catch (err) {
    console.error('[ProjectView] Failed to load queue:', err);
    res.status(500).json({ message: 'Unable to load queue.' });
  }
});

projectViewRouter.post('/api/queue', async (req, res) => {
  const { sessionId } = ensureSessionIdCookie(req, res);
  const task = req.body;
  if (!task || typeof task !== 'object' || !task.title) {
    return res.status(400).json({ message: 'Task must be an object with a title.' });
  }

  try {
    const queue = await readProjectViewQueue(sessionId);
    const newTask = {
      id: randomUUID(),
      title: String(task.title || '').trim(),
      description: String(task.description || '').trim(),
      createdAt: new Date().toISOString(),
    };
    queue.push(newTask);
    await writeProjectViewQueue(queue, sessionId);
    res.status(200).json({ message: 'Task enqueued.', task: newTask });
  } catch (err) {
    console.error('[ProjectView] Failed to save queue:', err);
    res.status(500).json({ message: 'Unable to save queue.' });
  }
});

projectViewRouter.post('/api/queue/send', async (req, res) => {
  const { sessionId } = ensureSessionIdCookie(req, res);
  const { taskId, projectId } = req.body || {};
  if (!taskId || !projectId) {
    return res.status(400).json({ message: 'taskId and projectId are required.' });
  }

  try {
    const queue = await readProjectViewQueue(sessionId);
    const idx = queue.findIndex((t) => t && t.id === taskId);
    if (idx === -1) return res.status(404).json({ message: 'Task not found in queue.' });
    const [task] = queue.splice(idx, 1);

    const projects = await readProjectViewProjects(sessionId);
    const project = Array.isArray(projects) ? projects.find((p) => p && p.id === projectId) : null;
    if (!project) return res.status(404).json({ message: 'Project not found.' });
    if (!Array.isArray(project.tasks)) project.tasks = [];
    project.tasks.push({ id: task.id, title: task.title, description: task.description || '', completed: false });

    await writeProjectViewProjects(projects, sessionId);
    await writeProjectViewQueue(queue, sessionId);

    res.status(200).json({ message: 'Task sent to project.' });
  } catch (err) {
    console.error('[ProjectView] Failed to send task:', err);
    res.status(500).json({ message: 'Unable to send task.' });
  }
});

projectViewRouter.get('/queue', (_req, res) => {
  res.sendFile(path.join(projectViewPublicDir, 'queue.html'));
});

projectViewRouter.use(express.static(projectViewPublicDir));

projectViewRouter.get("*", (_req, res) => {
  res.sendFile(path.join(projectViewPublicDir, "index.html"));
});

const projectViewEnabled = parseBooleanEnv(process.env.AURORA_PROJECTVIEW_ENABLED, true);
if (projectViewEnabled) {
  app.use("/ProjectView", projectViewRouter);
} else {
  console.debug("[Server Debug] ProjectView disabled by AURORA_PROJECTVIEW_ENABLED; /ProjectView routes not mounted.");
}
