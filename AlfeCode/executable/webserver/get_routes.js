const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const { formatTokenLimit } = require("./utils");

/**
 * setupGetRoutes attaches all GET (and some auxiliary) routes to the Express
 * application.  Everything the routes need is injected through the `deps`
 * object so the module has zero hidden dependencies.
 *
 * @param {object} deps – injected dependencies
 */
function setupGetRoutes(deps) {
    const {
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
        gitUpdatePull,
        convertGitUrlToHttps,
        analyzeProject,
        analyzeCodeFlow,
        AIModels,
        AIModelContextLimits,
        DEFAULT_AIMODEL,
        getDefaultCodexModel,
        getSessionCodexModel,
        resolveCodexModelForSession,
        DEFAULT_CODEX_MODEL,
        CODEX_MODEL_PATTERN,
        execSync,
        PROJECT_ROOT,
        spawn,
        buildSterlingCodexUrl,
        loadCodexRuns,
        upsertCodexRun,
        vmManager,
        ensureSessionDefaultRepo,
        buildSessionCookie,
        normalizeHostname,
        rdsStore,
    } = deps;

    const codexScriptPath = path.join(PROJECT_ROOT, "codex-tools", "run_codex.sh");
    const STERLING_STORAGE_PRIMARY = path.join(path.sep, "git", "sterling");
    const STERLING_STORAGE_FALLBACK = path.join(path.sep, "git", "stirling");
    const STERLING_STORAGE_CACHE_TTL_MS = 30 * 1000;
    let sterlingStorageSummaryCache = {
        summary: null,
        timestamp: 0,
    };
    const { version: sterlingVersion } = require(path.join(PROJECT_ROOT, "package.json"));
    const appVersionDisplay =
        typeof process.env.ALFE_APP_VERSION === "string" && process.env.ALFE_APP_VERSION.trim()
            ? process.env.ALFE_APP_VERSION.trim()
            : `beta-${sterlingVersion}`;
    const SHOW_MODEL_ONLY_COSTS = /^true$/i.test(process.env.MODEL_ONLY_SHOW_COSTS || "");
    const SHOW_COMMIT_LIST = !(String(process.env.SHOW_COMMIT_LIST || "").toLowerCase() in {"false":1, "0":1});
    const CODEX_RUNNER_PROJECT_DIR_MARKER = "::CODEX_RUNNER_PROJECT_DIR::";
    const defaultCodexProjectDir = "/git/sterlingcodex_testrepo";
    const NEW_SESSION_REPO_NAME = "Default";
    const DEFAULT_GIT_LOG_LIMIT = 20;
    const MAX_GIT_LOG_LIMIT = 200;
    const configIpWhitelist = new Set();
    const configIpWhitelistEnv = process.env.CONFIG_IP_WHITELIST || "";
    if (configIpWhitelistEnv) {
        configIpWhitelistEnv
            .split(",")
            .map((ip) => ip.trim())
            .filter(Boolean)
            .forEach((ip) => {
                configIpWhitelist.add(ip);
                configIpWhitelist.add(`::ffff:${ip}`);
            });
    }
    const FILE_TREE_EXCLUDES = new Set([
        ".git",
        "node_modules",
        ".next",
        "dist",
        "build",
        "tmp",
        "temp",
        "vendor",
        "__pycache__",
        ".cache",
        "venv",
        ".venv",
    ]);
    const MAX_FILE_TREE_DEPTH = 5;

    const getRequestIp = (req) => {
        const forwarded = req.headers["x-forwarded-for"];
        const forwardedIp = Array.isArray(forwarded) ? forwarded[0] : forwarded;
        const ip =
            (forwardedIp ? String(forwardedIp).split(",")[0].trim() : "") ||
            req.ip ||
            req.connection?.remoteAddress ||
            "";
        return ip.trim();
    };

    const isIpAllowed = (ip, whitelist) => {
        if (whitelist.size === 0) {
            return false;
        }
        if (!ip) {
            return false;
        }
        const normalized = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
        return whitelist.has(ip) || whitelist.has(normalized);
    };

    const normalizeProviderName = (value) => {
        const normalized = (value || "").toString().trim().toLowerCase();
        if (!normalized) {
            return "openrouter";
        }
        if (normalized === "openai") {
            return "openrouter";
        }
        return normalized;
    };
    const getSessionIdFromRequest = (req) => {
        const header = req.headers?.cookie || "";
        const cookies = {};
        header.split(";").forEach((cookie) => {
            const idx = cookie.indexOf("=");
            if (idx === -1) return;
            const name = cookie.slice(0, idx).trim();
            if (!name) return;
            cookies[name] = decodeURIComponent(cookie.slice(idx + 1).trim());
        });
        return cookies.sessionId || "";
    };
    const normalizeBaseUrl = (value) => {
        if (typeof value !== "string") {
            return "";
        }
        const trimmed = value.trim();
        if (!trimmed) {
            return "";
        }
        return trimmed.replace(/\/+$/, "");
    };
    const isLoggedOutPlan = (plan) => {
        if (!plan) {
            return false;
        }
        return plan.toString().trim().toLowerCase().replace(/[-\s]+/g, " ") === "logged out session";
    };
    const QWEN_CODEX_PATCH_MODELS = new Set([
        "openrouter/qwen/qwen3-coder",
        "qwen/qwen3-coder",
    ]);
    const SUPPORT_PLANS = new Set(["Lite", "Plus", "Pro"]);
    const MAX_FILE_TREE_ENTRIES = 400;
    const MAX_RUN_OUTPUT_LENGTH = 50000;
    const MAX_STATUS_HISTORY = 200;
    const gitPullUpdatingRegex = /^updating\s+[0-9a-f]+\.\.[0-9a-f]+/i;
    const gitPullRangeLineRegex = /^\s*[0-9a-f]{7,}\.\.[0-9a-f]{7,}\s+\S+\s+->\s+\S+/i;
    const gitPullBranchFetchRegex = /^\s*\*\s+branch\s+\S+\s+->\s+\S+/i;
    const gitDiffStatLineRegex = /\|\s+\d+\s+(?:[+\-]+|bin\s+\d+\s+->\s+\d+\s+bytes)$/i;
    const gitModeChangeRegex = /^\s*(?:create|delete)\s+mode\b/i;
    const gitRenameCopyRegex = /^\s*(?:rename|copy)\s+/i;
    const gitAlreadyUpToDateRegex = /^already up to date\.?$/i;

    app.get("/api/account", async (req, res) => {
        if (!rdsStore?.enabled) {
            return res.status(503).json({ error: "Account lookup is not configured on this server." });
        }
        res.set("Cache-Control", "no-store");
        const sessionId = typeof req.query?.sessionId === "string"
            ? req.query.sessionId.trim()
            : getSessionIdFromRequest(req);
        if (!sessionId) {
            return res.status(401).json({ error: "not logged in" });
        }
        const account = await rdsStore.getAccountBySession(sessionId);
        if (!account) {
            return res.json({
                success: false,
                sessionId,
                plan: "Logged-out Session",
                everSubscribed: false,
            });
        }
        return res.json({
            success: true,
            id: account.id,
            email: account.email,
            plan: account.plan,
            timezone: account.timezone,
            sessionId: account.session_id,
            totpEnabled: Boolean(account.totp_secret),
            everSubscribed: Boolean(account.ever_subscribed),
        });
    });
    app.get("/api/support", async (req, res) => {
        if (!rdsStore?.enabled) {
            return res.status(503).json({ error: "Support requests are not configured on this server." });
        }
        const sessionId = getSessionIdFromRequest(req);
        if (!sessionId) {
            return res.json({ requests: [] });
        }
        const account = await rdsStore.getAccountBySession(sessionId);
        const rawLimit = typeof req.query?.limit === "string" ? Number(req.query.limit) : undefined;
        const limit = Number.isFinite(rawLimit) ? rawLimit : 20;
        const requests = await rdsStore.listSupportRequests({
            sessionId,
            accountId: account?.id,
            limit,
        });
        return res.json({ requests });
    });
    const gitRemoteLineRegex = /^remote:\s/i;
    const gitFromRemoteRegex = /^from\s+\S+/i;
    const statusNoiseRegexes = [
        /^preparing agent run/i,
        /^running\.\.\./i,
        /^agent exited with code/i,
        /^agent succeeded\./i,
        /^git_fpush\.sh/i,
        /^git pull/i,
        /^git push/i,
        /^git status/i,
        /^connection (?:closed|interrupted)/i,
        /^run cancell?ed by user/i,
        /^unable to switch to /i,
        /^agent run aborted/i,
    ];
    const normalizeBooleanFlagValue = (value) => {
        if (typeof value !== "string") {
            return value;
        }
        const stripped = value.replace(/\s[#;].*$/, "").trim().toLowerCase();
        return stripped;
    };
    const parseBooleanFlag = (value) => {
        if (Array.isArray(value)) {
            return parseBooleanFlag(value[value.length - 1]);
        }

        if (typeof value === "boolean") {
            return value;
        }

        if (typeof value === "number") {
            return value === 1;
        }

        if (typeof value === "string") {
            const normalized = normalizeBooleanFlagValue(value);
            if (!normalized) {
                return false;
            }

            return ["1", "true", "yes", "y", "on"].includes(normalized);
        }

        return false;
    };
    const parseBooleanFlagWithDefault = (value, defaultValue) => {
        if (typeof value === "undefined") {
            return defaultValue;
        }
        return parseBooleanFlag(value);
    };
    const USER_PROMPT_VISIBLE_CODEX = parseBooleanFlag(process.env.USER_PROMPT_VISIBLE_CODEX);
    const shouldStripCodexUserPrompt = !USER_PROMPT_VISIBLE_CODEX;
    const CODEX_HIDDEN_PROMPT_LINES = [
        'Do not ask to commit changes, we run a script to automatically stage, commit, and push after you finish.',
        'Do not ask anything like "Do you want me to run `git commit` with a message?"',
        'Do not mention anything like "The file is staged."',
        'Python command is available via "python3" Python 3.11.2',
        'Whenever you need to modify source files, skip git apply and instead programmatically read the target file, replace the desired text (or insert the new snippet) using a Python script (e.g., Path.read_text()/write_text()), then stage the changes.',
        'When starting, please check AGENTS.md in repository root for further instructions.',
        'Unless otherwise specified, NOW MAKE CODE CHANGES FOR THE USERS SPECIFIED REQUEST BELOW:',
    ];

    const stripCodexUserPromptFromText = (text) => {
        if (!shouldStripCodexUserPrompt) {
            return text;
        }
        if (typeof text !== 'string' || !text) {
            return text;
        }
        const endsWithNewline = text.endsWith('\n');
        const lines = text.split(/\r?\n/);
        const filtered = lines.filter((line) => {
            if (!line) {
                return true;
            }
            return !CODEX_HIDDEN_PROMPT_LINES.some((phrase) => line.includes(phrase));
        });
        let joined = filtered.join('\n');
        if (endsWithNewline && joined) {
            joined += '\n';
        }
        return joined;
    };
    const requireSupportPlan = async (req, res) => {
        if (!rdsStore?.enabled) {
            res.status(503).send("Support requests are not configured on this server.");
            return null;
        }
        const sessionId = getSessionIdFromRequest(req);
        if (!sessionId) {
            res.status(403).send("Support is available to Lite, Plus, or Pro subscribers only.");
            return null;
        }
        const account = await rdsStore.getAccountBySession(sessionId);
        const isSupportEligible = account
            && (SUPPORT_PLANS.has(account.plan)
                || (account.plan === "Free" && Boolean(account.ever_subscribed)));
        if (!isSupportEligible) {
            res.status(403).send("Support is available to Lite, Plus, or Pro subscribers only.");
            return null;
        }
        return account;
    };

    const isGitPullDiffStatLine = (line) => gitDiffStatLineRegex.test(line || "");

    const isGitPullBlockLine = (line, trimmed, trimmedLower) => {
        if (!trimmed) {
            return true;
        }
        if (/^fast-forward\b/i.test(trimmed)) {
            return true;
        }
        if (gitModeChangeRegex.test(trimmed)) {
            return true;
        }
        if (gitRenameCopyRegex.test(trimmedLower)) {
            return true;
        }
        if (/^-+\s*removed\b/i.test(trimmedLower)) {
            return true;
        }
        if (/^\d+\s+files?\s+changed\b/i.test(trimmed)) {
            return true;
        }
        if (isGitPullDiffStatLine(line)) {
            return true;
        }
        return false;
    };

    const detectGitChangeIndicator = (text) => {
        if (!text || typeof text !== "string") {
            return false;
        }

        const fileChangeMatch = text.match(/(\d+)\s+files?\s+changed/i);
        if (fileChangeMatch) {
            const fileCount = parseInt(fileChangeMatch[1], 10);
            if (Number.isFinite(fileCount) && fileCount > 0) {
                return true;
            }
        }

        const insertionMatch = text.match(/(\d+)\s+insertions?/i);
        if (insertionMatch) {
            const insertionCount = parseInt(insertionMatch[1], 10);
            if (Number.isFinite(insertionCount) && insertionCount > 0) {
                return true;
            }
        }

        const deletionMatch = text.match(/(\d+)\s+deletions?/i);
        if (deletionMatch) {
            const deletionCount = parseInt(deletionMatch[1], 10);
            if (Number.isFinite(deletionCount) && deletionCount > 0) {
                return true;
            }
        }

        const indicators = [
            /create mode/i,
            /delete mode/i,
            /renamed?:/i,
            /modified:/i,
            /new file:/i,
            /changes to be committed/i,
        ];

        return indicators.some((pattern) => pattern.test(text));
    };

    const formatBytes = (bytes) => {
        if (typeof bytes !== "number" || Number.isNaN(bytes) || bytes < 0) {
            return "0 B";
        }
        if (bytes === 0) {
            return "0 B";
        }
        const units = ["B", "KB", "MB", "GB", "TB", "PB"];
        const exponent = Math.min(
            Math.floor(Math.log(bytes) / Math.log(1024)),
            units.length - 1,
        );
        const value = bytes / 1024 ** exponent;
        return `${value >= 100 ? value.toFixed(0) : value >= 10 ? value.toFixed(1) : value.toFixed(2)} ${units[exponent]}`;
    };

    const formatTimestamp = (date) => {
        if (!(date instanceof Date) || Number.isNaN(date.valueOf())) {
            return "Unknown";
        }
        return date.toISOString().replace("T", " ").replace(/Z$/, " UTC");
    };

    const resolveSnapshotParentPath = (repoPath) => {
        if (typeof repoPath !== "string" || !repoPath.trim()) {
            return "";
        }
        const trimmed = repoPath.trim();
        const suffixMatch = trimmed.match(/-\d{6,}$/);
        if (!suffixMatch) {
            return "";
        }
        const candidate = trimmed.slice(0, -suffixMatch[0].length);
        if (!candidate) {
            return "";
        }
        try {
            if (fs.existsSync(path.join(candidate, ".git"))) {
                return candidate;
            }
        } catch (_err) {
            return "";
        }
        return "";
    };

    const resolveSterlingStorageRoot = () => {
        const normaliseResult = (candidatePath, exists, usingFallback) => ({
            path: candidatePath,
            exists,
            usingFallback,
        });

        try {
            if (fs.existsSync(STERLING_STORAGE_PRIMARY)) {
                const stats = fs.statSync(STERLING_STORAGE_PRIMARY);
                if (stats.isDirectory()) {
                    return normaliseResult(STERLING_STORAGE_PRIMARY, true, false);
                }
            }
        } catch (err) {
            console.warn(
                "[WARN] Unable to inspect primary Sterling storage directory:",
                err && err.message ? err.message : err,
            );
        }

        try {
            if (fs.existsSync(STERLING_STORAGE_FALLBACK)) {
                const stats = fs.statSync(STERLING_STORAGE_FALLBACK);
                if (stats.isDirectory()) {
                    return normaliseResult(STERLING_STORAGE_FALLBACK, true, true);
                }
            }
        } catch (err) {
            console.warn(
                "[WARN] Unable to inspect fallback Sterling storage directory:",
                err && err.message ? err.message : err,
            );
        }

        return normaliseResult(STERLING_STORAGE_PRIMARY, false, false);
    };

    const calculateDirectorySize = (directoryPath) => {
        let total = 0;
        const stack = [directoryPath];

        while (stack.length > 0) {
            const currentPath = stack.pop();
            let entries;
            try {
                entries = fs.readdirSync(currentPath, { withFileTypes: true });
            } catch (err) {
                console.warn(
                    "[WARN] Unable to read directory while calculating size:",
                    currentPath,
                    err && err.message ? err.message : err,
                );
                continue;
            }

            for (const entry of entries) {
                if (!entry || typeof entry.name !== "string") {
                    continue;
                }

                const entryPath = path.join(currentPath, entry.name);
                let entryStats;
                try {
                    entryStats = fs.lstatSync(entryPath);
                } catch (err) {
                    console.warn(
                        "[WARN] Unable to stat entry while calculating directory size:",
                        entryPath,
                        err && err.message ? err.message : err,
                    );
                    continue;
                }

                if (entryStats.isSymbolicLink()) {
                    continue;
                }

                if (entryStats.isDirectory()) {
                    stack.push(entryPath);
                } else {
                    total += entryStats.size;
                }
            }
        }

        return total;
    };

    const createStorageSummaryClone = (data) => ({
        ...data,
        directories: Array.isArray(data.directories)
            ? data.directories.map((dir) => ({ ...dir }))
            : [],
    });

    const getCachedStorageSummary = () => {
        if (!sterlingStorageSummaryCache.summary) {
            return null;
        }
        const ageMs = Date.now() - sterlingStorageSummaryCache.timestamp;
        if (ageMs > STERLING_STORAGE_CACHE_TTL_MS) {
            return null;
        }
        return createStorageSummaryClone(sterlingStorageSummaryCache.summary);
    };

    const updateStorageSummaryCache = (summary) => {
        const cached = createStorageSummaryClone(summary);
        sterlingStorageSummaryCache = {
            summary: cached,
            timestamp: Date.now(),
        };
        return createStorageSummaryClone(cached);
    };

    const invalidateStorageSummaryCache = () => {
        sterlingStorageSummaryCache = {
            summary: null,
            timestamp: 0,
        };
    };

    const collectSterlingStorageSummary = () => {
        const cached = getCachedStorageSummary();
        if (cached) {
            return cached;
        }

        const rootInfo = resolveSterlingStorageRoot();
        const summary = {
            directories: [],
            totalSizeBytes: 0,
            rootExists: rootInfo.exists,
            rootPath: rootInfo.path,
            usingFallback: rootInfo.usingFallback,
            error: "",
        };

        if (!rootInfo.exists) {
            return updateStorageSummaryCache(summary);
        }

        let entries;
        try {
            entries = fs.readdirSync(rootInfo.path, { withFileTypes: true });
        } catch (err) {
            summary.error =
                err && err.message ? `Unable to read storage directory: ${err.message}` : "Unable to read storage directory.";
            summary.rootExists = false;
            return updateStorageSummaryCache(summary);
        }

        for (const entry of entries) {
            if (!entry || typeof entry.name !== "string") {
                continue;
            }
            if (entry.isSymbolicLink && entry.isSymbolicLink()) {
                continue;
            }
            const absolutePath = path.join(rootInfo.path, entry.name);
            let stats;
            try {
                stats = fs.statSync(absolutePath);
            } catch (err) {
                console.warn(
                    "[WARN] Unable to stat Sterling storage entry:",
                    absolutePath,
                    err && err.message ? err.message : err,
                );
                continue;
            }
            if (!stats.isDirectory()) {
                continue;
            }

            const sizeBytes = calculateDirectorySize(absolutePath);
            summary.totalSizeBytes += sizeBytes;

            const createdDate =
                stats.birthtime instanceof Date && !Number.isNaN(stats.birthtime.valueOf())
                    ? stats.birthtime
                    : stats.ctime instanceof Date && !Number.isNaN(stats.ctime.valueOf())
                        ? stats.ctime
                        : null;

            summary.directories.push({
                name: entry.name,
                sizeBytes,
                sizeHuman: formatBytes(sizeBytes),
                createdAtDisplay: createdDate ? formatTimestamp(createdDate) : "Unknown",
            });
        }

        summary.directories.sort((a, b) => b.sizeBytes - a.sizeBytes || a.name.localeCompare(b.name));

        return updateStorageSummaryCache(summary);
    };

    const buildStdoutOnlyText = (stdoutText, prompt) => {
        if (typeof stdoutText !== "string" || !stdoutText) {
            return "";
        }

        const sanitizedStdout = stdoutText.replace(/\r/g, "");
        const lines = sanitizedStdout.split("\n");
        const normalizedPrompt = typeof prompt === "string" ? prompt.replace(/\r/g, "") : "";
        const promptLines = normalizedPrompt ? normalizedPrompt.split("\n") : [];
        let promptMatchIndex = 0;
        let hasRenderedPrompt = promptLines.length === 0;
        let skippingGitPullStdoutBlock = false;
        const filteredLines = [];

        const shouldSkipPromptLine = (line) => {
            if (hasRenderedPrompt || promptLines.length === 0) {
                return false;
            }

            const expectedLine = promptLines[promptMatchIndex] || "";
            if (line === expectedLine) {
                promptMatchIndex += 1;
                if (promptMatchIndex >= promptLines.length) {
                    hasRenderedPrompt = true;
                    promptMatchIndex = 0;
                }
                return true;
            }

            if (promptMatchIndex > 0) {
                promptMatchIndex = 0;
                if (promptLines[0] && line === promptLines[0]) {
                    if (promptLines.length === 1) {
                        hasRenderedPrompt = true;
                        promptMatchIndex = 0;
                    } else {
                        promptMatchIndex = 1;
                    }
                    return true;
                }
            }

            return false;
        };

        for (let index = 0; index < lines.length; index += 1) {
            const line = lines[index];
            if (index === lines.length - 1 && line === "") {
                break;
            }

            if (shouldSkipPromptLine(line)) {
                continue;
            }

            const trimmed = line.trim();
            if (!trimmed) {
                filteredLines.push("");
                continue;
            }

            if (/^\[trace\]/i.test(trimmed)) {
                continue;
            }

            const trimmedLower = trimmed.toLowerCase();

            if (gitPullUpdatingRegex.test(trimmedLower)) {
                skippingGitPullStdoutBlock = true;
                continue;
            }

            if (skippingGitPullStdoutBlock) {
                if (isGitPullBlockLine(line, trimmed, trimmedLower)) {
                    continue;
                }
                skippingGitPullStdoutBlock = false;
            }

            if (
                gitAlreadyUpToDateRegex.test(trimmed)
                || gitRemoteLineRegex.test(trimmedLower)
                || gitFromRemoteRegex.test(trimmedLower)
                || gitPullRangeLineRegex.test(trimmed)
                || gitPullBranchFetchRegex.test(trimmedLower)
            ) {
                continue;
            }

            if (trimmedLower.includes("model_providers")) {
                continue;
            }

            if (/[├└]──/.test(line) || /^│/.test(trimmed)) {
                continue;
            }

            if (trimmed.endsWith("/") && index + 1 < lines.length) {
                const nextLine = lines[index + 1] || "";
                const nextTrimmed = nextLine.trim();
                if (/[├└]──/.test(nextLine) || /^│/.test(nextTrimmed)) {
                    continue;
                }
            }

            filteredLines.push(line);
        }

        let endIndex = filteredLines.length;
        while (endIndex > 0 && filteredLines[endIndex - 1] === "") {
            endIndex -= 1;
        }

        return filteredLines.slice(0, endIndex).join("\n");
    };

    const resolveGitBranchName = (directory) => {
        const targetDir = typeof directory === "string" ? directory.trim() : "";
        if (!targetDir) {
            return "";
        }

        let stats;
        try {
            stats = fs.statSync(targetDir);
        } catch (_err) {
            return "";
        }

        if (!stats.isDirectory()) {
            return "";
        }

        let branchName = "";
        try {
            branchName = execSync("git rev-parse --abbrev-ref HEAD", {
                cwd: targetDir,
                stdio: ["ignore", "pipe", "ignore"],
            })
                .toString()
                .trim();
        } catch (_err) {
            branchName = "";
        }

        if (!branchName) {
            return "";
        }

        if (branchName !== "HEAD") {
            return branchName;
        }

        try {
            const shortCommit = execSync("git rev-parse --short HEAD", {
                cwd: targetDir,
                stdio: ["ignore", "pipe", "ignore"],
            })
                .toString()
                .trim();
            if (shortCommit) {
                return `HEAD (${shortCommit})`;
            }
        } catch (_err) {
            // Ignore – fall through to the raw HEAD label.
        }

        return "HEAD";
    };

    const buildStatusOnlyText = (statusHistory, prompt) => {
        if (!Array.isArray(statusHistory) || statusHistory.length === 0) {
            return "";
        }

        const normalizedPrompt =
            typeof prompt === "string" ? prompt.replace(/\r/g, "").trim() : "";
        const statusLines = [];

        statusHistory.forEach((entry) => {
            if (typeof entry !== "string" || !entry) {
                return;
            }

            const sanitizedEntry = entry.replace(/\r/g, "");
            sanitizedEntry.split("\n").forEach((line) => {
                if (typeof line !== "string") {
                    return;
                }
                const trimmed = line.trim();
                if (!trimmed) {
                    if (statusLines.length > 0 && statusLines[statusLines.length - 1] !== "") {
                        statusLines.push("");
                    }
                    return;
                }
                if (normalizedPrompt && trimmed === normalizedPrompt) {
                    return;
                }
                if (statusNoiseRegexes.some((regex) => regex.test(trimmed))) {
                    return;
                }
                statusLines.push(line);
            });
        });

        while (statusLines.length > 0 && statusLines[statusLines.length - 1] === "") {
            statusLines.pop();
        }

        const combined = statusLines.join("\n");
        return combined.trim() ? combined : "";
    };

    const resolveStdoutOnlyTextForCommit = (record) => {
        if (!record || typeof record !== "object") {
            return "";
        }

        const combinedStdout = typeof record.stdout === "string" ? record.stdout : "";
        if (!combinedStdout) {
            return "";
        }

        const promptForFiltering = typeof record.effectivePrompt === "string" ? record.effectivePrompt : "";
        const filteredStdout = buildStdoutOnlyText(combinedStdout, promptForFiltering);
        if (filteredStdout.trim()) {
            return filteredStdout;
        }
        const fallbackFromStdout = combinedStdout.trimEnd();
        if (fallbackFromStdout) {
            return fallbackFromStdout;
        }

        const statusOnlyText = buildStatusOnlyText(record.statusHistory, promptForFiltering);
        if (statusOnlyText) {
            return statusOnlyText;
        }

        const finalMessage = typeof record.finalMessage === "string" ? record.finalMessage.trim() : "";
        return finalMessage;
    };

    const stripInitialHeaders = (text) => {
        if (typeof text !== "string" || !text) {
            return "";
        }

        const lines = text.split(/\r?\n/);
        let index = 0;

        while (index < lines.length && lines[index].trim() === "") {
            index += 1;
        }

        const firstContentIndex = index;
        let removedHeader = false;

        const headerMatchers = [
            /^#{1,6}\s+\S/, // Markdown heading
            /^\*\*[^*]+\*\*$/, // Bold line such as **Result**
            /^__[^_]+__$/, // Underlined header
            /^[^:]+:\s*$/, // Title followed by a colon
        ];

        while (index < lines.length) {
            const trimmed = lines[index].trim();

            if (trimmed === "") {
                index += 1;
                continue;
            }

            const isHeader = headerMatchers.some((regex) => regex.test(trimmed));

            if (!isHeader) {
                break;
            }

            removedHeader = true;
            index += 1;

            while (index < lines.length && lines[index].trim() === "") {
                index += 1;
            }
        }

        if (!removedHeader) {
            index = firstContentIndex;
        }

        return lines.slice(index).join("\n");
    };

    const extractQwenCliResultFromStreamJson = (text) => {
        if (typeof text !== "string" || !text) {
            return "";
        }

        const lines = text.replace(/\r/g, "").split("\n");
        let resolvedResult = "";

        for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line || line.charAt(0) !== "{" || !line.includes('"type"')) {
                continue;
            }

            let parsed;
            try {
                parsed = JSON.parse(line);
            } catch {
                continue;
            }

            if (parsed?.type !== "result") {
                continue;
            }

            if (typeof parsed.result === "string") {
                const cleanedResult = parsed.result.replace(/\r/g, "").trim();
                if (cleanedResult) {
                    resolvedResult = cleanedResult;
                }
            }
        }

        return resolvedResult;
    };

    const resolveQwenCliFinalOutput = (record) => {
        if (!record || typeof record !== "object") {
            return "";
        }

        if (record.qwenCli !== true) {
            return "";
        }

        const stdoutText = typeof record.stdout === "string" ? record.stdout : "";
        const stderrText = typeof record.stderr === "string" ? record.stderr : "";
        if (!stdoutText && !stderrText) {
            return "";
        }

        const combinedText = stdoutText && stderrText
            ? `${stdoutText}${stdoutText.endsWith("\n") ? "" : "\n"}${stderrText}`
            : (stdoutText || stderrText);

        const resultFromStreamJson = extractQwenCliResultFromStreamJson(combinedText);
        if (resultFromStreamJson) {
            return resultFromStreamJson;
        }

        return combinedText;
    };

    const resolveFinalOutputTextForCommit = async (record) => {
        if (!record || typeof record !== "object") {
            return "";
        }

        const stderrText = typeof record.stderr === "string" ? record.stderr : "";
        const stdoutText = typeof record.stdout === "string" ? record.stdout : "";
        const finalOutputField = typeof record.finalOutput === "string" ? record.finalOutput : "";

        const extractFromText = (text) => {
            if (typeof text !== "string" || !text) {
                return null;
            }

            const sanitized = text.replace(/\r/g, "");
            const sentinelRegex = /(^|\n)codex(\n|$)/g;
            let match;
            let lastMatch = null;

            while ((match = sentinelRegex.exec(sanitized)) !== null) {
                lastMatch = match;
            }

            if (!lastMatch) {
                return null;
            }

            const sentinelStart = lastMatch.index + (lastMatch[1] ? lastMatch[1].length : 0);
            const sentinelEnd = sentinelStart + "codex".length;
            let commitStart = sentinelEnd;

            if (sanitized.charAt(commitStart) === "\n") {
                commitStart += 1;
            }

            const finalOutputRaw = sanitized.slice(commitStart).replace(/^\n+/, "");
            const normalisedFinalOutput = finalOutputRaw.trimEnd();
            const cleanedFinalOutput = stripInitialHeaders(normalisedFinalOutput);
            return cleanedFinalOutput;
        };

        // Prefer the stored finalOutput field (which should contain just the final output tab content),
        // then fall back to extracting from stderr/stdout for legacy compatibility.
        let cleanedFinalOutput = "";
        if (finalOutputField) {
            const candidate = finalOutputField.replace(/\r/g, "").trim();
            cleanedFinalOutput = candidate ? stripInitialHeaders(candidate) : "";
        }
        if (!cleanedFinalOutput) {
            cleanedFinalOutput = extractFromText(stderrText);
        }
        if (!cleanedFinalOutput) {
            cleanedFinalOutput = extractFromText(stdoutText);
        }

        if (!cleanedFinalOutput) {
            return "";
        }

        // If OpenRouter is configured, call its chat completions endpoint to
        // generate a verbose commit summary from the cleaned final output.
        const openrouterKey = process.env.OPENROUTER_API_KEY || "";
        const openrouterModel = (process.env.OPENROUTER_MODEL || "openai/gpt-oss-20b").toString();
        if (!openrouterKey) {
            return cleanedFinalOutput;
        }

        try {
            const prompt = `Generate a verbose commit summary for this coding AI agent run.

Full Output:

${cleanedFinalOutput}`;
            const payload = {
                model: openrouterModel,
                messages: [
                    { role: "system", content: "You are a helpful assistant that writes comprehensive commit summaries. Do not use any Markdown headers." },
                    { role: "user", content: prompt },
                ],
                temperature: 0.2,
                max_tokens: 800,
            };

            const resp = await ensureFetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${openrouterKey}`,
                },
                body: JSON.stringify(payload),
            });

            if (!resp.ok) {
                console.error(`[WARN] OpenRouter API returned ${resp.status}`);
                return cleanedFinalOutput;
            }

            const result = await resp.json().catch(() => null);
            const content =
                result && result.choices && Array.isArray(result.choices) && result.choices[0] && result.choices[0].message
                    ? result.choices[0].message.content
                    : null;
            if (typeof content === "string" && content.trim()) {
                return content.trim();
            }
            return cleanedFinalOutput;
        } catch (err) {
            console.error("[WARN] Failed to call OpenRouter for final output generation:", err?.message || err);
            return cleanedFinalOutput;
        }
    };
    const shouldApplyCodexPatch = (model) => {
        const normalized = typeof model === "string" ? model.trim().toLowerCase() : "";
        return QWEN_CODEX_PATCH_MODELS.has(normalized);
    };

    const isIgnorablePatchTail = (tail) => {
        if (!tail || !tail.trim()) {
            return true;
        }
        const stripped = tail
            .replace(/<\/?tool_call[^>]*>/gi, "")
            .replace(/<\/?function[^>]*>/gi, "")
            .replace(/<\/?parameter[^>]*>/gi, "")
            .replace(/<\/?arguments[^>]*>/gi, "")
            .replace(/<\/?result[^>]*>/gi, "")
            .replace(/<\/?tool[^>]*>/gi, "")
            .replace(/[\s\[\]",:]+/g, "");
        return stripped.length === 0;
    };

    const extractApplyPatchBlock = (text) => {
        if (typeof text !== "string" || !text.trim()) {
            return "";
        }
        const patchRegex = /\*\*\* Begin Patch[\s\S]*?\*\*\* End Patch/gi;
        let match;
        let lastMatch = null;
        while ((match = patchRegex.exec(text)) !== null) {
            lastMatch = match;
        }
        if (!lastMatch) {
            return "";
        }
        const tail = text.slice(lastMatch.index + lastMatch[0].length);
        if (!isIgnorablePatchTail(tail)) {
            return "";
        }
        return `${lastMatch[0].trimEnd()}\n`;
    };

    const commandExists = (command) => {
        try {
            execSync(`command -v ${command}`, { stdio: "ignore" });
            return true;
        } catch (err) {
            return false;
        }
    };

    const buildGitApplyDiff = (patchText) => {
        const lines = patchText.replace(/\r\n/g, "\n").split("\n");
        const diffs = [];
        const deletions = [];
        const moves = [];
        let i = 0;
        if (lines[i]?.trim() === "*** Begin Patch") {
            i += 1;
        }
        while (i < lines.length) {
            const line = lines[i];
            if (!line) {
                i += 1;
                continue;
            }
            if (line.startsWith("*** End Patch")) {
                break;
            }
            if (line.startsWith("*** Add File: ")) {
                const filePath = line.replace("*** Add File: ", "").trim();
                const contentLines = [];
                i += 1;
                while (i < lines.length && !lines[i].startsWith("*** ")) {
                    const contentLine = lines[i];
                    if (contentLine.startsWith("+")) {
                        contentLines.push(contentLine.slice(1));
                    } else {
                        contentLines.push(contentLine);
                    }
                    i += 1;
                }
                const header = [
                    `diff --git a/${filePath} b/${filePath}`,
                    "new file mode 100644",
                    "--- /dev/null",
                    `+++ b/${filePath}`,
                    `@@ -0,0 +1,${contentLines.length} @@`,
                ];
                diffs.push([...header, ...contentLines.map((value) => `+${value}`)].join("\n"));
                continue;
            }
            if (line.startsWith("*** Delete File: ")) {
                const filePath = line.replace("*** Delete File: ", "").trim();
                deletions.push(filePath);
                i += 1;
                continue;
            }
            if (line.startsWith("*** Update File: ")) {
                const filePath = line.replace("*** Update File: ", "").trim();
                let moveTo = null;
                i += 1;
                if (lines[i]?.startsWith("*** Move to: ")) {
                    moveTo = lines[i].replace("*** Move to: ", "").trim();
                    i += 1;
                }
                const hunkLines = [];
                while (i < lines.length && !lines[i].startsWith("*** ")) {
                    const hunkLine = lines[i];
                    if (hunkLine === "*** End of File") {
                        i += 1;
                        continue;
                    }
                    hunkLines.push(hunkLine);
                    i += 1;
                }
                const header = [
                    `diff --git a/${filePath} b/${filePath}`,
                    `--- a/${filePath}`,
                    `+++ b/${filePath}`,
                ];
                diffs.push([...header, ...hunkLines].join("\n"));
                if (moveTo) {
                    moves.push({ from: filePath, to: moveTo });
                }
                continue;
            }
            i += 1;
        }
        return {
            diffText: diffs.length ? `${diffs.join("\n")}\n` : "",
            deletions,
            moves,
        };
    };

    const applyPatchWithGit = (patchText, projectDir) => {
        const { diffText, deletions, moves } = buildGitApplyDiff(patchText);
        if (diffText) {
            execSync("git apply --whitespace=nowarn --unsafe-paths -", {
                cwd: projectDir,
                input: diffText,
                stdio: ["pipe", "pipe", "pipe"],
            });
        }
        deletions.forEach((filePath) => {
            const absolutePath = path.join(projectDir, filePath);
            if (fs.existsSync(absolutePath)) {
                fs.rmSync(absolutePath);
            }
        });
        moves.forEach(({ from, to }) => {
            const fromPath = path.join(projectDir, from);
            const toPath = path.join(projectDir, to);
            if (fs.existsSync(fromPath)) {
                fs.renameSync(fromPath, toPath);
            }
        });
    };

    const applyPatchFromCodexOutput = (record, projectDir, emit) => {
        if (!shouldApplyCodexPatch(record?.model)) {
            return { attempted: false, applied: false, patchText: "" };
        }
        const stdoutText = typeof record?.stdout === "string" ? record.stdout : "";
        const stderrText = typeof record?.stderr === "string" ? record.stderr : "";
        const patchText = extractApplyPatchBlock(stdoutText) || extractApplyPatchBlock(stderrText);
        if (!patchText) {
            return { attempted: true, applied: false, patchText: "" };
        }
        if (emit) {
            emit({ event: "status", data: "Applying patch from Agent output..." });
        }
        try {
            if (commandExists("apply_patch")) {
                execSync("apply_patch", {
                    cwd: projectDir,
                    input: patchText,
                    stdio: ["pipe", "pipe", "pipe"],
                });
            } else {
                applyPatchWithGit(patchText, projectDir);
            }
            if (emit) {
                emit({ event: "status", data: "Patch applied successfully." });
            }
            return { attempted: true, applied: true, patchText };
        } catch (err) {
            const stderr = err?.stderr ? err.stderr.toString() : "";
            const stdout = err?.stdout ? err.stdout.toString() : "";
            const details = [stderr.trim(), stdout.trim()].filter(Boolean).join("\n");
            const message = details
                ? `Failed to apply patch from Agent output: ${details}`
                : `Failed to apply patch from Agent output: ${err?.message || err}`;
            if (emit) {
                emit({ event: "stream-error", data: message });
            }
            return { attempted: true, applied: false, patchText, error: message };
        }
    };
    const openRouterTransactionsPath = path.join(
        PROJECT_ROOT,
        "data",
        "openrouter_transactions.json",
    );
    const openRouterTimestampFormatter = new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });

    const appendTextWithLimit = (record, key, addition, limit) => {
        if (!record) {
            return { truncated: false };
        }
        if (addition === undefined || addition === null) {
            return { truncated: false };
        }
        const text = addition.toString();
        if (!text) {
            return { truncated: false };
        }
        const current = typeof record[key] === "string" ? record[key] : "";
        if (!limit || limit <= 0) {
            record[key] = current + text;
            return { truncated: false };
        }
        if (current.length >= limit) {
            record[key] = current;
            return { truncated: true };
        }
        const available = limit - current.length;
        if (text.length <= available) {
            record[key] = current + text;
            return { truncated: false };
        }
        record[key] = current + text.slice(0, available);
        return { truncated: true };
    };

    const pushHistoryEntry = (record, key, value, limit) => {
        if (!record) {
            return;
        }
        if (value === undefined || value === null) {
            return;
        }
        const entry = value.toString();
        if (!entry) {
            return;
        }
        const target = Array.isArray(record[key]) ? record[key] : [];
        target.push(entry);
        if (limit && limit > 0 && target.length > limit) {
            target.splice(0, target.length - limit);
        }
        record[key] = target;
    };

    const resolveSessionId = (req) =>
        (req && req.sessionId)
            || (req && req.query && req.query.sessionId)
            || "";

    const normaliseProjectDir = (value) => {
        if (typeof value !== "string") {
            return "";
        }
        const firstLine = value.split(/\r?\n/, 1)[0];
        const withoutMarkdownStatus = firstLine.replace(/\s+\*\*.*$/, "");
        return withoutMarkdownStatus.replace(/\\+/g, "/").trim();
    };

    const collectProjectDirComparisons = (value) => {
        const variants = new Set();
        const lowerVariants = new Set();

        const pushVariant = (candidate) => {
            if (typeof candidate !== "string") {
                return;
            }
            const trimmed = candidate.trim();
            if (!trimmed) {
                return;
            }
            variants.add(trimmed);
            lowerVariants.add(trimmed.toLowerCase());
        };

        pushVariant(value);

        const normalised = normaliseProjectDir(value);
        pushVariant(normalised);

        if (normalised) {
            const forwardSlashes = normalised.replace(/\\+/g, "/");
            pushVariant(forwardSlashes);
            pushVariant(forwardSlashes.replace(/\/+$/, ""));
        }

        const baseForResolve = normalised || (typeof value === "string" ? value.trim() : "");
        if (baseForResolve) {
            try {
                const resolved = path.resolve(baseForResolve);
                pushVariant(resolved);
                const resolvedForward = resolved.replace(/\\+/g, "/");
                pushVariant(resolvedForward);
                pushVariant(resolvedForward.replace(/\/+$/, ""));
            } catch (_err) {
                // Ignore resolution failures; path may be invalid on this host.
            }
        }

        return { variants, lowerVariants };
    };

    const ensureFetch = async (...args) => {
        if (typeof fetch !== "function") {
            throw new Error(
                "Global fetch API is not available in this Node.js runtime.",
            );
        }
        return fetch(...args);
    };

    const getNestedValue = (obj, path) => {
        if (!obj || typeof obj !== "object") {
            return undefined;
        }
        if (typeof path === "function") {
            try {
                return path(obj);
            } catch (_err) {
                return undefined;
            }
        }
        const segments = path.split(".");
        let current = obj;
        for (const segment of segments) {
            if (current == null) {
                return undefined;
            }
            current = current[segment];
        }
        return current;
    };

    const parseNumeric = (value) => {
        if (typeof value === "string") {
            const cleaned = value.replace(/[^0-9+\-Ee.]/g, "");
            if (cleaned.length > 0) {
                const parsed = Number(cleaned);
                if (Number.isFinite(parsed)) {
                    return parsed;
                }
            }
        }
        const direct = Number(value);
        return Number.isFinite(direct) ? direct : null;
    };

    const pickFirstNumber = (source, paths) => {
        for (const path of paths) {
            const candidate = getNestedValue(source, path);
            if (candidate === undefined || candidate === null) {
                continue;
            }
            const parsed = parseNumeric(candidate);
            if (parsed !== null) {
                return parsed;
            }
        }
        return 0;
    };

    const pickFirstString = (source, paths) => {
        for (const path of paths) {
            const candidate = getNestedValue(source, path);
            if (typeof candidate === "string") {
                const trimmed = candidate.trim();
                if (trimmed.length > 0) {
                    return trimmed;
                }
            }
        }
        return "";
    };

    const resolveTimestamp = (source) => {
        const isoTimestamp = pickFirstString(source, [
            "isoTimestamp",
            "timestamp",
            "created_at",
            "createdAt",
            "finished_at",
            "finishedAt",
            "time",
            "metadata.timestamp",
        ]) || null;

        if (!isoTimestamp) {
            return { isoTimestamp: null, timestampMs: null };
        }

        const parsedTime = Date.parse(isoTimestamp);
        const timestampMs = Number.isNaN(parsedTime) ? null : parsedTime;
        return { isoTimestamp, timestampMs };
    };

    const buildDisplayTimestamp = (timestampMs, fallback) => {
        if (typeof fallback === "string" && fallback.trim().length > 0) {
            return fallback.trim();
        }
        if (timestampMs === null) {
            return "—";
        }
        return openRouterTimestampFormatter.format(new Date(timestampMs));
    };

    const normaliseStoredOpenRouterEntry = (entry) => {
        const { isoTimestamp, timestampMs } = resolveTimestamp(entry);
        const promptTokens = Number(entry.promptTokens) || 0;
        const completionTokens = Number(entry.completionTokens) || 0;
        const reasoningTokens = Number(entry.reasoningTokens) || 0;
        const costUsd = Number(
            entry.costUsd !== undefined ? entry.costUsd : entry.cost,
        ) || 0;
        const speedTps = Number(
            entry.speedTps !== undefined ? entry.speedTps : entry.speed,
        ) || 0;

        const displayTimestamp = buildDisplayTimestamp(
            timestampMs,
            entry.displayTimestamp,
        );

        return {
            timestampMs,
            provider: entry.provider || "—",
            model: entry.model || "—",
            app: entry.app || "",
            promptTokens,
            completionTokens,
            reasoningTokens,
            totalTokens: promptTokens + completionTokens + reasoningTokens,
            costUsd,
            speedTps,
            finishReason: entry.finishReason || entry.finish || "—",
            displayTimestamp,
            isoTimestamp,
        };
    };

    const normaliseApiOpenRouterEntry = (entry) => {
        if (!entry || typeof entry !== "object") {
            return null;
        }

        let isoTimestamp = null;
        let timestampMs = null;

        if (typeof entry.date === "string" && entry.date.trim().length > 0) {
            const isoFromDate = `${entry.date.trim()}T00:00:00Z`;
            const parsedDate = Date.parse(isoFromDate);
            if (!Number.isNaN(parsedDate)) {
                isoTimestamp = isoFromDate;
                timestampMs = parsedDate;
            }
        }

        if (isoTimestamp === null || timestampMs === null) {
            const resolved = resolveTimestamp(entry);
            isoTimestamp = resolved.isoTimestamp;
            timestampMs = resolved.timestampMs;
        }
        const promptTokens = pickFirstNumber(entry, [
            "promptTokens",
            "prompt_tokens",
            "tokens.prompt",
            "tokens_prompt",
            "tokens.input",
            "usage.prompt_tokens",
            "usage.input_tokens",
            "usage.tokens.prompt",
        ]);
        const completionTokens = pickFirstNumber(entry, [
            "completionTokens",
            "completion_tokens",
            "tokens.completion",
            "tokens_completion",
            "tokens.output",
            "usage.completion_tokens",
            "usage.output_tokens",
            "usage.tokens.completion",
        ]);
        const reasoningTokens = pickFirstNumber(entry, [
            "reasoning_tokens",
            "reasoningTokens",
            "tokens.reasoning",
            "tokens_reasoning",
            "usage.reasoning_tokens",
            "usage.tokens.reasoning",
        ]);

        let costUsd = parseNumeric(entry.usage);
        if (costUsd === null) {
            costUsd = pickFirstNumber(entry, [
            "costUsd",
            "cost_usd",
            "costUSD",
            "cost",
            "cost.amount",
            "cost.total",
            "pricing.usd",
            "pricing.total",
            "pricing.total_usd",
            "pricing.usage",
            "usage.cost",
            "usage.cost_usd",
        ]);
        }
        const speedTps = pickFirstNumber(entry, [
            "speedTps",
            "speed_tps",
            "speed",
            "tokensPerSecond",
            "tokens_per_second",
            "metrics.speed",
            "metrics.tokens_per_second",
        ]);

        const provider = pickFirstString(entry, [
            () => (typeof entry.provider_name === "string" ? entry.provider_name.trim() : ""),
            "provider",
            "route.provider",
            "metadata.provider",
        ]) || "—";
        const model = pickFirstString(entry, [
            "model",
            "route.model",
            "metadata.model",
            "target",
        ]) || "—";
        const app = pickFirstString(entry, [
            "app",
            "appUrl",
            "metadata.app",
            "metadata.app_url",
            "metadata.appUrl",
            "metadata.url",
        ]);
        const finishReason =
            pickFirstString(entry, [
                "finishReason",
                "finish_reason",
                "finish",
            "usage.finish_reason",
            "response.finish_reason",
        ]) || "—";

        const displayTimestamp = typeof entry.date === "string" && entry.date.trim().length > 0
            ? entry.date.trim()
            : buildDisplayTimestamp(timestampMs, entry.displayTimestamp);

        return {
            timestampMs,
            record: {
                provider,
                model,
                app,
                promptTokens,
                completionTokens,
                reasoningTokens,
                totalTokens: promptTokens + completionTokens + reasoningTokens,
                costUsd,
                speedTps,
                finishReason,
                timestamp: isoTimestamp,
                displayTimestamp,
            },
        };
    };

    const extractTransactionsFromPayload = (payload) => {
        if (Array.isArray(payload?.data)) {
            return payload.data;
        }
        if (Array.isArray(payload?.transactions)) {
            return payload.transactions;
        }
        if (Array.isArray(payload)) {
            return payload;
        }
        return null;
    };

    function loadOpenRouterTransactions() {
        try {
            if (!fs.existsSync(openRouterTransactionsPath)) {
                return [];
            }

            const raw = fs.readFileSync(openRouterTransactionsPath, "utf-8");
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) {
                console.warn(
                    "[WARN] OpenRouter transactions file did not contain an array. Returning empty list.",
                );
                return [];
            }

            const normalised = parsed
                .map((entry) => normaliseStoredOpenRouterEntry(entry))
                .sort((a, b) => {
                    if (a.timestampMs !== null && b.timestampMs !== null) {
                        return b.timestampMs - a.timestampMs;
                    }
                    if (a.timestampMs !== null) return -1;
                    if (b.timestampMs !== null) return 1;
                    return 0;
                })
                .map((entry) => {
                    const { timestampMs, ...rest } = entry;
                    return rest;
                });

            return normalised;
        } catch (err) {
            console.error("[ERROR] Failed to load OpenRouter transactions:", err);
            return [];
        }
    }

    function saveOpenRouterTransactions(entries) {
        try {
            const directory = path.dirname(openRouterTransactionsPath);
            if (!fs.existsSync(directory)) {
                fs.mkdirSync(directory, { recursive: true });
            }

            const serialised = JSON.stringify(entries, null, 2);
            fs.writeFileSync(openRouterTransactionsPath, `${serialised}\n`, "utf-8");
            return true;
        } catch (err) {
            console.error("[ERROR] Failed to save OpenRouter transactions:", err);
            return false;
        }
    }

    const modelOnlyConfigPath = path.join(PROJECT_ROOT, "data", "config", "model_only_models.json");
    const modelOnlyConfigFallbackPath = path.resolve(
        __dirname,
        "..",
        "..",
        "data",
        "config",
        "model_only_models.json",
    );

    const getModelId = (model) => {
        if (!model) return "";
        if (typeof model === "string") return model.trim();
        if (typeof model === "object" && typeof model.id === "string") return model.id.trim();
        return "";
    };

    const normaliseModelEntry = (model, contextLimitMap = {}) => {
        if (!model) return null;
        if (typeof model === "string") {
            const trimmed = model.trim();
            if (!trimmed) return null;
            const limit = contextLimitMap[trimmed];
            return {
                id: trimmed,
                name: trimmed,
                max_tokens: Number.isFinite(limit) ? limit : null,
                contextLimitLabel: formatTokenLimit(limit),
            };
        }
        if (typeof model !== "object") return null;
        const id = getModelId(model);
        if (!id) return null;
        const maxTokens = Number.isFinite(model.max_tokens)
            ? model.max_tokens
            : Number.isFinite(model.context_length)
                ? model.context_length
                : Number.isFinite(model.max_context_length)
                    ? model.max_context_length
                    : Number.isFinite(model.max_request_tokens)
                        ? model.max_request_tokens
                        : Number.isFinite(contextLimitMap[id])
                            ? contextLimitMap[id]
                            : null;
        return {
            ...model,
            id,
            name: typeof model.name === "string" && model.name.trim().length ? model.name.trim() : id,
            max_tokens: Number.isFinite(maxTokens) ? maxTokens : null,
            contextLimitLabel: formatTokenLimit(maxTokens),
        };
    };

    const normaliseModelList = (models = [], contextLimitMap = {}) => {
        if (!Array.isArray(models)) return [];
        return models
            .map((model) => normaliseModelEntry(model, contextLimitMap))
            .filter(Boolean);
    };

    function normaliseModelOnlyEntry(entry, modelLookup = {}) {
        if (!entry) return null;
        if (typeof entry === "string") {
            const trimmed = entry.trim();
            if (!trimmed) return null;
            return { id: trimmed, label: trimmed };
        }
        if (typeof entry !== "object") return null;
        const coerceNumber = (value) => {
            if (Number.isFinite(value)) {
                return value;
            }
            if (typeof value === "string") {
                const trimmed = value.trim();
                if (!trimmed) return null;
                const parsed = Number(trimmed);
                return Number.isFinite(parsed) ? parsed : null;
            }
            return null;
        };
        const id = typeof entry.id === "string"
            ? entry.id.trim()
            : typeof entry.model === "string"
                ? entry.model.trim()
                : "";
        if (!id) return null;
        const label = typeof entry.label === "string" && entry.label.trim().length > 0
            ? entry.label.trim()
            : id;
        const created = typeof entry.created === "string" ? entry.created : null;
        const contextTokens = Number.isFinite(entry.contextTokens) ? entry.contextTokens : null;
        const fallbackModel = modelLookup[id];
        const resolvedMaxTokens = Number.isFinite(entry.max_tokens)
            ? entry.max_tokens
            : Number.isFinite(contextTokens)
                ? contextTokens
                : Number.isFinite(fallbackModel?.max_tokens)
                    ? fallbackModel.max_tokens
                    : null;
        const disabled = Boolean(entry.disabled);
        const qwenCli = Boolean(entry.qwen_cli);
        const qwenCliModel = typeof entry.qwen_cli_model === "string" ? entry.qwen_cli_model.trim() : "";
        const listOrder = coerceNumber(entry.list_order);
        const engineOptions = Array.isArray(entry.engine_options)
            ? entry.engine_options
                .map((option) => (typeof option === "string" ? option.trim() : ""))
                .filter(Boolean)
            : null;
        const plusModel = Boolean(entry.plus_model);
        const usage = typeof entry.usage === "string" ? entry.usage.trim().toLowerCase() : "";
        const pricing = entry.pricing && typeof entry.pricing === "object"
            ? {
                inputPerMTokens: coerceNumber(entry.pricing.inputPerMTokens),
                outputPerMTokens: coerceNumber(entry.pricing.outputPerMTokens),
            }
            : null;
        return {
            id,
            label,
            created,
            contextTokens,
            max_tokens: Number.isFinite(resolvedMaxTokens) ? resolvedMaxTokens : null,
            contextLimitLabel: formatTokenLimit(resolvedMaxTokens),
            disabled,
            qwen_cli: qwenCli,
            qwen_cli_model: qwenCliModel || null,
            engine_options: engineOptions,
            list_order: Number.isFinite(listOrder) ? listOrder : null,
            plus_model: plusModel,
            usage,
            pricing,
        };
    }

    function loadModelOnlyModels({ includePlus = true } = {}) {
        try {
            const resolvedPath = fs.existsSync(modelOnlyConfigPath)
                ? modelOnlyConfigPath
                : modelOnlyConfigFallbackPath;
            if (!fs.existsSync(resolvedPath)) {
                return [];
            }
            const raw = fs.readFileSync(resolvedPath, "utf-8");
            const parsed = JSON.parse(raw);
            const models = Array.isArray(parsed)
                ? parsed
                : Array.isArray(parsed?.models)
                    ? parsed.models
                    : parsed?.models && typeof parsed.models === "object"
                        ? Object.values(parsed.models)
                        : parsed && typeof parsed === "object"
                            ? Object.values(parsed)
                            : [];
            const openRouterModels = normaliseModelList(AIModels?.openrouter || [], AIModelContextLimits?.openrouter || {});
            const modelLookup = openRouterModels.reduce((acc, model) => {
                acc[model.id] = model;
                return acc;
            }, {});
            const normalised = models
                .map((model) => normaliseModelOnlyEntry(model, modelLookup))
                .filter(Boolean);
            const visibleModels = includePlus
                ? normalised
                : normalised.filter((model) => !model.plus_model);
            return visibleModels
                .map((model, index) => ({ model, index }))
                .sort((a, b) => {
                    const aOrder = Number.isFinite(a.model.list_order) ? a.model.list_order : null;
                    const bOrder = Number.isFinite(b.model.list_order) ? b.model.list_order : null;
                    if (aOrder !== null && bOrder !== null) {
                        if (aOrder !== bOrder) return aOrder - bOrder;
                        return a.index - b.index;
                    }
                    if (aOrder !== null) return -1;
                    if (bOrder !== null) return 1;
                    return a.index - b.index;
                })
                .map(({ model }) => model);
        } catch (err) {
            console.error("[ERROR] Failed to load model-only config:", err);
            return [];
        }
    }

    const loadModelOnlyConfigRaw = () => {
        const resolvedPath = fs.existsSync(modelOnlyConfigPath)
            ? modelOnlyConfigPath
            : modelOnlyConfigFallbackPath;
        if (!fs.existsSync(resolvedPath)) {
            return { error: "Model-only config file not found." };
        }
        try {
            const raw = fs.readFileSync(resolvedPath, "utf-8");
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                return { parsed, models: parsed, path: resolvedPath, rootArray: true };
            }
            if (Array.isArray(parsed?.models)) {
                return { parsed, models: parsed.models, path: resolvedPath, rootArray: false };
            }
            return { error: "Model-only config format is not supported." };
        } catch (err) {
            return { error: err.message };
        }
    };

    const sortModelOnlyEntries = (entries) => {
        return entries
            .map((entry, index) => ({ ...entry, index }))
            .sort((a, b) => {
                const aOrder = Number.isFinite(a.list_order) ? a.list_order : null;
                const bOrder = Number.isFinite(b.list_order) ? b.list_order : null;
                if (aOrder !== null && bOrder !== null) {
                    if (aOrder !== bOrder) return aOrder - bOrder;
                    return a.index - b.index;
                }
                if (aOrder !== null) return -1;
                if (bOrder !== null) return 1;
                return a.index - b.index;
            });
    };
    const baseCodexModelGroups = [
        {
            label: "OpenRouter (OpenAI-compatible IDs)",
            models: ["openai/gpt-4o-mini", "openai/gpt-4o", "openai/gpt-4.1-mini"],
        },
        {
            label: "OpenRouter routing & community",
            models: [
                "openrouter/openai/gpt-5-mini",
                "openrouter/openai/codex-mini",
                "openrouter/auto",
                "openrouter/deepseek/deepseek-chat-v3-0324",
            ],
        },
        {
            label: "GPT-5 family",
            models: ["gpt-5", "gpt-5-mini", "gpt-5-nano", "gpt-5-chat", "gpt-5-pro", "gpt-5-codex"],
        },
        {
            label: "GPT-4.1 family",
            models: ["gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano"],
        },
        {
            label: "GPT-4o family",
            models: ["gpt-4o", "gpt-4o-mini"],
        },
        {
            label: '"o" series (reasoning)',
            models: ["o1", "o3", "o3-mini", "o4-mini"],
        },
        {
            label: "Image generation",
            models: ["gpt-image-1", "gpt-image-1-mini"],
        },
    ];
    const fallbackCodexModel = (() => {
        if (typeof DEFAULT_CODEX_MODEL === "string" && DEFAULT_CODEX_MODEL.trim()) {
            return DEFAULT_CODEX_MODEL.trim();
        }
        return "openrouter/openai/gpt-5-mini";
    })();

    const validCodexModelPattern = CODEX_MODEL_PATTERN instanceof RegExp
        ? CODEX_MODEL_PATTERN
        : /^[A-Za-z0-9._:+-]+(?:\/[A-Za-z0-9._:+-]+)*$/;

    const resolveDefaultCodexModel = (sessionId = "") => {
        const safeSessionId = typeof sessionId === "string" ? sessionId : "";
        if (typeof resolveCodexModelForSession === "function") {
            try {
                const resolved = resolveCodexModelForSession(safeSessionId);
                if (typeof resolved === "string" && resolved.trim()) {
                    return resolved.trim();
                }
            } catch (err) {
                console.error(`[ERROR] resolveDefaultCodexModel: ${err.message}`);
            }
        } else if (typeof getSessionCodexModel === "function") {
            const sessionModel = getSessionCodexModel(safeSessionId);
            if (sessionModel) {
                return sessionModel;
            }
        }

        if (typeof getDefaultCodexModel === "function") {
            try {
                const resolved = getDefaultCodexModel();
                if (typeof resolved === "string" && resolved.trim()) {
                    return resolved.trim();
                }
            } catch (err) {
                console.error(`[ERROR] resolveDefaultCodexModel: ${err.message}`);
            }
        }

        return fallbackCodexModel;
    };

    const buildCodexModelGroups = (defaultCodexModel) => {
        const modelLabelLookup = loadModelOnlyModels({ includePlus: true }).reduce((acc, entry) => {
            if (entry && entry.id) {
                acc[entry.id] = entry.label || entry.id;
            }
            return acc;
        }, {});
        const resolveModelLabel = (modelId) => modelLabelLookup[modelId] || modelId;
        const groups = baseCodexModelGroups.map((group) => ({
            label: group.label,
            models: group.models.map((model) => ({
                id: model,
                label: resolveModelLabel(model),
            })),
        }));

        const openRouterSource = (AIModels && Array.isArray(AIModels.openrouter))
            ? AIModels.openrouter
            : [];
        const openRouterModels = openRouterSource
            .map((model) => getModelId(model))
            .filter((model) => model)
            .map((model) => (model.startsWith("openrouter/") ? model : `openrouter/${model}`));

        if (openRouterModels.length > 0) {
            const uniqueModels = [...new Set(openRouterModels)];
            groups.unshift({
                label: "OpenRouter (Sterling startup fetch)",
                models: uniqueModels.map((model) => ({
                    id: model,
                    label: resolveModelLabel(model),
                })),
            });
        }

        if (defaultCodexModel) {
            const hasDefault = groups.some((group) =>
                group.models.some((model) =>
                    (typeof model === "string" ? model : model.id) === defaultCodexModel,
                ),
            );
            if (!hasDefault) {
                groups.unshift({
                    label: "Saved default",
                    models: [
                        {
                            id: defaultCodexModel,
                            label: resolveModelLabel(defaultCodexModel),
                        },
                    ],
                });
            }
        }

        return groups;
    };

    const codexRunUser = process.env.CODEX_RUN_USER || "sterlingcodex";
    const codexRunUserPattern = /^[a-z_][a-z0-9_-]*$/i;
    let cachedCodexUserIds;

    function getCodexUserIds() {
        if (cachedCodexUserIds !== undefined) {
            return cachedCodexUserIds;
        }

        if (!codexRunUser) {
            cachedCodexUserIds = null;
            return cachedCodexUserIds;
        }

        if (!codexRunUserPattern.test(codexRunUser)) {
            console.warn(
                `⚠️ Agent runner user "${codexRunUser}" contains unsupported characters. Falling back to current user.`,
            );
            cachedCodexUserIds = null;
            return cachedCodexUserIds;
        }

        try {
            const uid = Number.parseInt(
                execSync(`id -u ${codexRunUser}`, { stdio: "pipe" }).toString().trim(),
                10,
            );
            const gid = Number.parseInt(
                execSync(`id -g ${codexRunUser}`, { stdio: "pipe" }).toString().trim(),
                10,
            );

            if (Number.isNaN(uid) || Number.isNaN(gid)) {
                console.warn(
                    `⚠️ Unable to determine UID/GID for Agent runner user "${codexRunUser}". Falling back to current user.`,
                );
                cachedCodexUserIds = null;
            } else {
                cachedCodexUserIds = { uid, gid };
            }
        } catch (err) {
            console.warn(
                `⚠️ Failed to resolve Agent runner user "${codexRunUser}" (${err.message}). Falling back to current user.`,
            );
            cachedCodexUserIds = null;
        }

        return cachedCodexUserIds;
    }

    function sendSse(res, { event, data }) {
        if (res.writableEnded) {
            return;
        }

        if (event) {
            res.write(`event: ${event}\n`);
        }

        const payload = typeof data === "string" ? data : JSON.stringify(data ?? "");
        const lines = payload.split(/\r?\n/);
        for (const line of lines) {
            res.write(`data: ${line}\n`);
        }
        res.write("\n");
    }

    const generateJsonFileTree = (rootDir) => {
        const resolvedRoot = path.resolve(rootDir);
        let entryCount = 0;
        let truncated = false;

        const toPosixPath = (value) => value.split(path.sep).join("/");

        const walk = (currentDir, relativeSegments, depth) => {
            if (depth >= MAX_FILE_TREE_DEPTH) {
                truncated = true;
                return [];
            }

            let entries;
            try {
                entries = fs.readdirSync(currentDir, { withFileTypes: true });
            } catch (err) {
                truncated = true;
                return [];
            }

            const filtered = entries
                .filter((entry) => {
                    const name = entry.name;
                    if (!name) {
                        return false;
                    }
                    if (name.startsWith(".")) {
                        return false;
                    }
                    if (FILE_TREE_EXCLUDES.has(name)) {
                        return false;
                    }
                    return true;
                })
                .sort((a, b) => {
                    if (a.isDirectory() && !b.isDirectory()) return -1;
                    if (!a.isDirectory() && b.isDirectory()) return 1;
                    return a.name.localeCompare(b.name);
                });

            const nodes = [];

            for (let index = 0; index < filtered.length; index += 1) {
                if (entryCount >= MAX_FILE_TREE_ENTRIES) {
                    truncated = true;
                    break;
                }

                const entry = filtered[index];
                const isDirectory = entry.isDirectory();
                const childRelativeSegments = [...relativeSegments, entry.name];
                const childRelativePath = toPosixPath(path.join(...childRelativeSegments));

                entryCount += 1;

                if (isDirectory) {
                    const directoryNode = {
                        name: entry.name,
                        type: "directory",
                        path: childRelativePath,
                        children: [],
                    };

                    if (entryCount < MAX_FILE_TREE_ENTRIES) {
                        const childNodes = walk(
                            path.join(currentDir, entry.name),
                            childRelativeSegments,
                            depth + 1,
                        );
                        if (childNodes.length) {
                            directoryNode.children = childNodes;
                        }
                    } else {
                        truncated = true;
                    }

                    nodes.push(directoryNode);
                } else {
                    nodes.push({
                        name: entry.name,
                        type: "file",
                        path: childRelativePath,
                        to_edit: false,
                    });
                }

                if (truncated) {
                    break;
                }
            }

            return nodes;
        };

        const rootNode = {
            name: path.basename(resolvedRoot) || path.basename(path.dirname(resolvedRoot)) || resolvedRoot,
            type: "directory",
            path: ".",
            children: walk(resolvedRoot, [], 0),
        };

        return {
            tree: rootNode,
            truncated,
        };
    };

    // One-time background prewarm of git metadata on first /agent access
    let __gitPrewarmDone = false;
    const __prewarmGitCaches = (paths) => {
        if (__gitPrewarmDone) return;
        __gitPrewarmDone = true;

        try {
            // Spawn a detached Node.js process to prewarm git caches so it cannot
            // block the main event loop or delay response rendering. We pass the
            // candidate paths via an environment variable as JSON and let the
            // child process do best-effort git calls.
            const env = Object.assign({}, process.env);
            try { env.__STERLING_GIT_PREWARM_PATHS = paths && Array.isArray(paths) ? JSON.stringify(paths) : ''; } catch (_e) { env.__STERLING_GIT_PREWARM_PATHS = ''; }

            const childScript = `
(function(){
  try {
    const fs = require('fs');
    const path = require('path');
    const { spawnSync } = require('child_process');
    const passed = process.env.__STERLING_GIT_PREWARM_PATHS || null;
    const candidates = new Set();
    if (passed) {
      try { const arr = JSON.parse(passed); if (Array.isArray(arr)) arr.forEach(p=>{ if (p) candidates.add(p); }); } catch(_){}
    }
    try {
      const gitRoot = path.join(path.sep, 'git');
      if (fs.existsSync(gitRoot)) {
        const entries = fs.readdirSync(gitRoot, { withFileTypes: true });
        for (const e of entries) {
          try { if (e && (typeof e.isDirectory === 'function' ? e.isDirectory() : e.isDirectory)) candidates.add(path.join(gitRoot, e.name)); } catch(_){}
        }
      }
    } catch(_){}

    for (const p of candidates) {
      try { spawnSync('git', ['-C', p, 'rev-parse', '--git-dir'], { stdio: 'ignore' }); } catch(_){}
      try { spawnSync('git', ['-C', p, 'branch', '--list'], { stdio: 'ignore' }); } catch(_){}
    }
  } catch(_){}
})();
`;

            try {
                const child = require('child_process').spawn(process.execPath, ['-e', childScript], { detached: true, stdio: 'ignore', env });
                child.unref();
            } catch (_e) { /* ignore */ }
        } catch (_e) { /* ignore */ }
    };
    const resolveDefaultProjectDirForSession = (sessionId) => {
        if (!sessionId) {
            return defaultCodexProjectDir;
        }

        let defaultRepoConfig = loadSingleRepoConfig(NEW_SESSION_REPO_NAME, sessionId);
        let defaultRepoPath = defaultRepoConfig?.gitRepoLocalPath || "";

        if (!defaultRepoPath || !fs.existsSync(defaultRepoPath)) {
            try {
                ensureSessionDefaultRepo(sessionId);
            } catch (error) {
                console.error(`Failed to initialize default repo for session: ${error?.message || error}`);
            }
            defaultRepoConfig = loadSingleRepoConfig(NEW_SESSION_REPO_NAME, sessionId);
            defaultRepoPath = defaultRepoConfig?.gitRepoLocalPath || "";
        }

        if (defaultRepoPath && fs.existsSync(defaultRepoPath)) {
            return defaultRepoPath;
        }

        return defaultCodexProjectDir;
    };

    const renderCodexRunner = (req, res) => {
        // Defer git cache prewarm until after the response is finished so the UI
        // can be rendered immediately. The prewarm is best-effort and may be
        // performed after the response has been sent.
        try {
            if (res && typeof res.once === 'function') {
                res.once('finish', () => {
                    try { __prewarmGitCaches(req?.query && [req.query.repo_directory || req.query.projectDir].filter(Boolean)); } catch (_e) { /* ignore */ }
                });
            } else {
                // Fallback: schedule it asynchronously
                setImmediate(() => { try { __prewarmGitCaches(req?.query && [req.query.repo_directory || req.query.projectDir].filter(Boolean)); } catch (_e) { /* ignore */ } });
            }
        } catch (_e) { /* ignore */ }

        const iframeParam = req?.query?.iframe;
        const sessionId = resolveSessionId(req) || getSessionIdFromRequest(req);
        const defaultCodexModel = resolveDefaultCodexModel(sessionId);
        const codexConfig = typeof loadCodexConfig === "function" ? loadCodexConfig() : {};
        const repoDirectoryParam = (req?.query?.repo_directory || "").toString();
        const projectDirParam = (req?.query?.projectDir || "").toString();
        const resolvedDefaultProjectDir = resolveDefaultProjectDirForSession(sessionId);
        const isIframeMode = (typeof iframeParam === 'undefined') ? true : parseBooleanFlag(iframeParam);
        const defaultAgentInstructions =
            typeof codexConfig?.defaultAgentInstructions === "string"
                ? codexConfig.defaultAgentInstructions
                : "";
        const defaultOpenRouterReferer =
            typeof codexConfig?.openRouterReferer === "string" && codexConfig.openRouterReferer.trim()
                ? codexConfig.openRouterReferer.trim()
                : process.env.OPENROUTER_HTTP_REFERER
                    || process.env.HTTP_REFERER
                    || "https://code-s.alfe.sh231";
        const defaultOpenRouterTitle =
            typeof codexConfig?.openRouterTitle === "string" && codexConfig.openRouterTitle.trim()
                ? codexConfig.openRouterTitle.trim()
                : process.env.OPENROUTER_APP_TITLE
                    || process.env.X_TITLE
                    || "Agent via OpenRouter";
        const chatBaseUrl = normalizeBaseUrl(
            process.env.ALFE_CHAT_BASE_URL || process.env.ALFE_CHAT_HOST
        ) || "https://app.alfe.sh";
        const chatDesignUrl = `${chatBaseUrl}/chat/design`;
        const resolvedEditorTarget = resolveEditorTargetForProjectDir(
            repoDirectoryParam,
            sessionId,
        );
        const initialEditorLaunchConfig = resolvedEditorTarget && resolvedEditorTarget.url
            ? resolvedEditorTarget
            : null;
        const showNewTaskButton = parseBooleanFlag(process.env.ENABLE_NEW_TASK_BUTTON);
        const showRunDirectory = parseBooleanFlag(process.env.SHOW_RUN_DIRECTORY);
        const showEngineOnAgent = parseBooleanFlag(process.env.SHOW_ENGINE_ON_AGENT);
        const accountsEnabled = parseBooleanFlagWithDefault(process.env.ACCOUNTS_ENABLED, true);
        const accountButtonEnabled = accountsEnabled;
        const agentModelDropdownDisabled = parseBooleanFlag(process.env.AGENT_MODEL_DROPDOWN_DISABLED);
        const fileTreeButtonVisible = parseBooleanFlagWithDefault(process.env.FILE_TREE_BUTTON_VISIBLE, true);
        res.render("codex_runner", {
            codexScriptPath,
            projectDir: projectDirParam || repoDirectoryParam,
            defaultProjectDir: resolvedDefaultProjectDir,
            codexModelGroups: buildCodexModelGroups(defaultCodexModel),
            defaultCodexModel,
            defaultAgentInstructions,
            defaultOpenRouterReferer,
            defaultOpenRouterTitle,
            isIframeMode,
            editorLaunchConfig: initialEditorLaunchConfig,
            chatBaseUrl,
            chatDesignUrl,

            editorEnabled: parseBooleanFlag(process.env.EDITOR_ENABLED),
            appVersion    : appVersionDisplay,
            enableFollowups: parseBooleanFlag(process.env.ENABLE_FOLLOWUPS),
            showNewTaskButton,
            showRunDirectory,
            showEngineOnAgent,
            accountButtonEnabled,
            accountsEnabled,
            userPromptVisibleCodex: parseBooleanFlag(process.env.USER_PROMPT_VISIBLE_CODEX),
            showStoreButtons: parseBooleanFlag(process.env.SHOW_STORE_BADGES),
            showGithubButton: parseBooleanFlag(process.env.SHOW_GITHUB_BUTTON),
            showImageDesign2026: parseBooleanFlagWithDefault(process.env.IMAGES_ENABLED_2026, true),
            agentModelDropdownDisabled,
            fileTreeButtonVisible,
        });
    };

    app.get("/agent", renderCodexRunner);
    app.get('/agent/help', (req, res) => { res.render('agent_help'); });
    app.get('/agent/model-only', (req, res) => {
        const hideGitLogButtonTarget = parseBooleanFlag(process.env.MODEL_ONLY_HIDE_GIT_LOG_BUTTON_TARGET);
        const engineDropdownHidden = parseBooleanFlag(process.env.ENGINE_DROPDOWN_HIDDEN);
        const apiPanelEnabled = parseBooleanFlag(process.env.API_PANEL_ENABLED);
        const showPrintifyUploadUsage = parseBooleanFlag(process.env.SHOW_PRINTIFY_UPLOAD_USAGE);
        const searchEnabled2026 = parseBooleanFlagWithDefault(process.env.SEARCH_ENABLED_2026, true);
        const imagesEnabled2026 = parseBooleanFlagWithDefault(process.env.IMAGES_ENABLED_2026, true);
        const allowModelOrderEdit = isIpAllowed(getRequestIp(req), configIpWhitelist);
        const allowVmRunsLink = allowModelOrderEdit;
        res.render('model_only', {
            showGitLogButtonTarget: !hideGitLogButtonTarget,
            engineDropdownHidden,
            apiPanelEnabled,
            showPrintifyUploadUsage,
            searchEnabled2026,
            imagesEnabled2026,
            accountsEnabled: parseBooleanFlagWithDefault(process.env.ACCOUNTS_ENABLED, true),
            allowModelOrderEdit,
            allowVmRunsLink,
        });
    });
    app.get('/agent/model-only/order', (req, res) => {
        if (!isIpAllowed(getRequestIp(req), configIpWhitelist)) {
            return res.status(403).send("Forbidden.");
        }
        res.render('model_only_order');
    });
    app.get('/agent/model-only/order/data', (req, res) => {
        if (!isIpAllowed(getRequestIp(req), configIpWhitelist)) {
            return res.status(403).json({ message: "Forbidden." });
        }
        const { models, error } = loadModelOnlyConfigRaw();
        if (error) {
            res.status(500).json({ message: error });
            return;
        }
        const entries = models
            .map((model, index) => {
                const normalised = normaliseModelOnlyEntry(model, {});
                if (!normalised) return null;
                return { key: index, ...normalised };
            })
            .filter(Boolean);
        const sorted = sortModelOnlyEntries(entries);
        res.json({
            models: sorted.map(({ index, ...entry }) => entry),
        });
    });
    app.post('/agent/model-only/order', (req, res) => {
        if (!isIpAllowed(getRequestIp(req), configIpWhitelist)) {
            return res.status(403).json({ message: "Forbidden." });
        }
        const requestedOrder = req.body?.order;
        if (!Array.isArray(requestedOrder)) {
            res.status(400).json({ message: "Order must be an array." });
            return;
        }
        const { parsed, models, path: configPath, error } = loadModelOnlyConfigRaw();
        if (error) {
            res.status(500).json({ message: error });
            return;
        }
        const maxIndex = models.length;
        const seen = new Set();
        const cleanedOrder = [];
        requestedOrder.forEach((value) => {
            const index = Number(value);
            if (!Number.isInteger(index) || index < 0 || index >= maxIndex) {
                return;
            }
            if (seen.has(index)) return;
            seen.add(index);
            cleanedOrder.push(index);
        });
        for (let index = 0; index < maxIndex; index += 1) {
            if (!seen.has(index)) {
                cleanedOrder.push(index);
            }
        }
        cleanedOrder.forEach((modelIndex, position) => {
            const entry = models[modelIndex];
            if (entry && typeof entry === "object") {
                entry.list_order = position;
                return;
            }
            if (typeof entry === "string") {
                models[modelIndex] = { id: entry, list_order: position };
            }
        });
        try {
            fs.writeFileSync(configPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf-8");
            res.json({ message: "Order saved." });
        } catch (err) {
            res.status(500).json({ message: err.message });
        }
    });
    app.get('/support', async (req, res) => {
        const account = await requireSupportPlan(req, res);
        if (!account) {
            return;
        }
        res.render('support');
    });

    app.get('/support/requests/:id', async (req, res) => {
        const account = await requireSupportPlan(req, res);
        if (!account) {
            return;
        }
        const request = await rdsStore.getSupportRequestById({
            requestId: req.params?.id,
            accountId: account?.id,
        });
        if (!request) {
            return res.status(404).send("Support request not found.");
        }
        const allowAdminReply = isIpAllowed(getRequestIp(req), configIpWhitelist);
        return res.render('support_request', { request, allowAdminReply });
    });



    app.get("/agent/file-tree", (req, res) => {
        const projectDir = (req.query.projectDir || "").toString().trim();

        if (!projectDir) {
            res.status(400).json({ error: "Project directory is required." });
            return;
        }

        const resolvedPath = path.resolve(projectDir);
        let stats;
        try {
            stats = fs.statSync(resolvedPath);
        } catch (err) {
            res.status(404).json({ error: `Project directory not found: ${projectDir}` });
            return;
        }

        if (!stats.isDirectory()) {
            res.status(400).json({ error: "Provided project directory is not a directory." });
            return;
        }

        try {
            const { tree, truncated } = generateJsonFileTree(resolvedPath);
            res.json({ fileTree: tree, truncated });
        } catch (err) {
            console.error(`[ERROR] Failed to generate file tree for ${resolvedPath}:`, err);
            res.status(500).json({ error: "Failed to generate file tree." });
        }
    });

    app.get("/agent/file-tree/view", (req, res) => {
        const projectDir = (req.query.projectDir || "").toString().trim();

        if (!projectDir) {
            res.status(400).send("Project directory is required.");
            return;
        }

        const resolvedPath = path.resolve(projectDir);
        let stats;
        try {
            stats = fs.statSync(resolvedPath);
        } catch (err) {
            res.status(404).send(`Project directory not found: ${projectDir}`);
            return;
        }

        if (!stats.isDirectory()) {
            res.status(400).send("Provided project directory is not a directory.");
            return;
        }

        res.render("file_tree", {
            gitRepoNameCLI: "Agent",
            chatNumber: "N/A",
            projectDir: resolvedPath,
            environment: res.locals.environment,
        });
    });

    app.get("/agent/test-python", async (_req, res) => {
        const commandsToTry = [
            { binary: "python", args: ["--version"] },
            { binary: "python3", args: ["--version"] },
        ];

        const runCommand = (binary, args) => new Promise((resolve) => {
            let stdout = "";
            let stderr = "";
            let settled = false;
            let child;
            try {
                child = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"] });
            } catch (error) {
                resolve({
                    success: false,
                    exitCode: null,
                    stdout: "",
                    stderr: "",
                    errorMessage: error?.message || String(error || ""),
                });
                return;
            }

            child.stdout.on("data", (chunk) => {
                stdout += chunk.toString();
            });

            child.stderr.on("data", (chunk) => {
                stderr += chunk.toString();
            });

            child.on("error", (error) => {
                if (settled) {
                    return;
                }
                settled = true;
                resolve({
                    success: false,
                    exitCode: null,
                    stdout,
                    stderr,
                    errorMessage: error?.message || String(error || ""),
                });
            });

            child.on("close", (code) => {
                if (settled) {
                    return;
                }
                settled = true;
                const exitCode = typeof code === "number" ? code : null;
                resolve({
                    success: exitCode === 0,
                    exitCode,
                    stdout,
                    stderr,
                    errorMessage:
                        exitCode === 0
                            ? ""
                            : `Process exited with code ${exitCode !== null ? exitCode : "unknown"}.`,
                });
            });
        });

        const attempts = [];
        let successfulAttempt = null;

        for (const command of commandsToTry) {
            const result = await runCommand(command.binary, command.args);
            const commandLabel = `${command.binary} ${command.args.join(" ")}`.trim();
            const formattedAttempt = {
                command: commandLabel,
                exitCode: result.exitCode,
                stdout: (result.stdout || "").trim(),
                stderr: (result.stderr || "").trim(),
                error: result.errorMessage ? result.errorMessage.trim() : "",
            };
            attempts.push(formattedAttempt);
            if (result.success) {
                successfulAttempt = {
                    command: commandLabel,
                    versionOutput: formattedAttempt.stdout || formattedAttempt.stderr,
                };
                break;
            }
        }

        const success = Boolean(successfulAttempt);
        const versionOutput = success ? (successfulAttempt.versionOutput || "").trim() : "";
        let message;
        if (success) {
            const commandLabel = successfulAttempt.command || "python --version";
            message = versionOutput
                ? `Python command is available via "${commandLabel}" – ${versionOutput}`
                : `Python command is available via "${commandLabel}".`;
        } else {
            const lastAttempt = attempts[attempts.length - 1] || {};
            const errorDetail = (lastAttempt.stderr || lastAttempt.error || lastAttempt.stdout || "")
                .toString()
                .trim();
            const detailSuffix = errorDetail ? ` ${errorDetail}` : "";
            message = `Python command is not available.${detailSuffix}`;
        }

        res.json({
            success,
            message,
            command: successfulAttempt?.command || null,
            versionOutput: versionOutput || null,
            attempts,
        });
    });

    app.get("/agent/stream", (req, res) => {
        const sessionId = resolveSessionId(req) || getSessionIdFromRequest(req);
        const projectDir = (req.query.projectDir || "").toString().trim();
        const prompt = (req.query.prompt || "").toString().trim();
        const requestedModel = (req.query.model || "").toString().trim();
        const openRouterReferer = (req.query.openRouterReferer || "").toString().trim();
        const openRouterTitle = (req.query.openRouterTitle || "").toString().trim();
        const engineParam = (req.query.engine || "").toString().trim().toLowerCase();
        const enginePreference = ["auto", "qwen", "codex", "cline", "sterling", "kilo", "blackbox"].includes(engineParam) ? engineParam : "auto";
        const qwenDebugEnvParam = (req.query.qwenDebugEnv || "").toString().trim().toLowerCase();
        const qwenDebugEnvEnabled = qwenDebugEnvParam === "1" || qwenDebugEnvParam === "true";
        const includeMetaParam = (req.query.includeMeta || "").toString().trim().toLowerCase();
        const includeMeta = includeMetaParam === "1" || includeMetaParam === "true";
        const gitFpushParam = (req.query.gitFpush || "").toString().trim().toLowerCase();
        const gitFpushEnabled = gitFpushParam === "1" || gitFpushParam === "true";
        const userPromptRaw = (req.query.userPrompt || "").toString();
        const agentInstructionsRaw = (req.query.agentInstructions || "").toString();
        const followupParentIdRaw = (req.query.followupParentId || "").toString().trim();

        let scriptPath = codexScriptPath;
        const defaultCodexModel = resolveDefaultCodexModel(sessionId);
        let model = defaultCodexModel;
        let invalidModelReason = "";
        if (requestedModel) {
            if (validCodexModelPattern.test(requestedModel)) {
                model = requestedModel;
            } else {
                invalidModelReason = `Requested model \"${requestedModel}\" contains unsupported characters.`;
            }
        }
        const requestedModelLabel = requestedModel || "none";
        const invalidModelLabel = invalidModelReason || "none";
        console.log(
            `[INFO] Codex model resolved for run ${sessionId}: final="${model}" requested="${requestedModelLabel}" default="${defaultCodexModel}" invalidReason="${invalidModelLabel}"`,
        );

        const runRecord = {
            id: randomUUID(),
            startedAt: new Date().toISOString(),
            finishedAt: null,
            projectDir,
            requestedProjectDir: projectDir,
            effectiveProjectDir: projectDir,
            gitBranch: "",
            userPrompt: userPromptRaw,
            agentInstructions: agentInstructionsRaw,
            effectivePrompt: prompt,
            model,
            includeMeta,
            gitFpushEnabled,
            openRouterReferer,
            openRouterTitle,
            enginePreference,
            qwenDebugEnvEnabled,
            followupParentId: followupParentIdRaw,
            statusHistory: [],
            metaMessages: [],
            stdout: "",
            stdoutOnly: "",
            finalOutput: "",
            qwenCli: false,
            stderr: "",
            stdoutTruncated: false,
            stderrTruncated: false,
            exitCode: null,
            gitFpushExitCode: null,
            gitFpushDetectedChanges: false,
            finalMessage: "",
            error: "",
            invalidModelReason,
        };
        const envOverrides = {};
        let vmSession = null;
        let vmHostPort = null;
        let effectiveProjectDir = projectDir;
        let runPersisted = false;
        let codexStreamTerminated = false;
        let gitFpushChild = null;
        let lastRunRecordPersistTs = 0;
        const RUN_RECORD_PERSIST_INTERVAL_MS = 2000;
        let lastBranchDir = "";
        let branchPersistTimeoutId = null;

        const updateRunBranchFromDir = (candidateDir, { force = false, skipPersist = false } = {}) => {
            const targetDir = typeof candidateDir === "string" ? candidateDir.trim() : "";
            if (!targetDir) {
                return;
            }

            const previousBranch = typeof runRecord.gitBranch === "string" ? runRecord.gitBranch : "";
            const resolvedBranch = resolveGitBranchName(targetDir);
            const normalizedBranch = typeof resolvedBranch === "string" ? resolvedBranch.trim() : "";
            const branchChanged = normalizedBranch !== previousBranch;

            const scheduleBranchPersist = () => {
                if (skipPersist || !branchChanged) {
                    return;
                }
                if (branchPersistTimeoutId) {
                    clearTimeout(branchPersistTimeoutId);
                }
                branchPersistTimeoutId = setTimeout(() => {
                    branchPersistTimeoutId = null;
                    persistRunRecord({ force: true, skipBranchUpdate: true });
                }, 0);
            };

            if (normalizedBranch) {
                lastBranchDir = targetDir;
                if (!branchChanged && !force) {
                    return;
                }
                runRecord.gitBranch = normalizedBranch;
                scheduleBranchPersist();
                return;
            }

            if (force && lastBranchDir !== targetDir) {
                lastBranchDir = targetDir;
            }

            if (force && previousBranch) {
                runRecord.gitBranch = "";
                scheduleBranchPersist();
            }
        };

        const persistRunRecord = ({ ensureFinished = false, force = false, skipBranchUpdate = false } = {}) => {
            if (ensureFinished) {
                runRecord.finishedAt = runRecord.finishedAt || new Date().toISOString();
            }

            runRecord.effectiveProjectDir = effectiveProjectDir;

            if (!skipBranchUpdate) {
                const branchTargetDir = effectiveProjectDir || projectDir;
                if (branchTargetDir) {
                    updateRunBranchFromDir(branchTargetDir, { force: true, skipPersist: true });
                }
            }

            const now = Date.now();
            if (!force && runPersisted && now - lastRunRecordPersistTs < RUN_RECORD_PERSIST_INTERVAL_MS) {
                return;
            }

            try {
                upsertCodexRun(sessionId, runRecord);
                runPersisted = true;
                lastRunRecordPersistTs = now;
            } catch (error) {
                console.error(`[ERROR] Failed to persist codex run: ${error.message}`);
            }
        };

        const markGitFpushChangeIfDetected = (text) => {
            if (!text || runRecord.gitFpushDetectedChanges) {
                return;
            }

            if (detectGitChangeIndicator(text)) {
                runRecord.gitFpushDetectedChanges = true;
                persistRunRecord({ force: true, skipBranchUpdate: true });
            }
        };

        updateRunBranchFromDir(projectDir, { force: true, skipPersist: true });
        persistRunRecord({ force: true });

        res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
        });

        if (typeof res.flushHeaders === "function") {
            res.flushHeaders();
        }

        const emit = ({ event, data }) => {
            if (res.writableEnded) {
                return;
            }
            const rawPayload = typeof data === "string" ? data : JSON.stringify(data ?? "");
            const payloadString = stripCodexUserPromptFromText(rawPayload);
            if (!payloadString && (event === "output" || event === "stderr")) {
                return;
            }
            let shouldPersist = false;
            switch (event) {
                case "output": {
                    const { truncated } = appendTextWithLimit(runRecord, "stdout", payloadString, MAX_RUN_OUTPUT_LENGTH);
                    if (truncated) {
                        runRecord.stdoutTruncated = true;
                    }
                    break;
                }
                case "stderr": {
                    const { truncated } = appendTextWithLimit(runRecord, "stderr", payloadString, MAX_RUN_OUTPUT_LENGTH);
                    if (truncated) {
                        runRecord.stderrTruncated = true;
                    }
                    break;
                }
                case "status": {
                    pushHistoryEntry(runRecord, "statusHistory", payloadString, MAX_STATUS_HISTORY);
                    shouldPersist = true;
                    break;
                }
                case "meta": {
                    pushHistoryEntry(runRecord, "metaMessages", payloadString, MAX_STATUS_HISTORY);
                    shouldPersist = true;
                    break;
                }
                case "stream-error": {
                    if (!runRecord.error) {
                        runRecord.error = payloadString;
                    }
                    shouldPersist = true;
                    break;
                }
                case "end": {
                    if (payloadString) {
                        runRecord.finalMessage = payloadString;
                    }
                    break;
                }
                default:
                    break;
            }
            sendSse(res, { event, data: payloadString });
            if (shouldPersist) {
                persistRunRecord();
            }
        };

        // Optional: spawn per-task QEMU VM if env ALFECODE_SPAWN_VM_PER_TASK=true or ?vm=1
        const spawnVmByEnv = parseBooleanFlag(process.env.ALFECODE_SPAWN_VM_PER_TASK);
        const wantVM = spawnVmByEnv || parseBooleanFlag(req.query.vm);
        if (wantVM && typeof vmManager?.startVm === "function") {
            const result = vmManager.startVm();
            if (result?.ok) {
                vmSession = result.session;
                vmHostPort = result.session.assignedPort;
                emit({
                    event: "meta",
                    data: `Spinning up QEMU VM (session ${vmSession.sessionId}) on host port ${vmHostPort}`,
                });
            } else {
                emit({ event: "meta", data: `VM spawn failed: ${result?.error || "unknown error"}` });
            }
        }

        // If VM is ready, re-route agent run to it via SSH. For now, capture host port for downstream use.
        if (vmHostPort) {
            envOverrides.ALFECODE_VM_HOST_PORT = String(vmHostPort);
            envOverrides.ALFECODE_VM_SESSION_ID = vmSession.sessionId;
            if (vmSession.sshPort) {
                envOverrides.ALFECODE_VM_SSH_PORT = String(vmSession.sshPort);
            }
        }

        const closeStream = () => {
            if (!res.writableEnded) {
                res.end();
            }
        };

        const finalizeStream = (message) => {
            if (codexStreamTerminated) {
                return;
            }
            codexStreamTerminated = true;
            if (!runRecord.finalOutput && runRecord.qwenCli) {
                runRecord.finalOutput = resolveQwenCliFinalOutput(runRecord);
            }
            if (typeof message === "string" && message) {
                runRecord.finalMessage = message;
            }
            runRecord.finishedAt = runRecord.finishedAt || new Date().toISOString();
            emit({ event: "end", data: message });
            closeStream();
            persistRunRecord({ ensureFinished: true, force: true });
        };

        emit({ event: "status", data: "Preparing Agent run..." });

        if (!prompt) {
            const errorMessage = "Prompt is required to run Agent.";
            runRecord.error = errorMessage;
            emit({ event: "stream-error", data: errorMessage });
            finalizeStream("Agent run aborted before start.");
            return;
        }

        const codexToolsDir = path.dirname(scriptPath);
        const modelOnlyLookup = loadModelOnlyModels().reduce((acc, entry) => {
            if (entry && typeof entry.id === "string") {
                acc[entry.id] = entry;
            }
            return acc;
        }, {});
        const resolveQwenCliFlag = (modelId) => Boolean(modelOnlyLookup[modelId]?.qwen_cli);
        const resolveQwenCliModel = (modelId, { force = false } = {}) => {
            const entry = modelOnlyLookup[modelId];
            if (entry?.qwen_cli) {
                if (typeof entry.qwen_cli_model === "string" && entry.qwen_cli_model.trim().length > 0) {
                    return entry.qwen_cli_model.trim();
                }
                const normalizedModelId = modelId.replace(/^openrouter\//, "");
                if (normalizedModelId.startsWith("qwen/")) {
                    return normalizedModelId;
                }
                return `${normalizedModelId}`;
            }
            if (!force) return "";
            return modelId.replace(/^openrouter\//, "");
        };
        const args = [];
        if (invalidModelReason) {
            runRecord.invalidModelReason = invalidModelReason;
        }
        if (invalidModelReason && includeMeta) {
            emit({ event: "meta", data: `${invalidModelReason} Falling back to ${defaultCodexModel}.` });
            model = defaultCodexModel;
        }
        // Qwen CLI upgrade context/instructions thread:
        // https://chatgpt.com/c/698edc81-5688-8325-8c87-908e3b273373
        const useQwenCli = enginePreference === "qwen" || enginePreference === "sterling"
            ? true
            : enginePreference === "cline"
                ? false  // Cline will be handled separately
            : enginePreference === "codex" || enginePreference === "blackbox"
                ? false
                : resolveQwenCliFlag(model);
        runRecord.qwenCli = useQwenCli;
        const wantsOpenRouterHeaders = Boolean(openRouterReferer || openRouterTitle) && !useQwenCli;

        emit({
            event: "run-info",
            data: {
                id: runRecord.id,
                numericId: runRecord.numericId,
                projectDir,
                requestedProjectDir: projectDir,
                effectiveProjectDir,
                qwenCli: useQwenCli,
            },
        });

        if (!fs.existsSync(scriptPath)) {
            const errorMessage = `Agent runner script not found at ${scriptPath}`;
            runRecord.error = errorMessage;
            emit({ event: "stream-error", data: errorMessage });
            finalizeStream("Agent run aborted before start.");
            return;
        }

        const baseSpawnOptions = {
            cwd: codexToolsDir,
            env: { ...process.env, ...envOverrides },
            stdio: ["ignore", "pipe", "pipe"],
        };

        if (useQwenCli) {
            baseSpawnOptions.env.QWEN_PASS_DEBUG_ENV = qwenDebugEnvEnabled ? "1" : "0";
        }

        if (enginePreference === "cline") {
            // Handle Cline engine - run cline CLI with proper permissions
            const clineCommand = `export CLINE_COMMAND_PERMISSIONS='{"allow": [], "deny": ["*"]}' && cline -y "${prompt}"`;
            if (includeMeta) {
                emit({ event: "meta", data: "Using Cline CLI for this run." });
            }
            // Store the Cline command for execution in the child process
            baseSpawnOptions.env.CLINE_COMMAND = clineCommand;
            // Use a different script path for Cline execution
            const clineScriptPath = path.join(PROJECT_ROOT, "codex-tools", "run_cline.sh");
            scriptPath = clineScriptPath;
        } else if (useQwenCli) {
            // Keep this argument wiring aligned with the Qwen upgrade notes:
            // https://chatgpt.com/c/698edc81-5688-8325-8c87-908e3b273373
            args.push("--qwen-cli");
            const qwenCliModel = resolveQwenCliModel(model, { force: enginePreference === "qwen" });
            if (qwenCliModel) {
                args.push("--qwen-model", qwenCliModel);
            }
        } else {
            args.push("--api-key-mode");
        }

        if (model) {
            if (includeMeta) {
                emit({ event: "meta", data: `Agent model: ${model}` });
            }
            if (!useQwenCli) {
                args.push("--model", model);
            }
        }
        runRecord.model = model;

        if (projectDir) {
            args.push("--project-dir", projectDir);
        }
        if (wantsOpenRouterHeaders) {
            if (openRouterReferer) {
                args.push("--openrouter-referer", openRouterReferer);
            }
            if (openRouterTitle) {
                args.push("--openrouter-title", openRouterTitle);
            }
        }
        if (useQwenCli) {
            args.push("--approval-mode", "auto-edit");
            if (includeMeta) {
                emit({ event: "meta", data: "Qwen auto-edit approval mode is enabled." });
                emit({ event: "meta", data: "Using qwen CLI for this run." });
            }
        }
        args.push(prompt);

        baseSpawnOptions.env.CODEX_SHOW_META = includeMeta ? "1" : "0";

        const codexUserIds = getCodexUserIds();
        let child;
        let userSwitchError;

        if (codexUserIds) {
            try {
                child = spawn(scriptPath, args, {
                    ...baseSpawnOptions,
                    uid: codexUserIds.uid,
                    gid: codexUserIds.gid,
                });
            } catch (err) {
                userSwitchError = err;
            }
        }

        if (!child && userSwitchError) {
            if (userSwitchError.code === "EPERM") {
                console.warn(
                    `⚠️ Unable to switch to Agent runner user "${codexRunUser}": ${userSwitchError.message}. Falling back to current user.`,
                );
                emit({
                    event: "status",
                    data: `Unable to switch to ${codexRunUser}. Running Agent as the current user instead.`,
                });
            } else {
                const errorMessage = `Failed to start Agent: ${userSwitchError.message}`;
                runRecord.error = errorMessage;
                emit({ event: "stream-error", data: errorMessage });
                finalizeStream("Agent run aborted before start.");
                return;
            }
        }

        if (!child) {
            try {
                child = spawn(scriptPath, args, baseSpawnOptions);
            } catch (err) {
                const errorMessage = `Failed to start Agent: ${err.message}`;
                runRecord.error = errorMessage;
                emit({ event: "stream-error", data: errorMessage });
                finalizeStream("Agent run aborted before start.");
                return;
            }
        }

        const statusMessage = "Running...";
        emit({ event: "status", data: statusMessage });

        const updateEffectiveProjectDir = (candidateDir) => {
            if (typeof candidateDir !== "string") {
                return;
            }
            const trimmed = candidateDir.trim();
            if (!trimmed) {
                return;
            }
            if (trimmed === effectiveProjectDir) {
                return;
            }
            effectiveProjectDir = trimmed;
            runRecord.effectiveProjectDir = trimmed;
            updateRunBranchFromDir(trimmed, { force: true });
            emit({
                event: "meta",
                data: `Agent snapshot directory detected: ${trimmed}`,
            });
        };

        let stdoutLineBuffer = "";

        const emitFilteredStdout = (segment) => {
            if (typeof segment !== "string" || segment.length === 0) {
                return;
            }
            emit({ event: "output", data: segment });
        };

        const isPotentialMarkerPrefix = (value) => {
            if (typeof value !== "string" || value.length === 0) {
                return false;
            }
            const maxCheckLength = Math.min(value.length, CODEX_RUNNER_PROJECT_DIR_MARKER.length);
            for (let prefixLength = 1; prefixLength <= maxCheckLength; prefixLength += 1) {
                const suffix = value.slice(-prefixLength);
                if (CODEX_RUNNER_PROJECT_DIR_MARKER.startsWith(suffix)) {
                    return true;
                }
            }
            return false;
        };

        const processCompletedLine = (lineWithNewline) => {
            if (typeof lineWithNewline !== "string") {
                return;
            }
            const trimmedLine = lineWithNewline.replace(/[\r\n]+$/, "");
            if (trimmedLine.startsWith(CODEX_RUNNER_PROJECT_DIR_MARKER)) {
                const detectedDir = trimmedLine.slice(CODEX_RUNNER_PROJECT_DIR_MARKER.length);
                updateEffectiveProjectDir(detectedDir);
                return;
            }
            emitFilteredStdout(lineWithNewline);
        };

        const handleStdoutChunk = (chunk) => {
            stdoutLineBuffer += chunk;
            let processedUpTo = 0;
            let newlineIndex = stdoutLineBuffer.indexOf("\n", processedUpTo);
            while (newlineIndex !== -1) {
                const lineWithNewline = stdoutLineBuffer.slice(processedUpTo, newlineIndex + 1);
                processCompletedLine(lineWithNewline);
                processedUpTo = newlineIndex + 1;
                newlineIndex = stdoutLineBuffer.indexOf("\n", processedUpTo);
            }
            stdoutLineBuffer = stdoutLineBuffer.slice(processedUpTo);
            if (stdoutLineBuffer) {
                const trimmedRemainder = stdoutLineBuffer.replace(/[\r\n]+$/, "");
                const remainderLooksLikeMarker = trimmedRemainder.startsWith(
                    CODEX_RUNNER_PROJECT_DIR_MARKER,
                );
                if (!remainderLooksLikeMarker && !isPotentialMarkerPrefix(stdoutLineBuffer)) {
                    emitFilteredStdout(stdoutLineBuffer);
                    stdoutLineBuffer = "";
                }
            }
        };

        child.stdout.on("data", (chunk) => {
            const text = chunk.toString();
            handleStdoutChunk(text);
        });

        child.stdout.on("end", () => {
            if (stdoutLineBuffer) {
                const remaining = stdoutLineBuffer;
                stdoutLineBuffer = "";
                const trimmedRemaining = remaining.replace(/[\r\n]+$/, "");
                if (trimmedRemaining.startsWith(CODEX_RUNNER_PROJECT_DIR_MARKER)) {
                    const detectedDir = trimmedRemaining.slice(CODEX_RUNNER_PROJECT_DIR_MARKER.length);
                    updateEffectiveProjectDir(detectedDir);
                } else {
                    emitFilteredStdout(remaining);
                }
            }
        });

        child.stderr.on("data", (chunk) => {
            emit({ event: "stderr", data: chunk.toString() });
        });

        child.on("error", (err) => {
            const errorMessage = `Agent process error: ${err.message}`;
            runRecord.error = errorMessage;
            emit({ event: "stream-error", data: errorMessage });
            finalizeStream("Agent run encountered an error.");
        });

        const runGitFpushIfNeeded = (code) => {
            if (codexStreamTerminated) {
                return Promise.resolve();
            }
            runRecord.exitCode = code;
            const exitMessage = `Agent exited with code ${code}.`;
            emit({ event: "status", data: exitMessage });

            if (code !== 0) {
                finalizeStream(exitMessage);
                return Promise.resolve();
            }

            if (!gitFpushEnabled) {
                emit({
                    event: "status",
                    data: "git_fpush.sh skipped: automatic push disabled.",
                });
                finalizeStream(exitMessage);
                return Promise.resolve();
            }

            if (!effectiveProjectDir) {
                emit({
                    event: "status",
                    data: projectDir
                        ? `git_fpush.sh skipped: project directory was not provided (requested: ${projectDir}).`
                        : "git_fpush.sh skipped: project directory was not provided.",
                });
                finalizeStream(exitMessage);
                return Promise.resolve();
            }

            const resolvedProjectDir = path.resolve(effectiveProjectDir);
            let projectStats;
            try {
                projectStats = fs.statSync(resolvedProjectDir);
            } catch (_err) {
                // project directory not found: silently skip git_fpush to avoid
                // showing an alarming message in the Git Tree UI.
                finalizeStream(exitMessage);
                return Promise.resolve();
            }

            if (!projectStats.isDirectory()) {
                emit({
                    event: "status",
                    data: "git_fpush.sh skipped: project directory is not a directory.",
                });
                finalizeStream(exitMessage);
                return Promise.resolve();
            }

            const gitFpushScript = path.join(codexToolsDir, "git_fpush.sh");
            if (!fs.existsSync(gitFpushScript)) {
                emit({
                    event: "status",
                    data: `git_fpush.sh skipped: script not found at ${gitFpushScript}.`,
                });
                finalizeStream(exitMessage);
                return Promise.resolve();
            }

            const patchResult = applyPatchFromCodexOutput(runRecord, resolvedProjectDir, emit);
            if (patchResult.error) {
                runRecord.error = patchResult.error;
                finalizeStream(`${exitMessage} Failed to apply patch from Agent output.`);
                return Promise.resolve();
            }

            emit({
                event: "status",
                data: `Agent succeeded. Running git commit & push in ${resolvedProjectDir}...`,
            });

            return new Promise((resolve) => {
                // Pass the collected stdout-only output and final output to the git_fpush script.
                const gitFpushStdout = resolveStdoutOnlyTextForCommit(runRecord);
                const normalisedGitFpushStdout = typeof gitFpushStdout === "string" ? gitFpushStdout : "";
                runRecord.stdoutOnly = normalisedGitFpushStdout;

                // Resolve the final output (may call OpenRouter) and then spawn the
                // git_fpush script once ready. We use an async IIFE inside the
                // Promise executor so we can await the potentially-async
                // resolveFinalOutputTextForCommit.
                let gitFpushChildLocal = null;
                let gitFpushFinished = false;

                const completeGitFpush = (handler) => {
                    if (gitFpushFinished) {
                        return;
                    }
                    gitFpushFinished = true;
                    try {
                        handler();
                    } finally {
                        resolve();
                    }
                };

                (async () => {
                    try {
                        const gitFpushFinalOutput = await resolveFinalOutputTextForCommit(runRecord);
                        const normalisedGitFpushFinalOutput =
                            typeof gitFpushFinalOutput === "string" ? gitFpushFinalOutput : "";
                        runRecord.finalOutput = normalisedGitFpushFinalOutput;
                        persistRunRecord({ force: true });

                        gitFpushChildLocal = spawn(gitFpushScript, [], {
                            cwd: resolvedProjectDir,
                            env: {
                                ...process.env,
                                GIT_FPUSH_STDOUT: normalisedGitFpushStdout,
                                GIT_FPUSH_FINAL_OUTPUT: normalisedGitFpushFinalOutput,
                            },
                            stdio: ["ignore", "pipe", "pipe"],
                        });

                        gitFpushChild = gitFpushChildLocal;

                        gitFpushChildLocal.stdout.on("data", (chunk) => {
                            const chunkText = chunk.toString();
                            emit({ event: "output", data: chunkText });
                            markGitFpushChangeIfDetected(chunkText);
                        });

                        gitFpushChildLocal.stderr.on("data", (chunk) => {
                            const chunkText = chunk.toString();
                            emit({ event: "stderr", data: chunkText });
                            markGitFpushChangeIfDetected(chunkText);
                        });

                        gitFpushChildLocal.on("error", (err) => {
                            completeGitFpush(() => {
                                runRecord.gitFpushExitCode = null;
                                const errorMessage = `git_fpush.sh failed to start: ${err.message}`;
                                runRecord.error = errorMessage;
                                emit({ event: "stream-error", data: errorMessage });
                                gitFpushChild = null;
                                finalizeStream(`${exitMessage} git_fpush.sh failed to start.`);
                            });
                        });

                        gitFpushChildLocal.on("close", (gitCode) => {
                            completeGitFpush(() => {
                                gitFpushChild = null;
                                runRecord.gitFpushExitCode = gitCode;
                                const gitMessage = `git_fpush.sh exited with code ${gitCode}.`;
                                emit({
                                    event: "status",
                                    data: gitMessage,
                                });
                                finalizeStream(`${exitMessage} ${gitMessage}`);
                            });
                        });
                    } catch (err) {
                        completeGitFpush(() => {
                            const errorMessage = `Failed to run git_fpush.sh: ${err.message || err}`;
                            runRecord.error = errorMessage;
                            emit({ event: "stream-error", data: errorMessage });
                            finalizeStream(`${exitMessage} Failed to run git_fpush.sh.`);
                        });
                    }
                })();
            });
        };

        child.on("close", (code) => {
            if (codexStreamTerminated) {
                return;
            }
            runGitFpushIfNeeded(code).catch((err) => {
                const errorMessage = `Failed to run git_fpush.sh: ${err.message}`;
                runRecord.error = errorMessage;
                emit({ event: "stream-error", data: errorMessage });
                finalizeStream(`Agent exited with code ${code}. Failed to run git_fpush.sh.`);
            });
        });

        req.on("close", () => {
            if (child && !child.killed) {
                child.kill("SIGTERM");
            }
            if (gitFpushChild && !gitFpushChild.killed) {
                gitFpushChild.kill("SIGTERM");
            }
            if (!codexStreamTerminated) {
                codexStreamTerminated = true;
                runRecord.finalMessage = runRecord.finalMessage || "Connection closed.";
                runRecord.finishedAt = new Date().toISOString();
                closeStream();
                persistRunRecord({ ensureFinished: true, force: true });
            }
        });
    });

    app.get("/agent/runs/data", (req, res) => {
        const sessionId = resolveSessionId(req) || getSessionIdFromRequest(req);
        const repoDirectoryFilter = (req.query.repo_directory || "").toString().trim();
        const runIdFilter = (req.query.run_id || "").toString().trim();

        let runs = [];
        try {
            const loaded = loadCodexRuns(sessionId);
            runs = Array.isArray(loaded) ? loaded : [];
        } catch (error) {
            console.error(`[ERROR] Failed to load codex runs: ${error.message}`);
            runs = [];
        }

        let filteredRuns = runs;
        const repoFilterMeta = {
            applied: false,
            raw: repoDirectoryFilter,
            normalized: repoDirectoryFilter ? normaliseProjectDir(repoDirectoryFilter) : "",
            matched: false,
            usedFallback: false,
            recoveredWithAllRuns: false,
        };

        if (repoDirectoryFilter) {
            repoFilterMeta.applied = true;
            const { variants: filterVariants, lowerVariants: filterLowerVariants } =
                collectProjectDirComparisons(repoDirectoryFilter);

            const buildRunVariantSets = (run) => {
                const variantSet = new Set();
                const lowerVariantSet = new Set();
                const sources = [run?.projectDir, run?.effectiveProjectDir, run?.requestedProjectDir];
                sources.forEach((source) => {
                    const { variants, lowerVariants } = collectProjectDirComparisons(source);
                    variants.forEach((entry) => variantSet.add(entry));
                    lowerVariants.forEach((entry) => lowerVariantSet.add(entry));
                });
                return { variantSet, lowerVariantSet };
            };

            const matchRuns = (runsToFilter, { allowLowerOnly = false } = {}) =>
                runsToFilter.filter((run) => {
                    const { variantSet, lowerVariantSet } = buildRunVariantSets(run);

                    if (!allowLowerOnly) {
                        for (const candidate of filterVariants) {
                            if (variantSet.has(candidate)) {
                                return true;
                            }
                        }
                    }

                    for (const candidate of filterLowerVariants) {
                        if (lowerVariantSet.has(candidate)) {
                            return true;
                        }
                    }

                    return false;
                });

            let matches = matchRuns(filteredRuns);

            if (!matches.length && filterLowerVariants.size) {
                repoFilterMeta.usedFallback = true;
                matches = matchRuns(filteredRuns, { allowLowerOnly: true });
            }

            if (!matches.length) {
                const normalizedFilterLower = (repoFilterMeta.normalized || repoDirectoryFilter || "").toLowerCase();
                if (normalizedFilterLower) {
                    repoFilterMeta.usedFallback = true;
                    matches = filteredRuns.filter((run) => {
                        const candidates = [
                            normaliseProjectDir(run?.projectDir),
                            normaliseProjectDir(run?.effectiveProjectDir),
                            normaliseProjectDir(run?.requestedProjectDir),
                        ].filter(Boolean);
                        return candidates.some((candidate) =>
                            candidate.toLowerCase().includes(normalizedFilterLower),
                        );
                    });
                }
            }

            if (matches.length) {
                filteredRuns = matches;
                repoFilterMeta.matched = true;
            } else if (filteredRuns.length) {
                repoFilterMeta.usedFallback = true;
                repoFilterMeta.recoveredWithAllRuns = true;
            }
        }
        if (runIdFilter) {
            filteredRuns = filteredRuns.filter((run) => (run?.id || "").toString() === runIdFilter);
        }

        res.json({ runs: filteredRuns, repoFilter: repoFilterMeta });
    });

    app.get("/agent/runs", (req, res) => {
        const repoDirectory = (req.query.repo_directory || "").toString();
        const runId = (req.query.run_id || "").toString();
        const sessionId = resolveSessionId(req) || getSessionIdFromRequest(req);
        res.render("codex_runs", { repoDirectory, runId, sessionId });
    });

    const resolveRepoNameByLocalPath = (targetPath, sessionId) => {
        if (!targetPath) {
            return "";
        }

        const targetBase = path.basename(targetPath);
        const targetBaseVariants = new Set([targetBase]);
        if (targetBase.endsWith(".git")) {
            targetBaseVariants.add(targetBase.slice(0, -4));
        }
        const targetGitDashIndex = targetBase.indexOf(".git-");
        if (targetGitDashIndex > 0) {
            targetBaseVariants.add(targetBase.slice(0, targetGitDashIndex));
        }

        try {
            const repoConfig = (typeof loadRepoConfig === "function"
                ? loadRepoConfig(sessionId)
                : {}) || {};

            for (const [name, cfg] of Object.entries(repoConfig)) {
                if (cfg && cfg.gitRepoLocalPath) {
                    try {
                        const repoPathResolved = path.resolve(cfg.gitRepoLocalPath);
                        // Match when the target path is the repo path or is contained within the repo path.
                        if (repoPathResolved === targetPath) {
                            return name;
                        }
                        const normalizedRepoPath = repoPathResolved.endsWith(path.sep) ? repoPathResolved : repoPathResolved + path.sep;
                        if (targetPath.indexOf(normalizedRepoPath) === 0) {
                            return name;
                        }
                        const repoBase = path.basename(repoPathResolved);
                        const repoBaseVariants = new Set([repoBase]);
                        if (repoBase.endsWith(".git")) {
                            repoBaseVariants.add(repoBase.slice(0, -4));
                        }
                        for (const variant of targetBaseVariants) {
                            if (repoBaseVariants.has(variant)) {
                                return name;
                            }
                        }
                    } catch (_e) { /* ignore invalid paths */ }
                }
            }
        } catch (err) {
            console.error(
                `[ERROR] Failed to resolve repo configuration for git path '${targetPath}': ${err.message}`,
            );
        }

        return "";
    };

    app.get("/agent/project-meta", (req, res) => {
        const sessionId = resolveSessionId(req) || getSessionIdFromRequest(req);
        const directoryParamRaw = ((req.query.projectDir || req.query.repo_directory || "")
            .toString()
            .trim());

        if (!directoryParamRaw) {
            res.status(400).json({ error: "projectDir parameter is required." });
            return;
        }

        let resolvedProjectDir = directoryParamRaw;
        try {
            resolvedProjectDir = path.resolve(directoryParamRaw);
        } catch (_err) {
            resolvedProjectDir = directoryParamRaw;
        }

        let repoName = resolveRepoNameByLocalPath(resolvedProjectDir, sessionId) || "";
        let repoCfg = null;
        if (repoName) {
            try {
                repoCfg = loadSingleRepoConfig(repoName, sessionId);
            } catch (err) {
                console.warn(
                    `[WARN] Failed to load repository config for ${repoName}:`,
                    err && err.message ? err.message : err,
                );
                repoCfg = null;
            }
        }

        let repoLocalPath = "";
        if (repoCfg && typeof repoCfg.gitRepoLocalPath === "string" && repoCfg.gitRepoLocalPath.trim()) {
            repoLocalPath = repoCfg.gitRepoLocalPath.trim();
        }

        const candidatePaths = [];
        if (repoLocalPath) {
            candidatePaths.push(repoLocalPath);
        }
        if (resolvedProjectDir && (!repoLocalPath || path.resolve(repoLocalPath) !== resolvedProjectDir)) {
            candidatePaths.push(resolvedProjectDir);
        }

        let branchName = "";
        let branchSource = "";

        for (const candidate of candidatePaths) {
            if (!candidate) {
                continue;
            }
            try {
                const stats = fs.statSync(candidate);
                if (!stats.isDirectory()) {
                    continue;
                }
            } catch (_err) {
                continue;
            }

            try {
                const meta = getGitMetaData(candidate);
                if (meta && typeof meta.branchName === "string") {
                    const trimmedBranch = meta.branchName.trim();
                    if (trimmedBranch) {
                        branchName = trimmedBranch;
                        branchSource = candidate === repoLocalPath ? "git" : "git:project";
                        break;
                    }
                }
            } catch (err) {
                console.warn(
                    `[WARN] Failed to resolve git metadata for ${candidate}:`,
                    err && err.message ? err.message : err,
                );
            }
        }

        if (!branchName && repoCfg && typeof repoCfg.gitBranch === "string") {
            const configuredBranch = repoCfg.gitBranch.trim();
            if (configuredBranch) {
                branchName = configuredBranch;
                branchSource = "config";
            }
        }

        res.json({
            projectDir: directoryParamRaw,
            resolvedProjectDir,
            repoName,
            gitRepoLocalPath: repoLocalPath,
            isDemo: Boolean(repoCfg && repoCfg.isDemo),
            branchName,
            branchSource,
            repoConfigBranch: repoCfg && typeof repoCfg.gitBranch === "string"
                ? repoCfg.gitBranch.trim()
                : "",
        });
    });

    const pickDefaultChatNumber = (repoName, sessionId) => {
        if (!repoName) {
            return "";
        }

        let repoData;
        try {
            repoData = loadRepoJson(repoName, sessionId);
        } catch (error) {
            console.error(
                `[ERROR] Failed to load chats for repository '${repoName}': ${error.message}`,
            );
            return "";
        }

        if (!repoData || typeof repoData !== "object") {
            return "";
        }

        const normaliseTimestamp = (value) => {
            if (!value) {
                return null;
            }
            const parsed = Date.parse(value);
            return Number.isNaN(parsed) ? null : parsed;
        };

        const entries = Object.entries(repoData)
            .map(([chatKey, chatValue]) => {
                const number = Number.parseInt(chatKey, 10);
                if (!Number.isFinite(number)) {
                    return null;
                }
                const statusRaw = chatValue && typeof chatValue.status === "string"
                    ? chatValue.status.trim().toUpperCase()
                    : "";
                const updatedAt = normaliseTimestamp(chatValue?.updatedAt);
                const createdAt = normaliseTimestamp(chatValue?.createdAt);
                return {
                    number,
                    status: statusRaw,
                    updatedAt,
                    createdAt,
                };
            })
            .filter(Boolean);

        if (!entries.length) {
            return "";
        }

        const sortByRecency = (a, b) => {
            const timeA = Number.isFinite(a.updatedAt)
                ? a.updatedAt
                : Number.isFinite(a.createdAt)
                    ? a.createdAt
                    : 0;
            const timeB = Number.isFinite(b.updatedAt)
                ? b.updatedAt
                : Number.isFinite(b.createdAt)
                    ? b.createdAt
                    : 0;
            if (timeA !== timeB) {
                return timeB - timeA;
            }
            return a.number - b.number;
        };

        const selectByStatuses = (statuses) => {
            const filtered = entries.filter((entry) => statuses.includes(entry.status));
            if (!filtered.length) {
                return null;
            }
            filtered.sort(sortByRecency);
            return filtered[0];
        };

        const activeChat = selectByStatuses(["ACTIVE"]);
        if (activeChat) {
            return String(activeChat.number);
        }

        const preferredStatuses = ["", "INACTIVE", "PAUSED", "READY"];
        const preferredChat = selectByStatuses(preferredStatuses);
        if (preferredChat) {
            return String(preferredChat.number);
        }

        const nonArchived = entries.filter(
            (entry) => entry.status !== "ARCHIVED" && entry.status !== "ARCHIVED_CONTEXT",
        );
        if (nonArchived.length) {
            nonArchived.sort(sortByRecency);
            return String(nonArchived[0].number);
        }

        entries.sort(sortByRecency);
        return String(entries[0].number);
    };

    const buildEditorUrl = (repoName, chatNumber) => {
        const safeRepo = (repoName || "").toString().trim();
        const safeChat = (chatNumber || "").toString().trim();
        if (!safeRepo || !safeChat) {
            return "";
        }
        return `/${encodeURIComponent(safeRepo)}/chat/${encodeURIComponent(safeChat)}/editor`;
    };

    const resolveEditorTargetForProjectDir = (projectDir, sessionId) => {
        const rawDir = typeof projectDir === "string" ? projectDir.trim() : "";
        if (!rawDir) {
            return null;
        }

        let resolvedDir;
        try {
            resolvedDir = path.resolve(rawDir);
        } catch (error) {
            console.warn(
                `[WARN] Failed to resolve project directory '${rawDir}': ${error.message}`,
            );
            resolvedDir = rawDir;
        }

        // Attempt to locate a matching run by resolved project directory
        let runId = '';
        try {
            const runs = typeof loadCodexRuns === 'function' ? loadCodexRuns(sessionId) : [];
            if (Array.isArray(runs) && runs.length) {
                for (const candidateRun of runs) {
                    const candidateDir = (candidateRun && (candidateRun.requestedProjectDir || candidateRun.effectiveProjectDir || candidateRun.projectDir)) || '';
                    if (!candidateDir) continue;
                    try {
                        const resolvedCandidate = path.resolve(candidateDir);
                        if (resolvedCandidate === resolvedDir) { runId = candidateRun.id || ''; break; }
                    } catch (_e) { /* ignore */ }
                }
            }
        } catch (_e) { /* ignore */ }
        let repoName = resolveRepoNameByLocalPath(resolvedDir, sessionId);
        if (!repoName) {
            try {
                const repoConfig = (typeof loadRepoConfig === "function" ? loadRepoConfig(sessionId) : {}) || {};
                const candidateBase = path.basename(resolvedDir || rawDir || "");
                const baseVariants = new Set([candidateBase]);
                if (candidateBase.endsWith(".git")) {
                    baseVariants.add(candidateBase.slice(0, -4));
                }
                const gitDashIndex = candidateBase.indexOf(".git-");
                if (gitDashIndex > 0) {
                    baseVariants.add(candidateBase.slice(0, gitDashIndex));
                }
                for (const [name, cfg] of Object.entries(repoConfig)) {
                    if (!cfg || !cfg.gitRepoLocalPath) {
                        continue;
                    }
                    try {
                        const repoPathResolved = path.resolve(cfg.gitRepoLocalPath);
                        const repoBase = path.basename(repoPathResolved);
                        const repoBaseVariants = new Set([repoBase]);
                        if (repoBase.endsWith(".git")) {
                            repoBaseVariants.add(repoBase.slice(0, -4));
                        }
                        for (const variant of baseVariants) {
                            if (repoBaseVariants.has(variant)) {
                                repoName = name;
                                resolvedDir = repoPathResolved;
                                break;
                            }
                        }
                    } catch (_e) { /* ignore */ }
                    if (repoName) {
                        break;
                    }
                }
            } catch (_e) { /* ignore */ }
        }
        if (!repoName) {
            const sanitizeRepoName = (name, fallback = "repo") => {
                if (typeof name !== "string") {
                    return fallback;
                }
                const trimmed = name.trim();
                if (!trimmed) {
                    return fallback;
                }
                return trimmed.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 160) || fallback;
            };

            const normalizeRepoBase = (base) => {
                if (typeof base !== "string") {
                    return "";
                }
                let normalized = base.trim();
                if (normalized.endsWith(".git")) {
                    normalized = normalized.slice(0, -4);
                }
                const gitDashIndex = normalized.indexOf(".git-");
                if (gitDashIndex > 0) {
                    normalized = normalized.slice(0, gitDashIndex);
                }
                return normalized;
            };

            try {
                const stats = fs.statSync(resolvedDir);
                if (stats && stats.isDirectory()) {
                    const repoConfig = (typeof loadRepoConfig === "function" ? loadRepoConfig(sessionId) : {}) || {};
                    for (const [name, cfg] of Object.entries(repoConfig)) {
                        if (!cfg || !cfg.gitRepoLocalPath) {
                            continue;
                        }
                        try {
                            const repoPathResolved = path.resolve(cfg.gitRepoLocalPath);
                            const normalizedRepoPath = repoPathResolved.endsWith(path.sep)
                                ? repoPathResolved
                                : repoPathResolved + path.sep;
                            if (repoPathResolved === resolvedDir || resolvedDir.indexOf(normalizedRepoPath) === 0) {
                                repoName = name;
                                resolvedDir = repoPathResolved;
                                break;
                            }
                        } catch (_e) { /* ignore */ }
                        if (repoName) {
                            break;
                        }
                    }

                    if (!repoName) {
                        const baseName = normalizeRepoBase(path.basename(resolvedDir));
                        const baseCandidate = sanitizeRepoName(baseName || path.basename(resolvedDir) || "repo");
                        let candidateName = baseCandidate;
                        let suffix = 1;
                        while (repoConfig[candidateName]) {
                            const existingPath = repoConfig[candidateName]?.gitRepoLocalPath || "";
                            try {
                                if (existingPath && path.resolve(existingPath) === resolvedDir) {
                                    break;
                                }
                            } catch (_e) { /* ignore */ }
                            candidateName = `${baseCandidate}_${suffix}`;
                            suffix += 1;
                        }
                        repoConfig[candidateName] = {
                            gitRepoLocalPath: resolvedDir,
                            gitRepoURL: "",
                            gitBranch: "",
                            openAIAccount: "",
                        };
                        if (typeof saveRepoConfig === "function") {
                            saveRepoConfig(repoConfig, sessionId);
                        }
                        repoName = candidateName;
                    }
                }
            } catch (_err) { /* ignore */ }
        }
        if (!repoName) {
            return null;
        }

        let ensuredChatNumber = "";
        try {
            const repoData = loadRepoJson(repoName, sessionId);
            const chatKeys = Object.keys(repoData || {})
                .map((key) => Number.parseInt(key, 10))
                .filter((value) => Number.isFinite(value));
            if (!chatKeys.length) {
                const newChatNumber = 1;
                repoData[newChatNumber] = {
                    status: "ACTIVE",
                    agentInstructions: loadGlobalInstructions(),
                    attachedFiles: [],
                    chatHistory: [],
                    aiProvider: "openrouter",
                    aiModel: DEFAULT_AIMODEL,
                    pushAfterCommit: true,
                };
                saveRepoJson(repoName, repoData, sessionId);
                ensuredChatNumber = String(newChatNumber);
            }
        } catch (_err) { /* ignore */ }

        const chatNumber = pickDefaultChatNumber(repoName, sessionId);
        if (!chatNumber) {
            return {
                repoName,
                chatNumber: ensuredChatNumber || "",
                projectDir: resolvedDir,
                url: "",
            };
        }

        let urlPath = buildEditorUrl(repoName, chatNumber);
        const qp = [];
        qp.push('repo_directory=' + encodeURIComponent(resolvedDir));
        if (runId) qp.push('run_id=' + encodeURIComponent(runId));
        const fullUrl = urlPath + (qp.length ? ('?' + qp.join('&')) : '');
        return {
            repoName,
            chatNumber,
            projectDir: resolvedDir,
            url: fullUrl,
        };
    };

    const parseIntegerParam = (value, defaultValue, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) => {
        if (typeof value === "undefined" || value === null || value === "") {
            return defaultValue;
        }

        const numeric = Number(value);
        if (!Number.isFinite(numeric)) {
            return defaultValue;
        }

        const normalized = Math.floor(numeric);
        if (normalized < min) {
            return min;
        }
        if (normalized > max) {
            return max;
        }
        return normalized;
    };

    const parseBooleanParam = (value, defaultValue = false) => {
        if (typeof value === "undefined" || value === null) {
            return defaultValue;
        }

        const normalized = String(value).trim().toLowerCase();
        if (!normalized) {
            return defaultValue;
        }

        if (["1", "true", "yes", "on"].includes(normalized)) {
            return true;
        }
        if (["0", "false", "no", "off"].includes(normalized)) {
            return false;
        }
        return defaultValue;
    };

    const buildGitCommitSlice = (repoPath, offset, limit) => {
        const effectiveLimit = Math.max(1, Math.min(limit || DEFAULT_GIT_LOG_LIMIT, MAX_GIT_LOG_LIMIT));
        const effectiveOffset = Math.max(0, offset || 0);

        const rawCommits = getGitCommits(repoPath, {
            limit: effectiveLimit + 1,
            skip: effectiveOffset,
        });

        const commits = Array.isArray(rawCommits) ? rawCommits : [];
        const hasExtra = commits.length > effectiveLimit;
        const normalizedCommits = hasExtra ? commits.slice(0, effectiveLimit) : commits;

        return {
            commits: normalizedCommits,
            hasMore: hasExtra,
            limit: effectiveLimit,
            offset: effectiveOffset,
            nextOffset: effectiveOffset + normalizedCommits.length,
        };
    };

    app.get("/agent/git-log", async (req, res) => {

        // TIMING: measure sub-operation durations
        const __timing_entries = [];
        const __timing_start = Date.now();
        const sessionId = resolveSessionId(req) || getSessionIdFromRequest(req);
        const requestedProjectDir = (req.query.projectDir || "").toString().trim();
        const effectiveProjectDir = requestedProjectDir || defaultCodexProjectDir || "";
        const resolvedProjectDir = effectiveProjectDir ? path.resolve(effectiveProjectDir) : "";
        let errorMessage = "";
        let gitCommits = [];
        let gitCommitGraph = [];
        let gitMeta = null;
        let repoName = "";
        let hasMoreCommits = false;
        let commitLimit = DEFAULT_GIT_LOG_LIMIT;
        let commitOffset = 0;
        let commitNextOffset = 0;

        if (!effectiveProjectDir) {
            errorMessage = "Project directory is required.";
        } else {
            try {
                const stats = fs.statSync(resolvedProjectDir);
                if (!stats.isDirectory()) {
                    errorMessage = `Provided project directory is not a directory: ${effectiveProjectDir}`;
                }
            } catch (err) {
                errorMessage = `Project directory not found: ${effectiveProjectDir}`;
            }
        }

        if (!errorMessage) {
            const limitParam = parseIntegerParam(req.query.limit, DEFAULT_GIT_LOG_LIMIT, {
                min: 1,
                max: MAX_GIT_LOG_LIMIT,
            });
            const offsetParam = parseIntegerParam(req.query.offset, 0, { min: 0 });
            const pullRequested = parseBooleanParam(req.query.pull, true);
            const autoPullRequested = parseBooleanParam(req.query.autoPull, pullRequested);
            const shouldAutoPull = pullRequested && autoPullRequested;

            if (shouldAutoPull && typeof gitUpdatePull === "function") {
                try {
                    const __t0_gitUpdatePull = Date.now();
                    await gitUpdatePull(resolvedProjectDir);
                    __timing_entries.push(`gitUpdatePull:${Date.now()-__t0_gitUpdatePull}ms`);
                } catch (pullErr) {
                    console.warn(`[WARN] Failed to git pull for ${resolvedProjectDir}:`, pullErr);
                }
            }

            try {
                const __t0_buildGitCommitSlice = Date.now();
                const slice = buildGitCommitSlice(resolvedProjectDir, offsetParam, limitParam);
                __timing_entries.push(`buildGitCommitSlice:${Date.now()-__t0_buildGitCommitSlice}ms`);
                gitCommits = slice.commits;
                hasMoreCommits = slice.hasMore;
                commitLimit = slice.limit;
                commitOffset = slice.offset;
                commitNextOffset = slice.nextOffset;
            } catch (err) {
                console.error(`[ERROR] Failed to load git commits for ${resolvedProjectDir}:`, err);
                gitCommits = [];
                hasMoreCommits = false;
                commitLimit = limitParam;
                commitOffset = offsetParam;
                commitNextOffset = offsetParam;
            }

            try {
                const baseGraphLimit = Math.max(commitLimit || DEFAULT_GIT_LOG_LIMIT, DEFAULT_GIT_LOG_LIMIT);
                const commitGraphLimit = Math.max(commitNextOffset || 0, baseGraphLimit) + baseGraphLimit;
                const __t0_getGitCommitGraph = Date.now();
                const commitGraph = getGitCommitGraph(resolvedProjectDir, {
                    limit: commitGraphLimit,
                });
                __timing_entries.push(`getGitCommitGraph:${Date.now()-__t0_getGitCommitGraph}ms`);
                gitCommitGraph = Array.isArray(commitGraph) ? commitGraph : [];
            } catch (err) {
                console.error(`[ERROR] Failed to load git commit graph for ${resolvedProjectDir}:`, err);
                gitCommitGraph = [];
            }

            try {
                const __t0_getGitMetaData = Date.now();
                gitMeta = getGitMetaData(resolvedProjectDir);
                __timing_entries.push(`getGitMetaData:${Date.now()-__t0_getGitMetaData}ms`);
            } catch (err) {
                console.error(`[ERROR] Failed to load git metadata for ${resolvedProjectDir}:`, err);
                gitMeta = null;
            }

            repoName = resolveRepoNameByLocalPath(resolvedProjectDir, sessionId);
        }

        console.log(`[TIMING] /agent/git-log ${resolvedProjectDir} timings: ${__timing_entries.join(', ')} total:${Date.now()-__timing_start}ms`);
        res.render("codex_git_log", {
            defaultProjectDir: defaultCodexProjectDir,
            requestedProjectDir,
            effectiveProjectDir,
            resolvedProjectDir,
            gitCommits,
            gitCommitGraph,
            gitMeta,
            repoName,
            errorMessage,
            sessionId,
            hasMoreCommits,
            commitLimit,
            commitOffset,
            commitNextOffset,
        });
    });

    app.get("/agent/git-log/commits.json", (req, res) => {
        const sessionId = resolveSessionId(req) || getSessionIdFromRequest(req);
        const requestedProjectDir = (req.query.projectDir || "").toString().trim();
        const effectiveProjectDir = requestedProjectDir || defaultCodexProjectDir || "";

        if (!effectiveProjectDir) {
            res.status(400).json({ error: "Project directory is required." });
            return;
        }

        let resolvedProjectDir;
        try {
            resolvedProjectDir = path.resolve(effectiveProjectDir);
        } catch (_err) {
            resolvedProjectDir = effectiveProjectDir;
        }

        try {
            const stats = fs.statSync(resolvedProjectDir);
            if (!stats.isDirectory()) {
                res.status(400).json({
                    error: `Provided project directory is not a directory: ${effectiveProjectDir}`,
                });
                return;
            }
        } catch (err) {
            res.status(404).json({ error: `Project directory not found: ${effectiveProjectDir}` });
            return;
        }

        const limitParam = parseIntegerParam(req.query.limit, DEFAULT_GIT_LOG_LIMIT, {
            min: 1,
            max: MAX_GIT_LOG_LIMIT,
        });
        const offsetParam = parseIntegerParam(req.query.offset, 0, { min: 0 });

        try {
            const __t0_buildGitCommitSlice = Date.now();
                const slice = buildGitCommitSlice(resolvedProjectDir, offsetParam, limitParam);
                __timing_entries.push(`buildGitCommitSlice:${Date.now()-__t0_buildGitCommitSlice}ms`);
            const repoName = resolveRepoNameByLocalPath(resolvedProjectDir, sessionId) || "";

            res.json({
                commits: slice.commits,
                hasMore: slice.hasMore,
                limit: slice.limit,
                offset: slice.offset,
                nextOffset: slice.nextOffset,
                repoName,
            });
        } catch (err) {
            console.error(`[ERROR] Failed to load git commits for ${resolvedProjectDir}:`, err);
            res.status(500).json({ error: "Failed to load git commits." });
        }
    });

    app.get("/agent/resolve-editor-target", (req, res) => {
        const sessionId = resolveSessionId(req) || getSessionIdFromRequest(req);
        const directoryParam = ((req.query.repo_directory || req.query.projectDir || "")
            .toString()
            .trim());

        if (!directoryParam) {
            res.status(400).json({ error: "Project directory is required." });
            return;
        }

        const target = resolveEditorTargetForProjectDir(directoryParam, sessionId);
        if (!target || !target.repoName) {
            res.status(404).json({
                error: `Repository not registered for directory: ${directoryParam}`,
            });
            return;
        }

        if (!target.chatNumber) {
            res.status(404).json({
                error: `No chats available for repository '${target.repoName}'.`,
            });
            return;
        }

        res.json({ editorTarget: target });
    });

    app.get("/agent/git-tree", async (req, res) => {

        // TIMING: measure sub-operation durations
        const __timing_entries = [];
        const __timing_start = Date.now();
        const sessionId = resolveSessionId(req) || getSessionIdFromRequest(req);
        const requestedProjectDir = (req.query.projectDir || "").toString().trim();
        const effectiveProjectDir = requestedProjectDir || defaultCodexProjectDir || "";
        const resolvedProjectDir = effectiveProjectDir ? path.resolve(effectiveProjectDir) : "";

        let errorMessage = "";
        let gitCommits = [];
        let gitCommitGraph = [];
        let gitMeta = null;
        let repoName = "";
        let hasMoreCommits = false;
        let commitLimit = DEFAULT_GIT_LOG_LIMIT;
        let commitOffset = 0;
        let commitNextOffset = 0;

        if (!effectiveProjectDir) {
            errorMessage = "Project directory is required.";
        } else {
            try {
                const stats = fs.statSync(resolvedProjectDir);
                if (!stats.isDirectory()) {
                    errorMessage = `Provided project directory is not a directory: ${effectiveProjectDir}`;
                }
            } catch (err) {
                errorMessage = `Project directory not found: ${effectiveProjectDir}`;
            }
        }

        if (!errorMessage) {
            const limitParam = parseIntegerParam(req.query.limit, DEFAULT_GIT_LOG_LIMIT, {
                min: 1,
                max: MAX_GIT_LOG_LIMIT,
            });
            const offsetParam = parseIntegerParam(req.query.offset, 0, { min: 0 });

            try {
                const __t0_buildGitCommitSlice = Date.now();
                const slice = buildGitCommitSlice(resolvedProjectDir, offsetParam, limitParam);
                __timing_entries.push(`buildGitCommitSlice:${Date.now()-__t0_buildGitCommitSlice}ms`);
                gitCommits = slice.commits;
                hasMoreCommits = slice.hasMore;
                commitLimit = slice.limit;
                commitOffset = slice.offset;
                commitNextOffset = slice.nextOffset;
            } catch (err) {
                console.error(`[ERROR] Failed to load git commits for ${resolvedProjectDir}:`, err);
                gitCommits = [];
                hasMoreCommits = false;
                commitLimit = limitParam;
                commitOffset = offsetParam;
                commitNextOffset = offsetParam;
            }

            try {
                const baseGraphLimit = Math.max(commitLimit || DEFAULT_GIT_LOG_LIMIT, DEFAULT_GIT_LOG_LIMIT);
                const commitGraphLimit = Math.max(commitNextOffset || 0, baseGraphLimit) + baseGraphLimit;
                const __t0_getGitCommitGraph = Date.now();
                const commitGraph = getGitCommitGraph(resolvedProjectDir, {
                    limit: commitGraphLimit,
                });
                __timing_entries.push(`getGitCommitGraph:${Date.now()-__t0_getGitCommitGraph}ms`);
                gitCommitGraph = Array.isArray(commitGraph) ? commitGraph : [];
            } catch (err) {
                console.error(`[ERROR] Failed to load git commit graph for ${resolvedProjectDir}:`, err);
                gitCommitGraph = [];
            }

            try {
                const __t0_getGitMetaData = Date.now();
                gitMeta = getGitMetaData(resolvedProjectDir);
                __timing_entries.push(`getGitMetaData:${Date.now()-__t0_getGitMetaData}ms`);
            } catch (err) {
                console.error(`[ERROR] Failed to load git metadata for ${resolvedProjectDir}:`, err);
                gitMeta = null;
            }

            repoName = resolveRepoNameByLocalPath(resolvedProjectDir, sessionId);
        }

        // Determine if this repository has any configured git remotes.
        let hasRemotes = false;
        try {
            const remotesRaw = execSync('git remote', { cwd: resolvedProjectDir, stdio: ['pipe','pipe','ignore'] })
                .toString();
            const remotes = remotesRaw.split(/\r?\n/).map(r => r.trim()).filter(Boolean);
            hasRemotes = remotes.length > 0;
        } catch (_e) {
            hasRemotes = false;
        }

        console.log(`[TIMING] /agent/git-tree ${resolvedProjectDir} timings: ${__timing_entries.join(', ')} total:${Date.now()-__timing_start}ms`);
        res.render("codex_git_tree", {
            defaultProjectDir: defaultCodexProjectDir,
            requestedProjectDir,
            effectiveProjectDir,
            resolvedProjectDir,
            gitCommits,
            gitCommitGraph,
            gitMeta,
            repoName,
            errorMessage,
            sessionId,
            hasRemotes,
            hasMoreCommits,
            commitLimit,
            commitOffset,
            commitNextOffset,
        });
    });

    app.get("/agent/git-tree/commit", (req, res) => {

        // TIMING: measure sub-operation durations
        const __timing_entries = [];
        const __timing_start = Date.now();
        const requestedProjectDir = (req.query.projectDir || "").toString().trim();
        const effectiveProjectDir = requestedProjectDir || defaultCodexProjectDir || "";
        const resolvedProjectDir = effectiveProjectDir ? path.resolve(effectiveProjectDir) : "";
        const commitRefInput = (req.query.hash || "").toString();

        if (!effectiveProjectDir) {
            return res.status(400).json({ error: "Project directory is required." });
        }

        try {
            const stats = fs.statSync(resolvedProjectDir);
            if (!stats.isDirectory()) {
                return res.status(400).json({ error: `Provided project directory is not a directory: ${effectiveProjectDir}` });
            }
        } catch (err) {
            return res.status(400).json({ error: `Project directory not found: ${effectiveProjectDir}` });
        }

        const sanitizeRevision = (value) => {
            const trimmed = (value || "").toString().trim();
            if (!trimmed) {
                return { value: "", error: "Commit hash is required." };
            }

            const match = trimmed.match(/\((?:[0-9a-fA-F]{6,40})\)$/);
            if (match) {
                const inner = match[0].slice(1, -1);
                return { value: inner, error: "" };
            }

            if (!/^[0-9A-Za-z._^~/:-]+$/.test(trimmed)) {
                return { value: "", error: "Invalid commit reference." };
            }

            return { value: trimmed, error: "" };
        };

        const sanitized = sanitizeRevision(commitRefInput);
        if (sanitized.error) {
            return res.status(400).json({ error: sanitized.error });
        }

        const commitRef = sanitized.value;

        try {
            const __t0_git_show_meta = Date.now();
            const metaRaw = execSync(
                `git show --no-color --no-patch --date=iso --pretty=format:%H%n%P%n%an%n%ad%n%s%n%b ${commitRef}`,
                {
                    cwd: resolvedProjectDir,
                    maxBuffer: 1024 * 1024 * 4,
                }
            )
                .toString()
                .replace(/\r/g, "");
            __timing_entries.push(`git_show_meta:${Date.now()-__t0_git_show_meta}ms`);

            const metaLines = metaRaw.split("\n");
            const hash = (metaLines.shift() || "").trim();
            const parentsLine = (metaLines.shift() || "").trim();
            const author = (metaLines.shift() || "").trim();
            const date = (metaLines.shift() || "").trim();
            const subject = (metaLines.shift() || "").trim();
            const body = metaLines.join("\n").trim();

            const __t0_git_show_numstat = Date.now();
            const numstatRaw = execSync(`git show --no-color --numstat --format="" ${commitRef}`, {
                cwd: resolvedProjectDir,
                maxBuffer: 1024 * 1024 * 2,
            })
                .toString()
                .replace(/\r/g, "")
                .trim();
            __timing_entries.push(`git_show_numstat:${Date.now()-__t0_git_show_numstat}ms`);

            const files = numstatRaw
                ? numstatRaw.split("\n").map((line) => {
                      if (!line.trim()) {
                          return null;
                      }

                      const parts = line.split("\t");
                      if (parts.length < 3) {
                          return null;
                      }

                      const [additionsRaw, deletionsRaw, ...pathParts] = parts;
                      const additions = additionsRaw === "-" ? null : Number(additionsRaw) || 0;
                      const deletions = deletionsRaw === "-" ? null : Number(deletionsRaw) || 0;
                      const filePath = pathParts.join("\t");

                      return {
                          path: filePath,
                          additions,
                          deletions,
                          isBinary: additionsRaw === "-" || deletionsRaw === "-",
                      };
                  })
                : [];

            const __t0_git_show_diff = Date.now();
            const diffText = execSync(`git show --no-color --format= --patch ${commitRef}`, {
                cwd: resolvedProjectDir,
                maxBuffer: 1024 * 1024 * 10,
            })
                .toString()
                .replace(/\r/g, "");
            __timing_entries.push(`git_show_diff:${Date.now()-__t0_git_show_diff}ms`);

            const structuredDiff = parseUnifiedDiff(diffText);

            console.log(`[TIMING] /agent/git-tree/commit ${resolvedProjectDir} ${commitRef} timings: ${__timing_entries.join(', ')} total:${Date.now()-__timing_start}ms`);
            return res.json({
                commit: {
                    hash,
                    parents: parentsLine ? parentsLine.split(/\s+/).filter(Boolean) : [],
                    author,
                    date,
                    subject,
                    body,
                },
                files: Array.isArray(files) ? files.filter(Boolean) : [],
                diffText,
                diff: structuredDiff,
            });
        } catch (err) {
            console.error(`[ERROR] Failed to load commit ${commitRef} in ${resolvedProjectDir}:`, err);
            return res.status(500).json({ error: `Failed to load commit details for ${commitRef}.` });
        }
    });

    function parseUnifiedDiff(diffText) {
        if (!diffText || !diffText.trim()) {
            return [];
        }

        const files = [];
        const lines = diffText.replace(/\r\n/g, "\n").split("\n");

        let currentFile = null;
        let currentHunk = null;
        let leftLine = 0;
        let rightLine = 0;
        let removalBuffer = [];

        const flushRemovalBuffer = () => {
            if (!currentHunk || !removalBuffer.length) {
                return;
            }
            for (const removed of removalBuffer) {
                currentHunk.rows.push({
                    type: "remove",
                    leftNumber: removed.leftNumber,
                    leftContent: removed.leftContent,
                    rightNumber: "",
                    rightContent: "",
                });
            }
            removalBuffer = [];
        };

        for (const rawLine of lines) {
            const line = rawLine;

            if (line.startsWith("diff --git ")) {
                flushRemovalBuffer();
                currentHunk = null;

                const parts = line.split(" ");
                const oldName = parts[2] ? parts[2].replace(/^a\//, "") : "";
                const newName = parts[3] ? parts[3].replace(/^b\//, "") : "";

                currentFile = {
                    header: line,
                    oldPath: oldName,
                    newPath: newName,
                    hunks: [],
                    isBinary: false,
                    binaryMessage: "",
                };
                files.push(currentFile);
                continue;
            }

            if (!currentFile) {
                continue;
            }

            if (line.startsWith("Binary files ")) {
                currentFile.isBinary = true;
                currentFile.binaryMessage = line;
                continue;
            }

            if (line.startsWith("--- ")) {
                const value = line.slice(4).trim();
                currentFile.oldPath = value === "/dev/null" ? "" : value.replace(/^a\//, "");
                continue;
            }

            if (line.startsWith("+++ ")) {
                const value = line.slice(4).trim();
                currentFile.newPath = value === "/dev/null" ? "" : value.replace(/^b\//, "");
                continue;
            }

            if (line.startsWith("@@")) {
                flushRemovalBuffer();
                const match = /@@ -(?<leftStart>\d+)(?:,(?<leftCount>\d+))? \+(?<rightStart>\d+)(?:,(?<rightCount>\d+))? @@/.exec(line);
                const leftStart = match && match.groups && match.groups.leftStart ? parseInt(match.groups.leftStart, 10) : 0;
                const rightStart = match && match.groups && match.groups.rightStart ? parseInt(match.groups.rightStart, 10) : 0;
                leftLine = Number.isNaN(leftStart) ? 0 : leftStart;
                rightLine = Number.isNaN(rightStart) ? 0 : rightStart;
                currentHunk = {
                    header: line,
                    rows: [],
                };
                currentFile.hunks.push(currentHunk);
                removalBuffer = [];
                continue;
            }

            if (!currentHunk) {
                continue;
            }

            if (line.startsWith("-")) {
                removalBuffer.push({
                    leftNumber: leftLine++,
                    leftContent: line.slice(1),
                });
                continue;
            }

            if (line.startsWith("+")) {
                const row = {
                    type: removalBuffer.length ? "modify" : "add",
                    leftNumber: "",
                    leftContent: "",
                    rightNumber: rightLine++,
                    rightContent: line.slice(1),
                };

                if (removalBuffer.length) {
                    const removed = removalBuffer.shift();
                    row.leftNumber = removed.leftNumber;
                    row.leftContent = removed.leftContent;
                }

                currentHunk.rows.push(row);
                continue;
            }

            if (line.startsWith(" ")) {
                flushRemovalBuffer();
                const content = line.slice(1);
                currentHunk.rows.push({
                    type: "context",
                    leftNumber: leftLine++,
                    leftContent: content,
                    rightNumber: rightLine++,
                    rightContent: content,
                });
                continue;
            }

            if (line.startsWith("\\")) {
                currentHunk.rows.push({
                    type: "meta",
                    leftNumber: "",
                    leftContent: "",
                    rightNumber: "",
                    rightContent: "",
                    metaContent: line,
                });
                continue;
            }
        }

        flushRemovalBuffer();
        return files;
    }

    /* ---------- Root ---------- */
    app.get("/", (req, res) => {
        let sessionId = resolveSessionId(req);
        let defaultRepoConfig = loadSingleRepoConfig(NEW_SESSION_REPO_NAME, sessionId);
        let defaultRepoPath = defaultRepoConfig?.gitRepoLocalPath;

        if (!defaultRepoPath || !fs.existsSync(defaultRepoPath)) {
            const freshSessionId = randomUUID();
            sessionId = freshSessionId;

            try {
                const hostname = normalizeHostname(req);
                const cookie = buildSessionCookie(freshSessionId, hostname);
                res.append("Set-Cookie", cookie);
                req.sessionId = freshSessionId;
                res.locals.sessionId = freshSessionId;
            } catch (error) {
                console.error(`Failed to issue session cookie for new session: ${error?.message || error}`);
            }

            try {
                ensureSessionDefaultRepo(freshSessionId);
            } catch (error) {
                console.error(`Failed to initialize default repo for new session: ${error?.message || error}`);
            }

            defaultRepoConfig = loadSingleRepoConfig(NEW_SESSION_REPO_NAME, freshSessionId);
            defaultRepoPath = defaultRepoConfig?.gitRepoLocalPath;
        }

        if (defaultRepoPath && fs.existsSync(defaultRepoPath)) {
            const params = new URLSearchParams({
                repo_directory: defaultRepoPath,
                repo_name: NEW_SESSION_REPO_NAME,
            });
            res.redirect(`/agent?${params.toString()}`);
            return;
        }

        res.redirect("/repositories");
    });

    /* ---------- Global instructions ---------- */
    app.get("/global_instructions", (_req, res) => {
        console.log("[DEBUG] GET /global_instructions => calling loadGlobalInstructions...");
        const currentGlobal = loadGlobalInstructions();
        console.log(`[DEBUG] GET /global_instructions => instructions length: ${currentGlobal.length}`);
        res.render("global_instructions", { currentGlobal });
    });

    /* ---------- File summarizer ---------- */
    app.get("/filesummarizer", (_req, res) => {
        res.sendFile(path.join(PROJECT_ROOT, "public", "filesummarizer.html"));
    });

    app.get("/file_summarizer/models", (_req, res) => {
        // Restrict available models to the OpenAI "gpt-5" series only.
        // We allow both `openai/gpt-5*` and `openrouter/openai/gpt-5*` entries.
        const rawProviders = Object.fromEntries(
            Object.entries(AIModels || {}).map(([provider, models]) => [
                provider,
                Array.isArray(models)
                    ? models.map((model) => getModelId(model)).filter(Boolean)
                    : [],
            ])
        );

        const filteredProviders = {};
        for (const [provider, models] of Object.entries(rawProviders)) {
            filteredProviders[provider] = (models || []).filter((m) => {
                if (!m || typeof m !== 'string') return false;
                const lower = m.toLowerCase();
                const allowedPrefixes = [
                    'gpt-5',
                    'gpt-5-',
                    'openai/gpt-5',
                    'openrouter/openai/gpt-5',
                ];

                return (
                    allowedPrefixes.some((prefix) => lower.startsWith(prefix)) ||
                    lower.includes('gpt-5')
                );
            });
        }

        // Ensure default AI model (if configured) is present under openrouter.
        if (DEFAULT_AIMODEL) {
            if (!filteredProviders.openrouter) {
                filteredProviders.openrouter = [];
            }
            if (!filteredProviders.openrouter.includes(DEFAULT_AIMODEL)) {
                // Only add if it matches the gpt-5 filter
                const dm = (DEFAULT_AIMODEL || '').toLowerCase();
                if (dm.includes('gpt-5')) {
                    filteredProviders.openrouter.push(DEFAULT_AIMODEL);
                }
            }
        }

        const providerKeys = Object.keys(filteredProviders);
        const defaultProvider = providerKeys.includes("openrouter")
            ? "openrouter"
            : providerKeys[0] || "";

        res.json({
            providers: filteredProviders,
            defaultProvider,
            defaultModel: (DEFAULT_AIMODEL && DEFAULT_AIMODEL.toLowerCase().includes('gpt-5')) ? DEFAULT_AIMODEL : "",
        });
    });

    app.get("/agent/model-only/models", (req, res) => {
        const showPlusModels = parseBooleanFlag(process.env.PLUS_MODELS_VISIBLE);
        const allModels = loadModelOnlyModels({ includePlus: true });
        const models = showPlusModels
            ? allModels
            : allModels.filter((model) => !model.plus_model);
        const openRouterLookup = normaliseModelList(
            AIModels?.openrouter || [],
            AIModelContextLimits?.openrouter || {},
        ).reduce((acc, model) => {
            acc[model.id] = model;
            return acc;
        }, {});
        const modelEntries = SHOW_MODEL_ONLY_COSTS
            ? models
            : models.map((model) => (model ? { ...model, pricing: null } : model));
        const enabledModelIds = new Set(
            modelEntries.filter((model) => model && !model.disabled).map((model) => model.id),
        );
        const disabledModelIds = new Set(
            modelEntries
                .filter((model) => model && model.disabled && !enabledModelIds.has(model.id))
                .map((model) => model.id),
        );
        const providerModels = {
            openrouter: modelEntries,
        };
        const defaultProvider = "openrouter";
        const sessionId = resolveSessionId(req) || getSessionIdFromRequest(req);
        const resolvedDefaultModel = resolveDefaultCodexModel(sessionId);
        if (resolvedDefaultModel) {
            const plusModelIds = new Set(
                allModels.filter((model) => model && model.plus_model).map((model) => model.id),
            );
            const hasDefault = providerModels.openrouter.some((model) => model && model.id === resolvedDefaultModel);
            if (!hasDefault && !disabledModelIds.has(resolvedDefaultModel)) {
                if (showPlusModels || !plusModelIds.has(resolvedDefaultModel)) {
                    const fallbackModel = openRouterLookup[resolvedDefaultModel];
                    providerModels.openrouter.push({
                        id: resolvedDefaultModel,
                        label: resolvedDefaultModel,
                        max_tokens: Number.isFinite(fallbackModel?.max_tokens) ? fallbackModel.max_tokens : null,
                        contextLimitLabel: formatTokenLimit(fallbackModel?.max_tokens),
                    });
                }
            }
        }

        res.json({
            providers: providerModels,
            defaultProvider,
            defaultModel: disabledModelIds.has(resolvedDefaultModel) ? "" : resolvedDefaultModel,
        });
    });

    const isOpenRouterRateLimitsEnabled = () => {
        const flag = (process.env.OPENROUTER_RATE_LIMITS_PAGE_ENABLED || "").toLowerCase();
        return flag === "1" || flag === "true" || flag === "yes";
    };

    /* ---------- OpenRouter transactions ---------- */
    app.get("/openrouter/transactions", (_req, res) => {
        if (!isOpenRouterRateLimitsEnabled()) {
            res.status(404).send("Not found");
            return;
        }
        const transactions = loadOpenRouterTransactions();

        const summary = transactions.reduce(
            (acc, tx) => {
                acc.promptTokens += tx.promptTokens;
                acc.completionTokens += tx.completionTokens;
                acc.reasoningTokens += tx.reasoningTokens || 0;
                acc.totalTokens += tx.totalTokens;
                return acc;
            },
            {
                promptTokens: 0,
                completionTokens: 0,
                reasoningTokens: 0,
                totalTokens: 0,
            },
        );

        res.render("openrouter_transactions", {
            transactions,
            summary,
            lastUpdated: transactions[0]?.displayTimestamp || null,
        });
    });

    app.get("/openrouter/rate-limits", (_req, res) => {
        if (!isOpenRouterRateLimitsEnabled()) {
            res.status(404).send("Not found");
            return;
        }
        res.render("openrouter_rate_limits");
    });

    app.post("/openrouter/rate-limits/fetch", async (_req, res) => {
        if (!isOpenRouterRateLimitsEnabled()) {
            res.status(404).json({
                success: false,
                error: "Rate limit page disabled.",
            });
            return;
        }
        const apiKey = process.env.OPENROUTER_API_KEY;
        if (!apiKey) {
            res.status(400).json({
                success: false,
                error: "Set OPENROUTER_API_KEY to fetch rate limits.",
            });
            return;
        }

        const refererHeader =
            process.env.OPENROUTER_HTTP_REFERER
            || process.env.HTTP_REFERER
            || "https://alfe.sh";
        const titleHeader =
            process.env.OPENROUTER_APP_TITLE
            || process.env.X_TITLE
            || "Alfe AI";

        const keyUrl = "https://openrouter.ai/api/v1/key";

        try {
            const response = await ensureFetch(keyUrl, {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    Accept: "application/json",
                    "HTTP-Referer": refererHeader,
                    "X-Title": titleHeader,
                },
            });

            if (!response.ok) {
                const responseText = await response.text().catch(() => "");
                res.status(response.status).json({
                    success: false,
                    error: responseText || response.statusText,
                    status: response.status,
                });
                return;
            }

            const payload = await response.json();
            res.json({ success: true, payload });
        } catch (err) {
            res.status(500).json({
                success: false,
                error: err instanceof Error ? err.message : "Failed to fetch rate limits.",
            });
        }
    });

    app.post("/openrouter/transactions/fetch", async (_req, res) => {
        const provisioningKey = process.env.OPENROUTER_PROVISIONING_KEY;
        if (!provisioningKey) {
            res.status(400).json({
                success: false,
                error: "Set OPENROUTER_PROVISIONING_KEY (provisioning key) to use /openrouter/transactions/fetch.",
            });
            return;
        }

        const refererHeader =
            process.env.OPENROUTER_HTTP_REFERER
            || process.env.HTTP_REFERER
            || "https://alfe.sh";
        const titleHeader =
            process.env.OPENROUTER_APP_TITLE
            || process.env.X_TITLE
            || "Alfe AI";

        const activityUrl = "https://openrouter.ai/api/v1/activity";

        try {
            const response = await ensureFetch(activityUrl, {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${provisioningKey}`,
                    Accept: "application/json",
                    "HTTP-Referer": refererHeader,
                    "X-Title": titleHeader,
                },
            });

            if (!response.ok) {
                const responseText = await response.text().catch(() => "");
                const errorMessage = responseText
                    ? `OpenRouter responded with ${response.status}: ${responseText}`
                    : `OpenRouter responded with ${response.status}`;
                throw new Error(errorMessage);
            }

            const payload = await response.json();
            const activityRows = extractTransactionsFromPayload(payload);
            if (activityRows === null) {
                throw new Error("Unexpected OpenRouter response payload format.");
            }

            const normalised = activityRows
                .map((entry) => normaliseApiOpenRouterEntry(entry))
                .filter((entry) => entry !== null)
                .sort((a, b) => {
                    if (a.timestampMs !== null && b.timestampMs !== null) {
                        return b.timestampMs - a.timestampMs;
                    }
                    if (a.timestampMs !== null) return -1;
                    if (b.timestampMs !== null) return 1;
                    return 0;
                });

            const recordsToSave = normalised.map((entry) => entry.record);

            const persisted = saveOpenRouterTransactions(recordsToSave);
            if (!persisted) {
                throw new Error("Failed to persist fetched OpenRouter transactions to disk.");
            }

            res.json({
                success: true,
                count: recordsToSave.length,
                lastUpdated: recordsToSave[0]?.displayTimestamp || null,
            });
        } catch (err) {
            console.error("[ERROR] Failed to fetch OpenRouter transactions:", err);
            res.status(500).json({
                success: false,
                error:
                    err && typeof err.message === "string" && err.message.trim()
                        ? err.message
                        : "Failed to fetch OpenRouter transactions.",
            });
        }
    });

    app.post("/openrouter/transactions/delete", (_req, res) => {
        const success = saveOpenRouterTransactions([]);

        if (!success) {
            res.status(500).json({ success: false, error: "Failed to clear transactions." });
            return;
        }

        res.json({ success: true });
    });

    /* ---------- Sterling storage overview ---------- */
    app.get("/sterling/storage", (req, res) => {
        const storageSummary = collectSterlingStorageSummary();
        const deletedDir = typeof req.query.deleted === "string" ? req.query.deleted : "";
        const errorMessage = typeof req.query.error === "string" ? req.query.error : "";

        res.render("sterling_storage", {
            storageRoot: storageSummary.rootPath,
            rootExists: storageSummary.rootExists,
            usingFallback: storageSummary.usingFallback,
            storageError: storageSummary.error,
            directories: storageSummary.directories,
            totalSizeBytes: storageSummary.totalSizeBytes,
            totalSizeHuman: formatBytes(storageSummary.totalSizeBytes),
            deletedDir,
            errorMessage,
        });
    });

    app.post("/sterling/storage/delete", (req, res) => {
        const directoryNameRaw =
            req && req.body && typeof req.body.directory === "string" ? req.body.directory.trim() : "";

        if (!directoryNameRaw) {
            res.redirect("/sterling/storage?error=" + encodeURIComponent("No directory selected for deletion."));
            return;
        }

        const directoryName = path.basename(directoryNameRaw);
        if (directoryName !== directoryNameRaw) {
            res.redirect("/sterling/storage?error=" + encodeURIComponent("Invalid directory name."));
            return;
        }

        const { path: storageRoot, exists: rootExists } = resolveSterlingStorageRoot();
        const normalisedRoot = path.resolve(storageRoot);

        if (!rootExists) {
            res.redirect("/sterling/storage?error=" + encodeURIComponent("Storage directory is unavailable."));
            return;
        }

        const targetPath = path.resolve(normalisedRoot, directoryName);
        if (!targetPath.startsWith(normalisedRoot + path.sep)) {
            res.redirect("/sterling/storage?error=" + encodeURIComponent("Deletion request is outside of storage directory."));
            return;
        }

        let stats;
        try {
            stats = fs.statSync(targetPath);
        } catch (err) {
            res.redirect(
                "/sterling/storage?error="
                    + encodeURIComponent(
                        err && err.message ? `Directory not found: ${err.message}` : "Directory not found.",
                    ),
            );
            return;
        }

        if (!stats.isDirectory()) {
            res.redirect("/sterling/storage?error=" + encodeURIComponent("Selected path is not a directory."));
            return;
        }

        try {
            fs.rmSync(targetPath, { recursive: true, force: true });
        } catch (err) {
            res.redirect(
                "/sterling/storage?error="
                    + encodeURIComponent(
                        err && err.message ? `Failed to delete directory: ${err.message}` : "Failed to delete directory.",
                    ),
            );
            return;
        }

        invalidateStorageSummaryCache();

        res.redirect("/sterling/storage?deleted=" + encodeURIComponent(directoryName));
    });

    /* ---------- Repositories listing ---------- */
    app.get("/repositories", (req, res) => {
        const sessionId = resolveSessionId(req) || getSessionIdFromRequest(req);
        const repoConfig = loadRepoConfig(sessionId);
        const repoList = [];
        if (repoConfig) {
            for (const repoName in repoConfig) {
                if (Object.prototype.hasOwnProperty.call(repoConfig, repoName)) {
                    repoList.push({
                        name: repoName,
                        gitRepoLocalPath: repoConfig[repoName].gitRepoLocalPath,
                        gitRepoURL: repoConfig[repoName].gitRepoURL || "#",
                        isDemo: Boolean(repoConfig[repoName].isDemo),
                    });
                }
            }
        }
        res.render("repositories", { repos: repoList, sessionId: sessionId });
    });

    app.get("/repositories/add", async (req, res) => {
        const serverCWD = process.cwd();
        const showCreateRepoLink = ["1", "true", "yes", "on"].includes(
            (process.env.SHOW_NEW_REPOSITORY_LINK || "").toLowerCase(),
        );
        const accountsEnabled = parseBooleanFlagWithDefault(process.env.ACCOUNTS_ENABLED, true);
        let showLoggedOutMessage = false;
        let showSubscribeMessage = false;
        if (rdsStore?.enabled) {
            const sessionId = resolveSessionId(req) || getSessionIdFromRequest(req);
            if (!sessionId) {
                showLoggedOutMessage = true;
            } else {
                const account = await rdsStore.getAccountBySession(sessionId);
                if (!account || isLoggedOutPlan(account.plan)) {
                    showLoggedOutMessage = true;
                } else if (account.plan === "Free") {
                    showSubscribeMessage = true;
                }
            }
        }
        res.render("add_repository", {
            serverCWD,
            cloneError: null,
            sshKeyRequired: false,
            repoNameValue: "",
            gitRepoURLValue: "",
            showCreateRepoLink,
            showLoggedOutMessage,
            showSubscribeMessage,
            accountsEnabled,
        });
    });

    app.get("/repositories/new-default", (req, res) => {
        const sessionId = resolveSessionId(req) || getSessionIdFromRequest(req);
        if (!sessionId) {
            res.redirect("/repositories/add");
            return;
        }

        const repoConfig = loadRepoConfig(sessionId) || {};
        const defaultRepoConfig = loadSingleRepoConfig(NEW_SESSION_REPO_NAME, sessionId);
        const defaultRepoPath = defaultRepoConfig?.gitRepoLocalPath;
        let repoName = NEW_SESSION_REPO_NAME;
        if (defaultRepoPath && fs.existsSync(defaultRepoPath)) {
            const baseName = `${NEW_SESSION_REPO_NAME}_${Date.now()}`;
            repoName = baseName;
            let suffix = 1;
            while (repoConfig[repoName]) {
                repoName = `${baseName}_${suffix}`;
                suffix += 1;
            }
        }

        try {
            ensureSessionDefaultRepo(sessionId, repoName);
        } catch (error) {
            console.error(`Failed to initialize default repo for session: ${error?.message || error}`);
        }

        const createdRepoConfig = loadSingleRepoConfig(repoName, sessionId);
        const createdRepoPath = createdRepoConfig?.gitRepoLocalPath;
        if (createdRepoPath && fs.existsSync(createdRepoPath)) {
            const params = new URLSearchParams({
                repo_directory: createdRepoPath,
                repo_name: repoName,
            });
            res.redirect(`/agent?${params.toString()}`);
            return;
        }

        res.redirect("/repositories");
    });

    /* ---------- Repo helper redirects ---------- */
    app.get("/:repoName", (req, res) => {
        res.redirect(`/environment/${req.params.repoName}`);
    });

    /* ---------- Chats list ---------- */
    app.get("/environment/:repoName", (req, res) => {
        const repoName = req.params.repoName;
        const sessionId = resolveSessionId(req) || getSessionIdFromRequest(req);
        const repoCfg = loadSingleRepoConfig(repoName, sessionId);
        if (!repoCfg) {
            res.status(404).send(`Repository configuration not found: '${repoName}'`);
            return;
        }
        const dataObj = loadRepoJson(repoName, sessionId);
        const { activeChats, inactiveChats, archivedChats, archivedContextChats } = getActiveInactiveChats(dataObj);
        const sterlingCodexLink = buildSterlingCodexUrl(
            res.locals.sterlingCodexBaseUrl,
            repoCfg.gitRepoLocalPath,
        );

        let currentBranchName = "";
        const configuredBranch =
            typeof repoCfg.gitBranch === "string" ? repoCfg.gitBranch.trim() : "";
        if (configuredBranch) {
            currentBranchName = configuredBranch;
        } else {
            const repoPathForBranch = resolveSnapshotParentPath(repoCfg.gitRepoLocalPath)
                || repoCfg.gitRepoLocalPath;
            try {
                const gitMeta = repoPathForBranch ? getGitMetaData(repoPathForBranch) : null;
                if (gitMeta && typeof gitMeta.branchName === "string") {
                    currentBranchName = gitMeta.branchName;
                }
            } catch (err) {
                console.warn("[WARN] Unable to resolve active branch for", repoName, err && err.message ? err.message : err);
            }
        }

        res.render("chats", {
            gitRepoNameCLI: repoName,
            activeChats,
            inactiveChats,
            archivedChats,
            archivedContextChats,
            sterlingCodexLink,
            repoLocalPath: repoCfg && repoCfg.gitRepoLocalPath,
            gitBranch: typeof repoCfg.gitBranch === "string" ? repoCfg.gitBranch : "",
            currentBranch: currentBranchName,
            sessionId,
        });
    });

    /* ---------- Create new chat ---------- */
    app.get("/:repoName/chat", (req, res) => {
        const repoName = req.params.repoName;
        const sessionId = resolveSessionId(req) || getSessionIdFromRequest(req);
        const dataObj = loadRepoJson(repoName, sessionId);

        /* find highest existing chat number */
        let maxChatNumber = 0;
        for (const key of Object.keys(dataObj)) {
            const n = parseInt(key, 10);
            if (!isNaN(n) && n > maxChatNumber) maxChatNumber = n;
        }
        const newChatNumber = maxChatNumber + 1;

        dataObj[newChatNumber] = {
            status: "ACTIVE",
            agentInstructions: loadGlobalInstructions(),
            attachedFiles: [],
            chatHistory: [],
            aiProvider: "openrouter",
            aiModel: DEFAULT_AIMODEL,
            pushAfterCommit: true,
        };
        saveRepoJson(repoName, dataObj, sessionId);
        res.redirect(`/${repoName}/chat/${newChatNumber}`);
    });

    /* ---------- Show specific chat ---------- */
    app.get("/:repoName/chat/:chatNumber", (req, res) => {
        const { repoName, chatNumber } = req.params;
        const sessionId = resolveSessionId(req) || getSessionIdFromRequest(req);
        const dataObj = loadRepoJson(repoName, sessionId);
        const chatData = dataObj[chatNumber];
        if (!chatData) return res.status(404).send("Chat not found.");

        const repoCfg = loadSingleRepoConfig(repoName, sessionId);
        if (!repoCfg) return res.status(400).send(`[ERROR] Repo config not found: '${repoName}'`);

        /* defaults */
        chatData.aiModel = (chatData.aiModel || DEFAULT_AIMODEL).toLowerCase();
        chatData.aiProvider = normalizeProviderName(chatData.aiProvider || "openrouter");
        chatData.additionalRepos = chatData.additionalRepos || [];

        const {
            gitRepoLocalPath,
            gitBranch,
            openAIAccount,
            gitRepoURL,
        } = repoCfg;
        const sterlingCodexLink = buildSterlingCodexUrl(
            res.locals.sterlingCodexBaseUrl,
            gitRepoLocalPath,
        );

        const attachedFiles = chatData.attachedFiles || [];
        const directoryTreeHTML = generateFullDirectoryTree(gitRepoLocalPath, repoName, attachedFiles.filter(s => !s.includes('|')));

        // Collect additional repos' directory trees
        const additionalReposTrees = [];
        const loadRepoConfiguration = loadRepoConfig(sessionId) || {};
        for (const otherRepoName of chatData.additionalRepos) {
            const otherRepoCfg = loadSingleRepoConfig(otherRepoName, sessionId);
            if (otherRepoCfg) {
                // parse out only this repo's attached files
                const filesForThisRepo = attachedFiles
                    .filter(f => f.startsWith(otherRepoName + "|"))
                    .map(f => f.replace(otherRepoName + "|", ""));
                const treeHTML = generateFullDirectoryTree(
                    otherRepoCfg.gitRepoLocalPath,
                    otherRepoName,
                    filesForThisRepo
                );
                additionalReposTrees.push({ repoName: otherRepoName, directoryTreeHTML: treeHTML });
            }
        }

        // For selection in the "Add other repo" form
        const allRepoConfig = loadRepoConfig(sessionId) || {};
        const allRepoNames = Object.keys(allRepoConfig);
        const possibleReposToAdd = allRepoNames.filter(name => name !== repoName && !chatData.additionalRepos.includes(name));

        const meta            = getGitMetaData(gitRepoLocalPath);
        const gitCommits      = getGitCommits(gitRepoLocalPath, { limit: DEFAULT_GIT_LOG_LIMIT });
        const gitCommitGraph  = getGitCommitGraph(gitRepoLocalPath);

        const githubURL       = convertGitUrlToHttps(gitRepoURL);
        const chatGPTURL      = chatData.chatURL || "";
        const status          = chatData.status || "ACTIVE";

        const directoryAnalysisText = analyzeProject(gitRepoLocalPath, { plainText: true });

        /* basic system info via neofetch (optional) */
        function getSystemInformation() {
            let output = "";
            try {
                execSync("command -v neofetch");
                output = execSync("neofetch --config none --ascii off --color_blocks off --stdout").toString();
            } catch {
                output = "[neofetch not available]";
            }
            return output;
        }

        const providerKey = chatData.aiProvider.toLowerCase();
        const aiModelsForProvider = normaliseModelList(
            AIModels[providerKey] || [],
            (AIModelContextLimits && AIModelContextLimits[providerKey]) || {},
        );

        res.render("chat", {
            gitRepoNameCLI : repoName,
            chatNumber,
            directoryTreeHTML,
            additionalReposTrees,
            possibleReposToAdd,
            chatData,
            AIModels        : aiModelsForProvider,
            aiModel         : chatData.aiModel,
            status,
            gitRepoLocalPath,
            githubURL,
            gitBranch,
            openAIAccount,
            chatGPTURL,
            sterlingCodexLink,
            gitRevision     : meta.rev,
            gitTimestamp    : meta.dateStr,
            gitBranchName   : meta.branchName,
            gitTag          : meta.latestTag,
            gitCommits,
            gitCommitGraph,
            directoryAnalysisText,
            systemInformationText : getSystemInformation(),
            environment     : res.locals.environment,
            
            editorEnabled: (function(){ let v = process.env.EDITOR_ENABLED; if (Array.isArray(v)) v = v[v.length-1]; if (typeof v === 'boolean') return v; if (typeof v === 'number') return v === 1; if (typeof v === 'string') return ['1','true','yes','y','on'].includes(v.trim().toLowerCase()); return false; })(),
        });
    });

    /* ---------- Dedicated editor view ---------- */
    app.get("/:repoName/chat/:chatNumber/editor", (req, res) => {
        const { repoName, chatNumber } = req.params;
        const sessionId = resolveSessionId(req) || getSessionIdFromRequest(req);
        const dataObj = loadRepoJson(repoName, sessionId);
        const chatData = dataObj[chatNumber];
        if (!chatData) {
            return res.status(404).send("Chat not found.");
        }

        const repoCfg = loadSingleRepoConfig(repoName, sessionId);
        if (!repoCfg) {
            return res.status(400).send(`Repository '${repoName}' not found.`);
        }

        const additionalRepos = chatData.additionalRepos || [];

        // Determine effective project directory: prefer validated query param when provided
        let effectiveProjectDir = repoCfg.gitRepoLocalPath;
        try {
            const projectDirParam = (req.query && req.query.projectDir) ? req.query.projectDir.toString() : '';
            if (projectDirParam) {
                const resolved = path.resolve(projectDirParam);
                const allowedBase = path.resolve('/git/sterling');
                if (resolved === allowedBase || resolved.startsWith(allowedBase + path.sep)) {
                    try {
                        if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
                            effectiveProjectDir = resolved;
                        }
                    } catch (e) { /* ignore invalid path */ }
                }
            }
        } catch (e) { /* ignore */ }

        const directoryTreeHTML = generateFullDirectoryTree(
            effectiveProjectDir,
            repoName,
            []
        );

        const additionalReposTrees = [];
        additionalRepos.forEach((otherRepoName) => {
            const otherRepoCfg = loadSingleRepoConfig(otherRepoName, sessionId);
            if (otherRepoCfg) {
                const treeHTML = generateFullDirectoryTree(
                    otherRepoCfg.gitRepoLocalPath,
                    otherRepoName,
                    []
                );
                additionalReposTrees.push({
                    repoName: otherRepoName,
                    directoryTreeHTML: treeHTML,
                });
            }
        });

        
        // If a run_id query param is present, attempt to resolve run metadata for header display
        let runTitle = '';
        let runBranch = '';
        let runIdShort = '';
        try {
            const runIdQuery = (req.query && req.query.run_id ? req.query.run_id.toString().trim() : '');
            if (runIdQuery) {
                const runs = typeof loadCodexRuns === 'function' ? loadCodexRuns(sessionId) : [];
                if (Array.isArray(runs)) {
                    const found = runs.find((r) => r && r.id === runIdQuery);
                    if (found) {
                        runTitle = (found.userPrompt || found.effectivePrompt || '').toString();
                        runBranch = (found.branchName || found.gitBranch || '').toString();
                        runIdShort = found.id ? String(found.id).slice(0, 12) : '' ;
                    }
                }
            }
        } catch (_e) { /* ignore */ }

res.render("editor", {
            runTitle: runTitle,
            projectDir: effectiveProjectDir,
            runBranch: runBranch,
            runIdShort: runIdShort,
            gitRepoNameCLI: repoName,
            chatNumber,
            directoryTreeHTML,
            additionalReposTrees,
            attachedRepos: additionalRepos,
            primaryRepoPath: effectiveProjectDir,
            environment: res.locals.environment,
        });
    });

    /* ---------- Fetch file content for editor ---------- */
    app.get("/:repoName/chat/:chatNumber/editor/file", (req, res) => {
        const { repoName, chatNumber } = req.params;
        const { repo: targetRepo } = req.query;
        let requestedPath = (req.query && req.query.path) || (req.query && req.query.file) || '';

        if (!targetRepo || !requestedPath) {
            return res.status(400).json({ error: "Missing repo or path." });
        }

        // coerce to string and sanitize common URL-encoding artifacts
        try { requestedPath = String(requestedPath); } catch (e) { requestedPath = ''; }
        // Replace backslashes (Windows) and strip any leading slashes so path.resolve
        // will always join against the repo root rather than taking an absolute path.
        requestedPath = requestedPath.replace(/\+/g, '/').replace(/^\/+/, '');

        const sessionId = resolveSessionId(req) || getSessionIdFromRequest(req);
        const dataObj = loadRepoJson(repoName, sessionId);
        const chatData = dataObj[chatNumber];
        if (!chatData) {
            return res.status(404).json({ error: "Chat not found." });
        }

        const allowedRepos = new Set([repoName, ...(chatData.additionalRepos || [])]);
        if (!allowedRepos.has(targetRepo)) {
            return res.status(403).json({ error: "Repository not available for this chat." });
        }

        const repoCfg = loadSingleRepoConfig(targetRepo, sessionId);
        if (!repoCfg) {
            return res.status(400).json({ error: "Repository configuration missing." });
        }

        let effectiveRepoRoot = repoCfg.gitRepoLocalPath;
        if (targetRepo === repoName) {
            try {
                const projectDirParam = (req.query && req.query.projectDir) ? req.query.projectDir.toString() : '';
                if (projectDirParam) {
                    const resolvedProjectDir = path.resolve(projectDirParam);
                    const allowedBase = path.resolve('/git/sterling');
                    if (resolvedProjectDir === allowedBase || resolvedProjectDir.startsWith(allowedBase + path.sep)) {
                        if (fs.existsSync(resolvedProjectDir) && fs.statSync(resolvedProjectDir).isDirectory()) {
                            effectiveRepoRoot = resolvedProjectDir;
                        }
                    }
                }
            } catch (_e) { /* ignore */ }
        }

        // Enforce allowed base (only allow repos under /git/sterling)
        try {
            const allowedBase = path.resolve('/git/sterling');
            const repoRootResolved = path.resolve(effectiveRepoRoot || '');
            if (!(repoRootResolved === allowedBase || repoRootResolved.startsWith(allowedBase + path.sep))) {
                return res.status(403).json({ error: 'Repository path not permitted for editor.' });
            }
        } catch (_e) { /* ignore */ }

        const repoRoot = path.resolve(effectiveRepoRoot || '');
        const normalizedRelative = path.normalize(requestedPath);
        // Reject obvious traversal attempts early
        if (normalizedRelative.split(path.sep).some(segment => segment === '..')) {
            return res.status(400).json({ error: "Invalid file path." });
        }

        // Ensure we join against repoRoot without allowing absolute overrides
        const absolutePath = path.resolve(repoRoot, '.', normalizedRelative);
        const relativeToRoot = path.relative(repoRoot, absolutePath);
        if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
            return res.status(400).json({ error: "Invalid file path." });
        }

        try {
            const stat = fs.statSync(absolutePath);
            if (!stat.isFile()) {
                return res.status(404).json({ error: "Path is not a file." });
            }
            const content = fs.readFileSync(absolutePath, "utf-8");
            return res.json({
                repo: targetRepo,
                path: requestedPath,
                content,
                lastModified: stat.mtimeMs,
            });
        } catch (err) {
            console.error("[ERROR] Failed to load file for editor:", err, { repoRoot, requestedPath });
            return res.status(500).json({ error: "Failed to read file." });
        }
    });

    /* ---------- File Tree view ---------- */
    app.get("/:repoName/chat/:chatNumber/file-tree", (req, res) => {
        const { repoName, chatNumber } = req.params;
        const sessionId = resolveSessionId(req) || getSessionIdFromRequest(req);
        const dataObj = loadRepoJson(repoName, sessionId);
        const chatData = dataObj[chatNumber];
        if (!chatData) {
            return res.status(404).send("Chat not found.");
        }

        const repoCfg = loadSingleRepoConfig(repoName, sessionId);
        if (!repoCfg) {
            return res.status(400).send(`Repository '${repoName}' not found.`);
        }

        // Determine effective project directory: prefer validated query param when provided
        let effectiveProjectDir = repoCfg.gitRepoLocalPath;
        try {
            const projectDirParam = (req.query && req.query.projectDir) ? req.query.projectDir.toString() : '';
            if (projectDirParam) {
                const resolved = path.resolve(projectDirParam);
                const allowedBase = path.resolve('/git/sterling');
                if (resolved === allowedBase || resolved.startsWith(allowedBase + path.sep)) {
                    try {
                        if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
                            effectiveProjectDir = resolved;
                        }
                    } catch (e) { /* ignore invalid path */ }
                }
            }
        } catch (e) { /* ignore */ }

        res.render("file_tree", {
            gitRepoNameCLI: repoName,
            chatNumber,
            projectDir: effectiveProjectDir,
            environment: res.locals.environment,
        });
    });

    /* ---------- Code-flow visualiser ---------- */
    app.get("/code_flow", (_req, res) => {
        const routes = analyzeCodeFlow(app);
        res.render("code_flow", { routes });
    });

    /* ---------- Raw / JSON viewer helpers ---------- */
    app.get("/:repoName/chat/:chatNumber/raw/:idx", (req, res) => {
        const { repoName, chatNumber, idx } = req.params;
        const sessionId = resolveSessionId(req) || getSessionIdFromRequest(req);
        const dataObj = loadRepoJson(repoName, sessionId);
        const chatData = dataObj[chatNumber];
        if (!chatData) return res.status(404).send("Chat not found.");
        if (!chatData.chatHistory || !chatData.chatHistory[idx])
            return res.status(404).send("Message not found.");

        const msg = chatData.chatHistory[idx];
        if (msg.role !== "user" || !msg.messagesSent)
            return res.status(404).send("No raw messages available for this message.");

        res.type("application/json").send(JSON.stringify(msg.messagesSent, null, 2));
    });

    app.get("/:repoName/chat/:chatNumber/json_viewer/:idx", (req, res) => {
        const { repoName, chatNumber, idx } = req.params;
        const sessionId = resolveSessionId(req) || getSessionIdFromRequest(req);
        const dataObj = loadRepoJson(repoName, sessionId);
        const chatData = dataObj[chatNumber];
        if (!chatData) return res.status(404).send("Chat not found.");
        if (!chatData.chatHistory || !chatData.chatHistory[idx])
            return res.status(404).send("Message not found.");

        const msg = chatData.chatHistory[idx];
        if (msg.role !== "user" || !msg.messagesSent)
            return res.status(404).send("No raw messages available for this message.");

        res.render("json_viewer", { messages: msg.messagesSent });
    });

    /* ---------- Git log (JSON) ---------- */
    app.get("/:repoName/git_log", async (req, res) => {
        const { repoName } = req.params;
        const sessionId = resolveSessionId(req) || getSessionIdFromRequest(req);
        const repoCfg = loadSingleRepoConfig(repoName, sessionId);
        if (!repoCfg) return res.status(400).json({ error: `Repository '${repoName}' not found.` });

        const shouldAutoPull = parseBooleanParam(req.query.pull, true);
        if (shouldAutoPull && typeof gitUpdatePull === "function") {
            try {
                await gitUpdatePull(repoCfg.gitRepoLocalPath);
            } catch (pullErr) {
                console.warn(`[WARN] Failed to git pull for ${repoCfg.gitRepoLocalPath}:`, pullErr);
            }
        }

        const gitCommits = getGitCommitGraph(repoCfg.gitRepoLocalPath);
        res.json({ commits: gitCommits });
    });

    /* ---------- /:repoName/git_branches ---------- */
    app.get("/:repoName/git_branches", (req, res) => {
        const { repoName } = req.params;
        const sessionId = resolveSessionId(req) || getSessionIdFromRequest(req);
        const repoCfg = loadSingleRepoConfig(repoName, sessionId);
        if (!repoCfg) {
            return res.status(400).json({ error: `Repo '${repoName}' not found.` });
        }
        const { gitRepoLocalPath } = repoCfg;
        let branchData = [];
        try {
            const refreshRaw = (req.query && req.query.refresh) ? String(req.query.refresh).toLowerCase() : "";
            const shouldRefresh = refreshRaw === "1" || refreshRaw === "true" || refreshRaw === "yes";
            if (shouldRefresh) {
                try {
                    execSync("git fetch --prune --all", { cwd: gitRepoLocalPath, stdio: "pipe" });
                } catch (fetchErr) {
                    console.warn("[WARN] Unable to refresh branches:", fetchErr);
                }
            }

            const branchRaw = execSync(
                "git for-each-ref --format='%(refname:short)' refs/heads refs/remotes",
                { cwd: gitRepoLocalPath },
            )
                .toString()
                .trim()
                .split("\n");
            const branchSet = new Set();
            branchRaw.forEach((branch) => {
                const cleaned = branch.replace(/^\*\s*/, "").trim();
                if (!cleaned || cleaned === "HEAD" || cleaned.endsWith("/HEAD")) {
                    return;
                }
                if (cleaned.includes("/")) {
                    const [remoteName, ...rest] = cleaned.split("/");
                    if (remoteName && rest.length > 0) {
                        branchSet.add(rest.join("/"));
                        return;
                    }
                }
                branchSet.add(cleaned);
            });
            branchData = Array.from(branchSet).sort((a, b) => a.localeCompare(b));
        } catch (err) {
            console.error("[ERROR] getBranches =>", err);
            return res.status(500).json({ error: "Failed to list branches." });
        }
        return res.json({ branches: branchData });
    });

    /* ---------- New fixMissingChunks page ---------- */
    app.get("/:repoName/fixMissingChunks", (req, res) => {
        res.render("fixMissingChunks", {
            repoName: req.params.repoName
        });
    });

    const MERGE_DIFF_CACHE_TTL_MS = 5 * 60 * 1000;
    const mergeDiffCache = new Map();

    const buildMergeDiffCacheKey = (sessionId, projectDir, baseRev, compRev) => {
        const safeSession = (sessionId || '').trim() || 'default';
        const safeProject = (projectDir || '').toString().replace(/\\+/g, '/').trim();
        return `${safeSession}::${safeProject}::${baseRev || ''}::${compRev || ''}`;
    };

    const getCachedMergeDiff = (key) => {
        if (!key) return null;
        const entry = mergeDiffCache.get(key);
        if (!entry) return null;
        if (Date.now() - entry.timestamp > MERGE_DIFF_CACHE_TTL_MS) {
            mergeDiffCache.delete(key);
            return null;
        }
        return entry;
    };

    const storeMergeDiffCache = (key, payload) => {
        if (!key || !payload) return;
        mergeDiffCache.set(key, {
            ...payload,
            timestamp: Date.now(),
        });
    };

    const isTruthyFlag = (value) => {
        if (typeof value === 'string') {
            const normalized = value.trim().toLowerCase();
            return ["1", "true", "yes", "on"].includes(normalized);
        }
        return Boolean(value);
    };

    const extractComparisonPromptLine = (value) => {
        if (typeof value !== 'string') {
            return '';
        }
        const trimmed = value.trim();
        if (!trimmed) {
            return '';
        }
        const firstLine = trimmed.split(/\r?\n/)[0].trim();
        return firstLine;
    };

    const normalizeFinalOutputForDiff = (value) => {
        if (typeof value !== 'string') {
            return '';
        }
        const normalized = value.replace(/\r/g, '').trim();
        if (!normalized) {
            return '';
        }
        const hasDoubleNewline = /\n\n/.test(normalized);
        const hasSingleNewline = /(^|[^\n])\n([^\n]|$)/.test(normalized);
        if (hasDoubleNewline && !hasSingleNewline) {
            return normalized.replace(/\n\n/g, '\n');
        }
        return normalized;
    };

    app.get("/agent/git-diff-branch-merge", async (req, res) => {
        const sessionId = resolveSessionId(req) || getSessionIdFromRequest(req);
        const projectDirParam = (req.query.projectDir || "").toString().trim();
        const branchParam = (req.query.branch || "").toString().trim();
        const branchName = branchParam.replace(/^['"]+|['"]+$/g, "");
        const mergeReady = isTruthyFlag(req.query.mergeReady);
        const prefetchOnly = isTruthyFlag(req.query.prefetch);
        const comparisonPromptLine = extractComparisonPromptLine(req.query.userPrompt || "");
        const comparisonFinalOutputParam = typeof req.query.finalOutput === "string" ? req.query.finalOutput : "";
        const comparisonFinalOutputFromQuery = comparisonFinalOutputParam
            ? normalizeFinalOutputForDiff(comparisonFinalOutputParam)
            : "";

        if (!branchParam) {
            return res.status(400).render("diff", { errorMessage: 'branch parameter is required.', gitRepoNameCLI: projectDirParam || '', baseRev: '', compRev: '', diffOutput: '', structuredDiff: [], debugMode: !!process.env.DEBUG, environment: res.locals.environment, editorBaseUrl: res.locals.editorBaseUrl, diffFormAction: "/agent/git-diff", repoLinksEnabled: false, projectDir: projectDirParam, mergeReady,
                        comparisonPromptLine, comparisonFinalOutput: comparisonFinalOutputFromQuery });
        }

        const resolvedProjectDir = projectDirParam ? path.resolve(projectDirParam) : "";
        if (!resolvedProjectDir) {
            return res.status(400).render("diff", { errorMessage: 'Project directory is required.', gitRepoNameCLI: projectDirParam || '', baseRev: '', compRev: '', diffOutput: '', structuredDiff: [], debugMode: !!process.env.DEBUG, environment: res.locals.environment, editorBaseUrl: res.locals.editorBaseUrl, diffFormAction: "/agent/git-diff", repoLinksEnabled: false, projectDir: projectDirParam, mergeReady,
                        comparisonPromptLine, comparisonFinalOutput: comparisonFinalOutputFromQuery });
        }

        try {
            // Determine candidate parent branches. Prefer configured sterlingParent if present
            let parentCandidates = [];
            try {
                const cfg = execSync(`git config branch."${branchName}".sterlingParent`, { cwd: resolvedProjectDir, stdio: ['pipe','pipe','ignore'] }).toString().trim();
                if (cfg) parentCandidates.push(cfg);
            } catch (_err) {}

            parentCandidates = parentCandidates.concat(['main', 'master', 'origin/main', 'origin/master']);

            let foundMergeCommit = '';
            let foundParent = '';

            for (const candidate of parentCandidates) {
                if (!candidate) continue;
                // Check if candidate ref exists
                try {
                    execSync(`git rev-parse --verify --quiet ${candidate}`, { cwd: resolvedProjectDir, stdio: ['pipe','pipe','ignore'] });
                } catch (_e) { continue; }

                // List recent merges on candidate
                let merges = '';
                try {
                    merges = execSync(`git log ${candidate} --merges --pretty=format:%H -n 200`, { cwd: resolvedProjectDir, maxBuffer: 1024 * 1024 * 5 }).toString();
                } catch (_e) { merges = ''; }

                if (!merges) continue;
                const mergeList = merges.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
                for (const mergeHash of mergeList) {
                    if (!mergeHash) continue;
                    try {
                        // Check if the branch is an ancestor of this merge commit
                        execSync(`git merge-base --is-ancestor ${branchName} ${mergeHash}`, { cwd: resolvedProjectDir, stdio: ['pipe','pipe','ignore'] });
                        // exit code 0 means ancestor
                        foundMergeCommit = mergeHash;
                        foundParent = candidate;
                        break;
                    } catch (_e) {
                        // not ancestor
                    }
                }
                if (foundMergeCommit) break;
            }

            // Helper to resolve a ref against common namespaces
            const resolveRefCandidates = (candidates) => {
                for (const cand of candidates) {
                    if (!cand) continue;
                    try {
                        const sha = execSync(`git rev-parse --verify ${cand}`, { cwd: resolvedProjectDir, stdio: ['pipe','pipe','pipe'] })
                            .toString()
                            .trim();
                        if (sha) {
                            return { sha, ref: cand };
                        }
                    } catch (_e) {
                        // try next candidate
                    }
                }
                return null;
            };

            // Build a candidate list for the branch that includes all configured remotes
            const buildBranchCandidates = () => {
                const candidates = new Set([
                    `${branchName}`,
                    `refs/heads/${branchName}`,
                    `refs/remotes/${branchName}`,
                    `refs/remotes/origin/${branchName}`,
                    `origin/${branchName}`,
                ]);

                // Include refs/remotes/<remote>/<branch> for each configured remote
                try {
                    const remotes = execSync('git remote', { cwd: resolvedProjectDir, stdio: ['pipe','pipe','ignore'] })
                        .toString()
                        .split(/\r?\n/)
                        .map(r => r.trim())
                        .filter(Boolean);
                    for (const remote of remotes) {
                        candidates.add(`${remote}/${branchName}`);
                        candidates.add(`refs/remotes/${remote}/${branchName}`);
                    }
                } catch (_e) {}

                // Add any matching remote refs discovered via for-each-ref (covers nested paths)
                try {
                    const matchingRemoteRefs = execSync(`git for-each-ref --format='%(refname)' "refs/remotes/*/${branchName}"`, { cwd: resolvedProjectDir, stdio: ['pipe','pipe','ignore'] })
                        .toString()
                        .split(/\r?\n/)
                        .map(r => r.trim())
                        .filter(Boolean);
                    for (const ref of matchingRemoteRefs) {
                        candidates.add(ref);
                    }
                } catch (_e) {}

                return Array.from(candidates);
            };

            let baseRev = "";
            let compRev = "";
            let diffCommand = "";
            let resolvedBranchForList = null;

            if (!foundMergeCommit) {
                // No merge commit found on parent candidates. Try to compare the branch
                // against the best available parent so users can review changes before merging.
                let resolvedBranch = resolveRefCandidates(buildBranchCandidates());

                let resolvedParent = resolveRefCandidates(parentCandidates);

                // If the branch could not be resolved locally, attempt a lightweight fetch
                // to refresh remote references before giving up.
                if (!resolvedBranch) {
                    try {
                        execSync('git fetch --all --prune --tags --quiet', { cwd: resolvedProjectDir, stdio: ['ignore','pipe','ignore'] });
                        resolvedBranch = resolveRefCandidates(buildBranchCandidates());
                        // Parent candidates may also be remote-only; refresh them too.
                        if (!resolvedParent) {
                            resolvedParent = resolveRefCandidates(parentCandidates);
                        }
                    } catch (_err) {
                        // Ignore fetch failures; we'll fall back to the existing error path.
                    }
                }

                if (!resolvedBranch) {
                    return res.status(404).render("diff", {
                        gitRepoNameCLI: resolvedProjectDir,
                        baseRev: '',
                        compRev: '',
                        diffOutput: '',
                        structuredDiff: [],
                        debugMode: !!process.env.DEBUG,
                        environment: res.locals.environment,
                        editorBaseUrl: res.locals.editorBaseUrl,
                        diffFormAction: "/agent/git-diff",
                        repoLinksEnabled: false,
                        projectDir: resolvedProjectDir,
                        errorMessage: `Unable to resolve branch '${branchName}' for diff.`,
                        mergeReady,
                        comparisonPromptLine,
                        comparisonFinalOutput: comparisonFinalOutputFromQuery,
                    });
                }

                compRev = resolvedBranch.sha;
                resolvedBranchForList = resolvedBranch;

                if (resolvedParent) {
                    let mergeBase = "";
                    try {
                        mergeBase = execSync(`git merge-base ${resolvedParent.ref} ${resolvedBranch.ref}`, { cwd: resolvedProjectDir, stdio: ['pipe','pipe','pipe'] })
                            .toString()
                            .trim();
                    } catch (_e) {
                        mergeBase = "";
                    }

                    baseRev = mergeBase || resolvedParent.sha;
                    // Use a three-dot diff so the output reflects changes on the branch relative to parent
                    diffCommand = `git diff ${resolvedParent.ref}...${resolvedBranch.ref}`;
                } else {
                    baseRev = `${resolvedBranch.sha}^`;
                    diffCommand = `git diff ${baseRev} ${resolvedBranch.sha}`;
                }
            } else {
                baseRev = `${foundMergeCommit}^`;
                compRev = foundMergeCommit;
                diffCommand = `git diff ${baseRev} ${compRev}`;
                resolvedBranchForList = resolveRefCandidates(buildBranchCandidates());
            }

            const cacheKey = buildMergeDiffCacheKey(sessionId, resolvedProjectDir, baseRev, compRev);
            const cachedDiff = getCachedMergeDiff(cacheKey);

            let diffOutput = '';
            let structuredDiff = [];

            if (cachedDiff) {
                diffOutput = cachedDiff.diffOutput || '';
                structuredDiff = Array.isArray(cachedDiff.structuredDiff) ? cachedDiff.structuredDiff : [];
            } else {
                try {
                    diffOutput = execSync(diffCommand, { cwd: resolvedProjectDir, maxBuffer: 1024 * 1024 * 10 }).toString();
                } catch (err) {
                    diffOutput = `[ERROR] Failed to run ${diffCommand}

${err}`;
                }
                structuredDiff = parseUnifiedDiff(diffOutput);
                storeMergeDiffCache(cacheKey, { diffOutput, structuredDiff, baseRev, compRev, projectDir: resolvedProjectDir });
            }

            if (prefetchOnly) {
                // Refresh the cache timestamp even when serving from cache.
                storeMergeDiffCache(cacheKey, { diffOutput, structuredDiff, baseRev, compRev, projectDir: resolvedProjectDir });
                return res.json({ status: 'ok', cached: !!cachedDiff, baseRev, compRev });
            }

            storeMergeDiffCache(cacheKey, { diffOutput, structuredDiff, baseRev, compRev, projectDir: resolvedProjectDir });

            const editorTarget = resolveEditorTargetForProjectDir(resolvedProjectDir, sessionId);
            const repoName = (editorTarget && editorTarget.repoName)
                ? editorTarget.repoName
                : resolveRepoNameByLocalPath(resolvedProjectDir, sessionId);
            const repoLinksEnabled = !!repoName;
            const chatNumber = editorTarget && editorTarget.chatNumber ? editorTarget.chatNumber : '';

            const baseMeta = baseRev ? getCommitMeta(resolvedProjectDir, baseRev) : { hash: "", authorName: "", authorEmail: "", message: "" };
            const compMeta = compRev ? getCommitMeta(resolvedProjectDir, compRev) : { hash: "", authorName: "", authorEmail: "", message: "" };
            let commitList = [];
            if (resolvedBranchForList && resolvedBranchForList.ref) {
                const rangeRef = baseRev ? `${baseRev}..${resolvedBranchForList.ref}` : resolvedBranchForList.ref;
                commitList = getCommitListForRange(resolvedProjectDir, rangeRef);
            }
            if (!commitList.length) {
                commitList = getCommitList(resolvedProjectDir, baseRev, compRev);
            }
            const comparisonFinalOutput = comparisonFinalOutputFromQuery
                || normalizeFinalOutputForDiff(
                    await extractFinalOutputForCommit(
                        sessionId,
                        resolvedProjectDir,
                        compMeta.hash || compRev
                    )
                );

            res.render("diff", {
                gitRepoNameCLI: repoName || resolvedProjectDir,
                baseRev,
                compRev,
                diffOutput,
                structuredDiff,
                debugMode: !!process.env.DEBUG,
                environment: res.locals.environment,
                editorBaseUrl: res.locals.editorBaseUrl,
                diffFormAction: repoLinksEnabled ? `/${repoName}/diff` : "/agent/git-diff",
                repoLinksEnabled,
                projectDir: resolvedProjectDir,
                errorMessage: '',
                baseMeta,
                compMeta,
                commitList,
                mergeReady,
                comparisonPromptLine,
                comparisonFinalOutput,
                chatNumber,
                showCommitList: SHOW_COMMIT_LIST
            });
        } catch (err) {
            console.error('[ERROR] /agent/git-diff-branch-merge:', err);
            return res.status(500).render('diff', { gitRepoNameCLI: projectDirParam || '', baseRev: '', compRev: '', diffOutput: '', structuredDiff: [], debugMode: !!process.env.DEBUG, environment: res.locals.environment, editorBaseUrl: res.locals.editorBaseUrl, diffFormAction: "/agent/git-diff", repoLinksEnabled: false, projectDir: projectDirParam, errorMessage: 'Internal server error', mergeReady,
                comparisonPromptLine, comparisonFinalOutput: comparisonFinalOutputFromQuery });
        }
    });

    const extractFinalOutputForCommit = async (sessionId, projectDir, commitHash) => {
        if (!sessionId || !projectDir || !commitHash) {
            return "";
        }

        try {
            const runs = typeof loadCodexRuns === 'function' ? loadCodexRuns(sessionId) : [];
            if (!Array.isArray(runs)) {
                return "";
            }

            // Find the run that matches this commit hash
            const matchingRun = runs.find(run => {
                if (!run || typeof run !== 'object') return false;

                // Check if this run's commit hash matches
                const runCommitHash = run.commit || run.hash || '';
                if (runCommitHash && runCommitHash.startsWith(commitHash)) {
                    return true;
                }

                // Also check if the project directory matches
                const runProjectDir = run.projectDir || run.requestedProjectDir || run.effectiveProjectDir || '';
                if (runProjectDir) {
                    try {
                        const resolvedRunProjectDir = path.resolve(runProjectDir);
                        const resolvedProjectDir = path.resolve(projectDir);
                        return resolvedRunProjectDir === resolvedProjectDir;
                    } catch (e) {
                        return false;
                    }
                }

                return false;
            });

            if (matchingRun) {
                return await resolveFinalOutputTextForCommit(matchingRun);
            }

            return "";
        } catch (err) {
            console.error("Failed to extract final output for commit:", err);
            return "";
        }
    };

    app.get("/agent/git-diff", async (req, res) => {
        const sessionId = resolveSessionId(req) || getSessionIdFromRequest(req);
        const projectDirParam = (req.query.projectDir || "").toString().trim();
        const baseRevInput = (req.query.baseRev || "").toString();
        const compRevInput = (req.query.compRev || "").toString();
        const mergeReady = isTruthyFlag(req.query.mergeReady);
        const prefetchOnly = isTruthyFlag(req.query.prefetch);
        const comparisonPromptLine = extractComparisonPromptLine(req.query.userPrompt || "");
        const resolvedProjectDir = projectDirParam ? path.resolve(projectDirParam) : "";

        let errorMessage = "";

        if (!resolvedProjectDir) {
            errorMessage = "Project directory is required.";
        } else {
            try {
                const stats = fs.statSync(resolvedProjectDir);
                if (!stats.isDirectory()) {
                    errorMessage = `Provided project directory is not a directory: ${projectDirParam}`;
                }
            } catch (err) {
                // Project dir missing — attempt to recover by mapping a deleted
                // Sterling temp snapshot directory to a registered repository.
                try {
                    const repoConfig = (typeof loadRepoConfig === "function" ? loadRepoConfig(sessionId) : {}) || {};
                    const candidateBase = path.basename(resolvedProjectDir || projectDirParam || '');
                    let fallbackPath = '';

                    // First, try to match by repo local path basename.
                    for (const [name, cfg] of Object.entries(repoConfig)) {
                        if (cfg && cfg.gitRepoLocalPath) {
                            try {
                                const repoPathResolved = path.resolve(cfg.gitRepoLocalPath);
                                if (path.basename(repoPathResolved) === candidateBase && fs.existsSync(repoPathResolved)) {
                                    fallbackPath = repoPathResolved;
                                    break;
                                }
                            } catch (_e) { /* ignore */ }
                        }
                    }

                    // Next, try to find a run that references the missing temp dir and map
                    // it to the repo configured for that run.
                    if (!fallbackPath) {
                        try {
                            const runs = typeof loadCodexRuns === 'function' ? loadCodexRuns(sessionId) : [];
                            if (Array.isArray(runs) && runs.length) {
                                for (const r of runs) {
                                    const candidateDir = (r && (r.requestedProjectDir || r.effectiveProjectDir || r.projectDir)) || '';
                                    if (!candidateDir) continue;
                                    try {
                                        if (path.basename(candidateDir) === candidateBase && r.repoName && repoConfig[r.repoName] && repoConfig[r.repoName].gitRepoLocalPath) {
                                            const repoPathResolved = path.resolve(repoConfig[r.repoName].gitRepoLocalPath);
                                            if (fs.existsSync(repoPathResolved)) { fallbackPath = repoPathResolved; break; }
                                        }
                                    } catch (_e) { /* ignore */ }
                                }
                            }
                        } catch (_e) { /* ignore */ }
                    }

                    if (fallbackPath) {
                        resolvedProjectDir = fallbackPath;
                    } else {
                        errorMessage = `Project directory not found: ${projectDirParam || resolvedProjectDir}`;
                    }
                } catch (_e) {
                    errorMessage = `Project directory not found: ${projectDirParam || resolvedProjectDir}`;
                }
            }
        }

        const sanitizeRevision = (value, label) => {
            const trimmed = value.trim();
            if (!trimmed) {
                return { value: "", error: `${label} is required.` };
            }

            // Allow human-friendly display like "HEAD (abc123)" by extracting
            // an inner hex-ish commit id in parentheses if present.
            const match = trimmed.match(/\((?:[0-9a-fA-F]{6,40})\)$/);
            if (match) {
                const inner = match[0].slice(1, -1);
                return { value: inner, error: "" };
            }

            // Accept normal git refs and partial commit hashes.
            if (!/^[0-9A-Za-z._^~/:-]+$/.test(trimmed)) {
                return { value: "", error: `Invalid ${label} parameter.` };
            }

            return { value: trimmed, error: "" };
        };

        let baseRev = baseRevInput.trim();
        let compRev = compRevInput.trim();

        if (!errorMessage) {
            const sanitizedBase = sanitizeRevision(baseRevInput, "baseRev");
            const sanitizedComp = sanitizeRevision(compRevInput, "compRev");

            if (sanitizedBase.error) {
                errorMessage = sanitizedBase.error;
            }

            if (!errorMessage && sanitizedComp.error) {
                errorMessage = sanitizedComp.error;
            }

            if (!errorMessage) {
                baseRev = sanitizedBase.value;
                compRev = sanitizedComp.value;
            }
        }

        let diffOutput = "";
        let structuredDiff = [];

        if (!errorMessage) {
            const cacheKey = buildMergeDiffCacheKey(sessionId, resolvedProjectDir, baseRev, compRev);
            const cachedDiff = getCachedMergeDiff(cacheKey);

            if (cachedDiff) {
                diffOutput = cachedDiff.diffOutput || "";
                structuredDiff = Array.isArray(cachedDiff.structuredDiff) ? cachedDiff.structuredDiff : [];
            } else {
                try {
                    diffOutput = execSync(`git diff ${baseRev} ${compRev}`, {
                        cwd: resolvedProjectDir,
                        maxBuffer: 1024 * 1024 * 10,
                    }).toString();
                } catch (err) {
                    diffOutput = `[ERROR] Failed to run git diff ${baseRev} ${compRev}\n\n${err}`;
                }

                structuredDiff = parseUnifiedDiff(diffOutput);
                storeMergeDiffCache(cacheKey, { diffOutput, structuredDiff, baseRev, compRev, projectDir: resolvedProjectDir });
            }

            if (prefetchOnly) {
                storeMergeDiffCache(cacheKey, { diffOutput, structuredDiff, baseRev, compRev, projectDir: resolvedProjectDir });
                return res.json({ status: 'ok', cached: !!cachedDiff, baseRev, compRev });
            }

            storeMergeDiffCache(cacheKey, { diffOutput, structuredDiff, baseRev, compRev, projectDir: resolvedProjectDir });
        } else if (prefetchOnly) {
            return res.status(400).json({ error: errorMessage });
        }

        const editorTarget = resolveEditorTargetForProjectDir(resolvedProjectDir, sessionId);
        const repoName = (editorTarget && editorTarget.repoName)
            ? editorTarget.repoName
            : resolveRepoNameByLocalPath(resolvedProjectDir, sessionId);
        const repoLinksEnabled = !!repoName;
        const chatNumber = editorTarget && editorTarget.chatNumber ? editorTarget.chatNumber : "";

        const statusCode = errorMessage ? 400 : 200;

        const baseMeta = baseRev ? getCommitMeta(resolvedProjectDir, baseRev) : { hash: "", authorName: "", authorEmail: "", message: "", fullMessage: "" };
        const compMeta = compRev ? getCommitMeta(resolvedProjectDir, compRev) : { hash: "", authorName: "", authorEmail: "", message: "", fullMessage: "" };
        let comparisonFinalOutput = "";
        if (!errorMessage) {
            comparisonFinalOutput = normalizeFinalOutputForDiff(
                await extractFinalOutputForCommit(
                    sessionId,
                    resolvedProjectDir,
                    compMeta.hash || compRev
                )
            );
        }
        const commitList = getCommitList(resolvedProjectDir, baseRev, compRev);

        res.status(statusCode).render("diff", {
            gitRepoNameCLI: repoName || resolvedProjectDir,
            baseRev,
            compRev,
            diffOutput,
            structuredDiff,
            debugMode: !!process.env.DEBUG,
            environment: res.locals.environment,
            editorBaseUrl: res.locals.editorBaseUrl,
            diffFormAction: repoLinksEnabled ? `/${repoName}/diff` : "/agent/git-diff",
            repoLinksEnabled,
            projectDir: resolvedProjectDir,
            errorMessage,
            baseMeta,
            compMeta,
            commitList,
            mergeReady,
            comparisonPromptLine,
            comparisonFinalOutput,
            chatNumber,
        });
    });

    

    const getCommitMeta = (cwd, rev) => {
        if (!rev) return { hash: '', authorName: '', authorEmail: '', message: '', fullMessage: '' };
        try {
            const out = execSync(`git show -s --format=%H%n%an%n%ae%n%s%n%b ${rev}`, { cwd, maxBuffer: 1024 * 1024 }).toString();
            const parts = out.split(/\r?\n/);
            const [hash = '', authorName = '', authorEmail = '', subject = '', ...bodyParts] = parts;
            const body = bodyParts.join('\n').replace(/\n+$/, '');
            const fullMessage = body ? `${subject}\n${body}` : subject;
            return { hash, authorName, authorEmail, message: subject, fullMessage };
        } catch (err) {
            return { hash: '', authorName: '', authorEmail: '', message: '', fullMessage: '' };
        }
    };

    const resolveRefCandidates = (cwd, candidates) => {
        if (!Array.isArray(candidates)) {
            return null;
        }
        for (const cand of candidates) {
            if (!cand) continue;
            try {
                const sha = execSync(`git rev-parse --verify ${cand}`, { cwd, stdio: ['pipe','pipe','pipe'] })
                    .toString()
                    .trim();
                if (sha) {
                    return { sha, ref: cand };
                }
            } catch (_e) {
                // try next candidate
            }
        }
        return null;
    };

    const normalizeBranchShortName = (branchRef) => {
        if (!branchRef) return '';
        let cleaned = branchRef.replace(/^refs\/heads\//, '');
        cleaned = cleaned.replace(/^refs\/remotes\//, '');
        cleaned = cleaned.replace(/^remotes\//, '');
        cleaned = cleaned.replace(/^origin\//, '');
        return cleaned;
    };

    const getParentCandidatesForBranch = (cwd, branchShort) => {
        const candidates = [];
        if (branchShort) {
            try {
                const cfg = execSync(`git config branch."${branchShort}".sterlingParent`, { cwd, stdio: ['pipe','pipe','ignore'] }).toString().trim();
                if (cfg) candidates.push(cfg);
            } catch (_err) {}
        }
        candidates.push('main', 'master', 'origin/main', 'origin/master');
        return candidates;
    };

    const getCommitList = (cwd, baseRev, compRev) => {
        if (!baseRev || !compRev) return [];
        try {
            const parseCommitLines = (logOutput) => {
                const lines = logOutput.split(/\r?\n/).filter(Boolean);
                return lines.map((line) => {
                    const [hash = '', parentsRaw = '', message = ''] = line.split('\x1f');
                    const parents = parentsRaw ? parentsRaw.split(' ').filter(Boolean) : [];
                    return { hash, parents, message };
                }).filter((commit) => commit.hash);
            };

            const resolveBranchForCommit = (commitHash) => {
                if (!commitHash) {
                    return "";
                }
                try {
                    const branchOut = execSync(`git branch -a --contains ${commitHash}`, {
                        cwd,
                        maxBuffer: 1024 * 1024,
                    }).toString();
                    const branches = branchOut
                        .split(/\r?\n/)
                        .map((line) => line.replace(/^\*?\s*/, "").trim())
                        .filter(Boolean)
                        .filter((line) => !line.includes("->"))
                        .filter((line) => !line.toLowerCase().includes("detached"));
                    if (!branches.length) {
                        return "";
                    }
                    const preferred =
                        branches.find((branch) => /^alfe\//.test(branch))
                        || branches.find((branch) => /^remotes\/origin\/alfe\//.test(branch))
                        || branches.find((branch) => /^origin\/alfe\//.test(branch))
                        || branches[0];
                    return preferred || "";
                } catch (err) {
                    return "";
                }
            };

            const branchRef = resolveBranchForCommit(compRev);
            if (branchRef) {
                try {
                    let rangeRef = baseRev ? `${baseRev}..${branchRef}` : branchRef;
                    const shouldExpandRange = baseRev === `${compRev}^`;
                    if (shouldExpandRange) {
                        const branchShort = normalizeBranchShortName(branchRef);
                        const parentCandidates = getParentCandidatesForBranch(cwd, branchShort);
                        const resolvedParent = resolveRefCandidates(cwd, parentCandidates);
                        if (resolvedParent) {
                            let mergeBase = '';
                            try {
                                mergeBase = execSync(`git merge-base ${resolvedParent.ref} ${branchRef}`, { cwd, stdio: ['pipe','pipe','pipe'] })
                                    .toString()
                                    .trim();
                            } catch (_e) {
                                mergeBase = '';
                            }
                            if (mergeBase) {
                                rangeRef = `${mergeBase}..${branchRef}`;
                            }
                        }
                    }
                    const branchOut = execSync(`git log --format=%H%x1f%P%x1f%s ${rangeRef}`, {
                        cwd,
                        maxBuffer: 1024 * 1024,
                    }).toString();
                    const branchCommits = parseCommitLines(branchOut);
                    return branchCommits;
                } catch (err) {
                    return [];
                }
            }

            const out = execSync(`git log --format=%H%x1f%P%x1f%s ${baseRev}..${compRev}`, {
                cwd,
                maxBuffer: 1024 * 1024,
            }).toString();
            const commits = parseCommitLines(out);
            if (commits.length > 1) {
                return commits;
            }

            let fallbackCommits = commits;
            if (compRev) {
                const fallbackOut = execSync(`git log --format=%H%x1f%P%x1f%s -n 20 ${compRev}`, {
                    cwd,
                    maxBuffer: 1024 * 1024,
                }).toString();
                fallbackCommits = parseCommitLines(fallbackOut);
            }

            if (!fallbackCommits.length && compRev) {
                const fallback = getCommitMeta(cwd, compRev);
                if (fallback.hash) {
                    fallbackCommits.push({ hash: fallback.hash, parents: [], message: fallback.message || '' });
                }
            }

            return fallbackCommits;
        } catch (err) {
            return [];
        }
    };

    const getCommitListForRange = (cwd, rangeRef) => {
        if (!rangeRef) return [];
        try {
            const out = execSync(`git log --format=%H%x1f%P%x1f%s ${rangeRef}`, {
                cwd,
                maxBuffer: 1024 * 1024,
            }).toString();
            const lines = out.split(/\r?\n/).filter(Boolean);
            return lines.map((line) => {
                const [hash = '', parentsRaw = '', message = ''] = line.split('\x1f');
                const parents = parentsRaw ? parentsRaw.split(' ').filter(Boolean) : [];
                return { hash, parents, message };
            }).filter((commit) => commit.hash);
        } catch (err) {
            return [];
        }
    };

/* ---------- New diff page ---------- */
    app.get("/:repoName/diff", async (req, res) => {
        const { repoName } = req.params;
        const sessionId = resolveSessionId(req) || getSessionIdFromRequest(req);
        const { baseRev, compRev } = req.query;
        const comparisonPromptLine = extractComparisonPromptLine(req.query.userPrompt || "");
        let diffOutput = "";
        const repoCfg = loadSingleRepoConfig(repoName, sessionId);
        if (!repoCfg) {
            return res.status(400).send(`Repository '${repoName}' not found.`);
        }
        const { gitRepoLocalPath } = repoCfg;

        if (baseRev && compRev) {
            try {
                diffOutput = execSync(`git diff ${baseRev} ${compRev}`, {
                    cwd: gitRepoLocalPath,
                    maxBuffer: 1024 * 1024 * 10,
                }).toString();
            } catch (err) {
                diffOutput = `[ERROR] Failed to run git diff ${baseRev} ${compRev}\n\n${err}`;
            }
        }

        const structuredDiff = parseUnifiedDiff(diffOutput);

        const baseMeta = baseRev ? getCommitMeta(gitRepoLocalPath, baseRev) : { hash: "", authorName: "", authorEmail: "", message: "", fullMessage: "" };
        const compMeta = compRev ? getCommitMeta(gitRepoLocalPath, compRev) : { hash: "", authorName: "", authorEmail: "", message: "", fullMessage: "" };
        const commitList = getCommitList(gitRepoLocalPath, baseRev, compRev);

        const mergeReady = isTruthyFlag(req.query.mergeReady);

        const editorTarget = resolveEditorTargetForProjectDir(gitRepoLocalPath, sessionId);
        const chatNumber = editorTarget && editorTarget.chatNumber ? editorTarget.chatNumber : "";
        const comparisonFinalOutput = await extractFinalOutputForCommit(
            sessionId,
            gitRepoLocalPath,
            compMeta.hash || compRev
        );

        res.render("diff", {
            gitRepoNameCLI: repoName,
            baseRev: baseRev || "",
            compRev: compRev || "",
            diffOutput,
            structuredDiff,
            debugMode: !!process.env.DEBUG,
            environment: res.locals.environment,
            editorBaseUrl: res.locals.editorBaseUrl,
            diffFormAction: `/${repoName}/diff`,
            repoLinksEnabled: true,
            projectDir: gitRepoLocalPath,
            errorMessage: "",
            baseMeta,
            compMeta,
            commitList,
            mergeReady,
            comparisonPromptLine,
            comparisonFinalOutput,
            chatNumber,
            showCommitList: SHOW_COMMIT_LIST
        });
    });
}

module.exports = { setupGetRoutes };
