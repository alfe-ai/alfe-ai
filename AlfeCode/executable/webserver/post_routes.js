const os = require("os");
const path = require("path");
const fs = require("fs");
const { execSync, spawn } = require("child_process");
const crypto = require("crypto");
const rdsStore = require("../../rds_store");

/**
 * setupPostRoutes attaches all POST routes to the Express app.
 * All external helpers, constants and singletons are injected so that
 * post_routes.js has zero hidden dependencies and works after refactor.
 *
 * @param {object} deps – injected dependencies
 */
function setupPostRoutes(deps) {
    const {
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
        ensureSessionDefaultRepo,
        buildSessionCookie,
    } = deps;

    const codexModelPattern = CODEX_MODEL_PATTERN instanceof RegExp
        ? CODEX_MODEL_PATTERN
        : /^[A-Za-z0-9._:+-]+(?:\/[A-Za-z0-9._:+-]+)*$/;

    const MAX_STATUS_HISTORY = 200;
    // Historically Sterling created run snapshots under `/git/sterling` with
    // directory names like `,,,-123456`. More recent tooling (run_codex.sh)
    // creates snapshot dirs using `<repo>-<timestamp>` or names that include
    // `sterlingcodex`. Accept a broader set of temporary directory patterns
    // so cleanupSterlingTempDir can remove leftovers from older and newer
    // snapshot naming schemes.
    const STERLING_TEMP_BASE = path.resolve("/git/sterling");
    const STERLING_TEMP_DIR_PATTERN = /^(?:,,,-\d{6,}|sterlingcodex[_-]?.+|.+-\d{10,})$/i;

    const TRUTHY_ENV_VALUES = ["1", "true", "yes", "on"];
    const FALSY_ENV_VALUES = ["0", "false", "no", "off"];
    const isTruthyEnvValue = (value) => {
        return (
            typeof value === "string"
            && TRUTHY_ENV_VALUES.includes(value.trim().toLowerCase())
        );
    };
    const normalizeBooleanEnvValue = (value) => {
        if (typeof value !== "string") {
            return value;
        }
        return value.replace(/\s[#;].*$/, "").trim().toLowerCase();
    };
    const parseBooleanEnvWithDefault = (value, defaultValue) => {
        if (typeof value === "undefined") {
            return defaultValue;
        }
        if (typeof value === "boolean") {
            return value;
        }
        if (typeof value === "number") {
            return value === 1;
        }
        if (typeof value === "string") {
            const normalized = normalizeBooleanEnvValue(value);
            if (TRUTHY_ENV_VALUES.includes(normalized)) {
                return true;
            }
            if (FALSY_ENV_VALUES.includes(normalized)) {
                return false;
            }
        }
        return defaultValue;
    };
    const MERGE_TEMP_CLEANUP_ENABLED = isTruthyEnvValue(process.env.STERLING_MERGE_CLEANUP_ENABLED);
    const accountsEnabled = parseBooleanEnvWithDefault(process.env.ACCOUNTS_ENABLED, true);
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

    const normalizeAccountEmail = (value) => (typeof value === "string" ? value.trim().toLowerCase() : "");
    const hashPassword = (password) => {
        const salt = crypto.randomBytes(16).toString("hex");
        const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, "sha256").toString("hex");
        return `${salt}$${hash}`;
    };
    const verifyPassword = (password, storedHash) => {
        if (!password || !storedHash) return false;
        const [salt, hash] = storedHash.split("$");
        if (!salt || !hash) return false;
        const computed = crypto.pbkdf2Sync(password, salt, 10000, 64, "sha256").toString("hex");
        try {
            return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(computed, "hex"));
        } catch (error) {
            return false;
        }
    };
    const base32ToBuffer = (input) => {
        if (!input) return Buffer.alloc(0);
        const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
        const cleaned = input.toUpperCase().replace(/=+$/, "").replace(/[^A-Z2-7]/g, "");
        let bits = "";
        for (const char of cleaned) {
            const idx = alphabet.indexOf(char);
            if (idx === -1) continue;
            bits += idx.toString(2).padStart(5, "0");
        }
        const bytes = [];
        for (let i = 0; i + 8 <= bits.length; i += 8) {
            bytes.push(parseInt(bits.slice(i, i + 8), 2));
        }
        return Buffer.from(bytes);
    };
    const verifyTotpToken = ({ secret, token, window = 1, step = 30, digits = 6 } = {}) => {
        if (!secret || !token) return false;
        const key = base32ToBuffer(secret);
        if (!key.length) return false;
        const counter = Math.floor(Date.now() / 1000 / step);
        const tokenValue = token.trim();
        for (let offset = -window; offset <= window; offset += 1) {
            const msg = Buffer.alloc(8);
            const counterValue = counter + offset;
            msg.writeUInt32BE(Math.floor(counterValue / 0x100000000), 0);
            msg.writeUInt32BE(counterValue % 0x100000000, 4);
            const hmac = crypto.createHmac("sha1", key).update(msg).digest();
            const offsetBits = hmac[hmac.length - 1] & 0xf;
            const code = ((hmac[offsetBits] & 0x7f) << 24)
                | ((hmac[offsetBits + 1] & 0xff) << 16)
                | ((hmac[offsetBits + 2] & 0xff) << 8)
                | (hmac[offsetBits + 3] & 0xff);
            const otp = (code % (10 ** digits)).toString().padStart(digits, "0");
            if (otp === tokenValue) {
                return true;
            }
        }
        return false;
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
    const isLoggedOutPlan = (plan) => {
        if (!plan) {
            return false;
        }
        return plan.toString().trim().toLowerCase().replace(/[-\s]+/g, " ") === "logged out session";
    };
    const getShowLoggedOutMessage = async (req) => {
        if (!rdsStore?.enabled) {
            return false;
        }
        const sessionId = resolveSessionId(req) || getSessionIdFromRequest(req);
        if (!sessionId) {
            return true;
        }
        try {
            const account = await rdsStore.getAccountBySession(sessionId);
            return !account || isLoggedOutPlan(account.plan);
        } catch (error) {
            console.warn("[WARN] Failed to check account session:", error);
            return false;
        }
    };
    const getShowSubscribeMessage = async (req) => {
        if (!rdsStore?.enabled) {
            return false;
        }
        const sessionId = resolveSessionId(req) || getSessionIdFromRequest(req);
        if (!sessionId) {
            return false;
        }
        try {
            const account = await rdsStore.getAccountBySession(sessionId);
            if (!account || isLoggedOutPlan(account.plan)) {
                return false;
            }
            return account.plan === "Free";
        } catch (error) {
            console.warn("[WARN] Failed to check account session:", error);
            return false;
        }
    };
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
    const normalizeHostname = (req) => {
        const header = req.hostname || req.get("host") || "";
        return header.split(":")[0].toLowerCase();
    };
    const buildExpiredSessionCookie = (hostname) => {
        const parts = [
            "sessionId=",
            "Path=/",
            "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
            "Max-Age=0",
        ];
        if (hostname === "alfe.sh" || hostname.endsWith(".alfe.sh")) {
            parts.push("Domain=.alfe.sh");
        }
        return parts.join("; ");
    };
    const ACCOUNT_PLANS = new Set(["Logged-out Session", "Free", "Lite", "Plus", "Pro"]);

    app.post("/api/account/exists", async (req, res) => {
        const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
        if (!email) {
            return res.status(400).json({ error: "Email required." });
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ error: "Enter a valid email address." });
        }

        if (!accountsEnabled) {
            return res.status(403).json({ error: "Accounts are disabled on this server." });
        }
        if (!rdsStore.enabled) {
            return res.status(503).json({ error: "Registration is not configured on this server." });
        }

        const account = await rdsStore.getAccountByEmail(email);
        return res.json({ exists: !!account });
    });

    app.post("/api/account/plan", async (req, res) => {
        if (!rdsStore?.enabled) {
            return res.status(503).json({ error: "Account update is not configured on this server." });
        }
        if (!isIpAllowed(getRequestIp(req), configIpWhitelist)) {
            return res.status(403).json({ error: "Plan changes are restricted to whitelisted IP addresses." });
        }
        const sessionId = getSessionIdFromRequest(req);
        if (!sessionId) {
            return res.status(401).json({ error: "not logged in" });
        }
        const plan = typeof req.body?.plan === "string" ? req.body.plan.trim() : "";
        if (!ACCOUNT_PLANS.has(plan)) {
            return res.status(400).json({ error: "Invalid plan selection." });
        }
        const account = await rdsStore.getAccountBySession(sessionId);
        if (!account) {
            return res.status(401).json({ error: "not logged in" });
        }
        await rdsStore.setAccountPlan(account.id, plan);
        return res.json({ success: true, plan });
    });

    app.post("/api/account/ever-subscribed", async (req, res) => {
        if (!rdsStore?.enabled) {
            return res.status(503).json({ error: "Account update is not configured on this server." });
        }
        const sessionId = getSessionIdFromRequest(req);
        if (!sessionId) {
            return res.status(401).json({ error: "not logged in" });
        }
        const rawValue = req.body?.everSubscribed;
        let everSubscribed = false;
        if (typeof rawValue === "boolean") {
            everSubscribed = rawValue;
        } else if (typeof rawValue === "string") {
            const normalized = rawValue.trim().toLowerCase();
            if (normalized === "true" || normalized === "1") {
                everSubscribed = true;
            } else if (normalized === "false" || normalized === "0") {
                everSubscribed = false;
            } else {
                return res.status(400).json({ error: "Invalid ever subscribed selection." });
            }
        } else if (typeof rawValue === "number") {
            if (rawValue === 1) {
                everSubscribed = true;
            } else if (rawValue === 0) {
                everSubscribed = false;
            } else {
                return res.status(400).json({ error: "Invalid ever subscribed selection." });
            }
        } else if (typeof rawValue !== "undefined") {
            return res.status(400).json({ error: "Invalid ever subscribed selection." });
        }
        const account = await rdsStore.getAccountBySession(sessionId);
        if (!account) {
            return res.status(401).json({ error: "not logged in" });
        }
        await rdsStore.setAccountEverSubscribed(account.id, everSubscribed);
        return res.json({ success: true, everSubscribed });
    });


    app.post("/api/account/openrouter-key", async (req, res) => {
        if (!rdsStore?.enabled) {
            return res.status(503).json({ error: "Account update is not configured on this server." });
        }
        if (!isIpAllowed(getRequestIp(req), configIpWhitelist)) {
            return res.status(403).json({ error: "Openrouter key updates are restricted to whitelisted IP addresses." });
        }
        const sessionId = getSessionIdFromRequest(req);
        if (!sessionId) {
            return res.status(401).json({ error: "not logged in" });
        }
        const openrouterApiKey = typeof req.body?.openrouterApiKey === "string"
            ? req.body.openrouterApiKey.trim()
            : "";
        const account = await rdsStore.getAccountBySession(sessionId);
        if (!account) {
            return res.status(401).json({ error: "not logged in" });
        }
        await rdsStore.setAccountOpenrouterApiKey(account.id, openrouterApiKey);
        return res.json({ success: true, openrouterApiKey });
    });
    app.post("/api/support", async (req, res) => {
        if (!rdsStore?.enabled) {
            return res.status(503).json({ error: "Support requests are not configured on this server." });
        }
        const category = typeof req.body?.category === "string" ? req.body.category.trim() : "";
        const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
        if (!category) {
            return res.status(400).json({ error: "Support category is required." });
        }
        if (!message) {
            return res.status(400).json({ error: "Support message is required." });
        }
        if (message.length > 4000) {
            return res.status(400).json({ error: "Support message is too long." });
        }
        const sessionId = getSessionIdFromRequest(req);
        const account = sessionId ? await rdsStore.getAccountBySession(sessionId) : null;
        const userAgent = typeof req.get === "function" ? req.get("user-agent") || "" : "";
        const isBugReport = category === "Bug Report";
        const isFeatureRequest = category === "New Feature Request";
        const status = isBugReport
            ? "Bug Report Submitted"
            : isFeatureRequest
                ? "Feature Request Submitted"
                : undefined;
        const request = await rdsStore.createSupportRequest({
            sessionId,
            accountId: account?.id,
            email: account?.email,
            category,
            message,
            userAgent,
            status,
        });
        if (!request) {
            return res.status(500).json({ error: "Unable to create support request." });
        }
        if (isBugReport || isFeatureRequest) {
            await rdsStore.createSupportRequestReply({
                requestId: request.id,
                role: "admin",
                message: isBugReport
                    ? "Thank you for submitting a bug report. Support will not reply to all received bug reports."
                    : "Thank you for submitting a feature request. Support will not reply to all received feature requests.",
            });
        }
        return res.json({ success: true, requestId: request.id });
    });

    app.post("/api/support/requests/:id/replies", async (req, res) => {
        if (!rdsStore?.enabled) {
            return res.status(503).json({ error: "Support requests are not configured on this server." });
        }
        const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
        if (!message) {
            return res.status(400).json({ error: "Support reply message is required." });
        }
        if (message.length > 4000) {
            return res.status(400).json({ error: "Support reply message is too long." });
        }
        const role = typeof req.body?.role === "string" ? req.body.role.trim().toLowerCase() : "user";
        const requestId = req.params?.id;
        let request = null;
        if (role === "admin") {
            const requestIp = getRequestIp(req);
            if (!isIpAllowed(requestIp, configIpWhitelist)) {
                return res.status(403).json({ error: "Admin reply is not allowed from this IP." });
            }
            request = await rdsStore.getSupportRequestByIdForAdmin({ requestId });
            if (!request) {
                return res.status(404).json({ error: "Support request not found." });
            }
        } else {
            const sessionId = getSessionIdFromRequest(req);
            if (!sessionId) {
                return res.status(401).json({ error: "not logged in" });
            }
            const account = await rdsStore.getAccountBySession(sessionId);
            request = await rdsStore.getSupportRequestById({
                requestId,
                sessionId,
                accountId: account?.id,
            });
            if (!request) {
                return res.status(404).json({ error: "Support request not found." });
            }
        }
        const reply = await rdsStore.createSupportRequestReply({
            requestId,
            role: role === "admin" ? "admin" : "user",
            message,
        });
        if (!reply) {
            return res.status(500).json({ error: "Unable to create support reply." });
        }
        const isBugReport = request?.category === "Bug Report";
        const isFeatureRequest = request?.category === "New Feature Request";
        if (role === "admin") {
            await rdsStore.markSupportRequestReplied({ requestId });
        } else if (isBugReport || isFeatureRequest) {
            await rdsStore.createSupportRequestReply({
                requestId,
                role: "admin",
                message: isBugReport
                    ? "Thank you for submitting a bug report. Support will not reply to all received bug reports."
                    : "Thank you for submitting a feature request. Support will not reply to all received feature requests.",
            });
        }
        return res.json({ success: true, reply });
    });

    app.post("/api/logout", async (req, res) => {
        const sessionId = getSessionIdFromRequest(req);
        if (rdsStore?.enabled && sessionId) {
            const account = await rdsStore.getAccountBySession(sessionId);
            if (account) {
                await rdsStore.setAccountSession(account.id, "");
            }
        }
        const hostname = normalizeHostname(req);
        res.append("Set-Cookie", buildExpiredSessionCookie(hostname));
        return res.json({ success: true });
    });

    app.post("/api/session/refresh", async (req, res) => {
        if (!isIpAllowed(getRequestIp(req), configIpWhitelist)) {
            return res.status(403).json({ error: "Session refresh is restricted to whitelisted IP addresses." });
        }
        const currentSessionId = getSessionIdFromRequest(req);
        if (rdsStore?.enabled && currentSessionId) {
            const account = await rdsStore.getAccountBySession(currentSessionId);
            if (account) {
                await rdsStore.setAccountSession(account.id, "");
            }
        }
        const freshSessionId = crypto.randomUUID();
        try {
            const hostname = normalizeHostname(req);
            const cookie = buildSessionCookie(freshSessionId, hostname);
            res.append("Set-Cookie", cookie);
        } catch (error) {
            console.error(`Failed to issue session cookie for refreshed session: ${error?.message || error}`);
        }
        try {
            if (typeof ensureSessionDefaultRepo === "function") {
                ensureSessionDefaultRepo(freshSessionId);
            }
        } catch (error) {
            console.error(`Failed to initialize default repo for refreshed session: ${error?.message || error}`);
        }
        return res.json({ success: true, sessionId: freshSessionId });
    });

    app.post("/api/usage/reset", (req, res) => {
        if (!isIpAllowed(getRequestIp(req), configIpWhitelist)) {
            return res.status(403).json({ error: "Usage reset is restricted to whitelisted IP addresses." });
        }
        return res.json({ success: true });
    });

    app.post("/api/register", async (req, res) => {
        console.log("[AlfeCode][register] request received", {
            hasBody: !!req.body,
            bodyKeys: req.body && typeof req.body === "object" ? Object.keys(req.body) : [],
        });

        const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
        const password = typeof req.body?.password === "string" ? req.body.password : "";
        const sessionId = typeof req.body?.sessionId === "string" ? req.body.sessionId.trim() : "";

        console.log("[AlfeCode][register] parsed payload", {
            emailProvided: !!email,
            passwordProvided: !!password,
            passwordLength: password ? password.length : 0,
            hasSessionId: typeof req.body?.sessionId === "string" && req.body.sessionId.trim().length > 0,
        });

        if (!email) {
            console.log("[AlfeCode][register] validation failed: email missing");
            return res.status(400).json({ error: "Email required." });
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            console.log("[AlfeCode][register] validation failed: invalid email format", { email });
            return res.status(400).json({ error: "Enter a valid email address." });
        }

        if (!password) {
            console.log("[AlfeCode][register] validation failed: password missing");
            return res.status(400).json({ error: "Password required." });
        }

        const MIN_PASSWORD_LENGTH = 8;
        if (password.length < MIN_PASSWORD_LENGTH) {
            console.log("[AlfeCode][register] validation failed: password too short", {
                length: password.length,
                required: MIN_PASSWORD_LENGTH,
            });
            return res.status(400).json({
                error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
            });
        }

        if (!accountsEnabled) {
            console.log("[AlfeCode][register] registration unavailable (accounts disabled).");
            return res.status(403).json({
                error: "Accounts are disabled on this server.",
                success: false,
            });
        }
        if (!rdsStore.enabled) {
            console.log("[AlfeCode][register] registration unavailable (RDS not configured).");
            return res.status(503).json({
                error: "Registration is not configured on this server.",
                success: false,
            });
        }

        if (await rdsStore.getAccountByEmail(email)) {
            return res.status(400).json({ error: "Account already exists." });
        }

        const passwordHash = hashPassword(password);
        const normalizedEmail = normalizeAccountEmail(email);

        try {
            await rdsStore.createAccount({
                email: normalizedEmail,
                passwordHash,
                sessionId,
            });
        } catch (error) {
            console.error("[AlfeCode][register] failed to create account", error);
            return res.status(500).json({ error: "Failed to create account." });
        }

        return res.json({
            success: true,
            email: normalizedEmail,
        });
    });

    app.post("/api/login", async (req, res) => {
        console.log("[AlfeCode][login] request received", {
            hasBody: !!req.body,
            bodyKeys: req.body && typeof req.body === "object" ? Object.keys(req.body) : [],
        });

        if (!accountsEnabled) {
            return res.status(403).json({ error: "Accounts are disabled on this server." });
        }
        if (!rdsStore.enabled) {
            return res.status(503).json({ error: "Login is not configured on this server." });
        }

        const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
        const password = typeof req.body?.password === "string" ? req.body.password : "";
        const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
        let sessionId = typeof req.body?.sessionId === "string" ? req.body.sessionId.trim() : "";
        if (!sessionId) {
            sessionId = getSessionIdFromRequest(req);
        }

        if (!email || !password) {
            return res.status(400).json({ error: "email and password required" });
        }

        const account = await rdsStore.getAccountByEmail(email);
        if (!account || !verifyPassword(password, account.password_hash)) {
            return res.status(400).json({ error: "invalid credentials" });
        }
        if (account.disabled) {
            return res.status(403).json({ error: "account disabled" });
        }

        const disable2fa = process.env.DISABLE_2FA === "true" || process.env.DISABLE_2FA === "1";
        if (account.totp_secret && !disable2fa) {
            if (!token) {
                return res.status(400).json({ error: "totp required" });
            }
            const ok = verifyTotpToken({
                secret: account.totp_secret,
                token,
                window: 1,
            });
            if (!ok) {
                return res.status(400).json({ error: "invalid totp" });
            }
        }

        let resolvedSessionId = sessionId;
        if (account.session_id) {
            resolvedSessionId = account.session_id;
            if (sessionId && account.session_id !== sessionId) {
                await rdsStore.mergeSessions(account.session_id, sessionId);
            }
        } else if (sessionId) {
            await rdsStore.setAccountSession(account.id, sessionId);
        }

        if (resolvedSessionId) {
            const hostname = req.hostname
                || (typeof req.headers?.host === "string" ? req.headers.host.split(":")[0] : "");
            const cookie = buildSessionCookie(resolvedSessionId, hostname);
            if (cookie) {
                res.append("Set-Cookie", cookie);
            }
        }

        return res.json({
            success: true,
            id: account.id,
            email: account.email,
            plan: account.plan,
            timezone: account.timezone,
            sessionId: resolvedSessionId,
        });
    });

    const normaliseRunId = (value) => (typeof value === "string" ? value.trim() : "");
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
    const normalizeRepoUrlForClone = (value) => {
        const trimmed = typeof value === "string" ? value.trim() : "";
        if (!trimmed) {
            return trimmed;
        }

        if (/^(?:git@|git\+ssh:\/\/git@|ssh:\/\/)/i.test(trimmed)) {
            return trimmed;
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
            if (hostname !== "github.com") {
                return trimmed;
            }

            const segments = parsed.pathname.split("/").filter(Boolean);
            if (segments.length < 2) {
                return trimmed;
            }

            const owner = segments[0];
            const repo = segments[1].replace(/\.git$/i, "");
            if (!owner || !repo) {
                return trimmed;
            }

            return `https://github.com/${owner}/${repo}.git`;
        } catch (error) {
            return trimmed;
        }
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

    const appendStatusEntries = (history, entries, limit) => {
        const next = Array.isArray(history) ? [...history] : [];
        if (!Array.isArray(entries)) {
            return next;
        }
        entries.forEach((rawEntry) => {
            if (rawEntry === undefined || rawEntry === null) {
                return;
            }
            const entryString = typeof rawEntry === "string" ? rawEntry : String(rawEntry);
            const trimmed = entryString.trim();
            if (!trimmed) {
                return;
            }
            next.push(trimmed);
            if (limit && limit > 0 && next.length > limit) {
                next.splice(0, next.length - limit);
            }
        });
        return next;
    };

    const ensureGithubSshKey = () => {
        const sshDir = path.join(os.homedir(), ".ssh");
        const keyName = "alfe-ai";
        const privateKeyPath = path.join(sshDir, keyName);
        const publicKeyPath = `${privateKeyPath}.pub`;
        const configPath = path.join(sshDir, "config");

        if (!fs.existsSync(sshDir)) {
            fs.mkdirSync(sshDir, { recursive: true, mode: 0o700 });
        }

        let created = false;
        if (!fs.existsSync(privateKeyPath) || !fs.existsSync(publicKeyPath)) {
            execSync(`ssh-keygen -t ed25519 -f "${privateKeyPath}" -N "" -C "alfe-ai"`);
            created = true;
        }

        const publicKey = fs.readFileSync(publicKeyPath, "utf8").trim();
        const sshConfigEntry = [
            "Host github.com",
            "  HostName github.com",
            `  IdentityFile ${privateKeyPath}`,
            "  IdentitiesOnly yes",
            "",
        ].join("\n");
        if (!fs.existsSync(configPath)) {
            fs.writeFileSync(configPath, sshConfigEntry, { mode: 0o600 });
        } else {
            const configContents = fs.readFileSync(configPath, "utf8");
            if (!configContents.includes(privateKeyPath)) {
                fs.appendFileSync(configPath, `\n${sshConfigEntry}`);
            }
        }

        let addedToAgent = false;
        if (process.env.SSH_AUTH_SOCK) {
            try {
                execSync(`ssh-add "${privateKeyPath}"`);
                addedToAgent = true;
            } catch (error) {
                console.warn(`[WARN] Unable to add SSH key to agent: ${error.message}`);
            }
        }

        return {
            publicKey,
            created,
            addedToAgent,
            privateKeyPath,
            publicKeyPath,
        };
    };

    const persistMergeOutcomeToRun = ({ sessionId, runId, exitCode, message, stdout, stderr }) => {
        if (typeof upsertCodexRun !== "function") {
            return;
        }

        const normalisedRunId = normaliseRunId(runId);
        if (!normalisedRunId) {
            return;
        }

        let existingRun = null;
        if (typeof loadCodexRuns === "function") {
            try {
                const runs = loadCodexRuns(sessionId);
                if (Array.isArray(runs)) {
                    existingRun = runs.find((entry) => entry && entry.id === normalisedRunId);
                }
            } catch (error) {
                console.error(`[WARN] Failed to load Agent runs for merge outcome: ${error.message}`);
            }
        }

        if (!existingRun) {
            console.warn(`[WARN] Unable to persist merge outcome: run '${normalisedRunId}' not found.`);
            return;
        }

        const defaultStatusMessage = `git_merge_parent.sh exited with code ${exitCode}.`;
        const rawMessage =
            message === undefined || message === null
                ? ""
                : typeof message === "string"
                    ? message
                    : String(message);

        const statusEntries = [];
        if (rawMessage && rawMessage.trim() && rawMessage.trim() !== defaultStatusMessage) {
            statusEntries.push(rawMessage.trim());
        }
        statusEntries.push(defaultStatusMessage);

        const nextStatusHistory = appendStatusEntries(
            existingRun.statusHistory,
            statusEntries,
            MAX_STATUS_HISTORY,
        );

        const updatePayload = {
            id: normalisedRunId,
            gitMergeExitCode: exitCode,
            gitMergeExit: exitCode,
            git_merge_parent_exit_code: exitCode,
            statusHistory: nextStatusHistory,
        };

        if (stdout) {
            updatePayload.gitMergeStdout = stdout;
        }
        if (stderr) {
            updatePayload.gitMergeStderr = stderr;
        }

        try {
            upsertCodexRun(sessionId, updatePayload);
        } catch (error) {
            console.error(`[WARN] Failed to persist merge outcome for run '${normalisedRunId}': ${error.message}`);
        }
    };

    const cleanupSterlingTempDir = (targetPath) => {
        if (!MERGE_TEMP_CLEANUP_ENABLED) {
            return;
        }

        if (!targetPath) {
            return;
        }

        try {
            const resolvedTarget = path.resolve(targetPath);
            if (
                resolvedTarget !== STERLING_TEMP_BASE
                && !resolvedTarget.startsWith(STERLING_TEMP_BASE + path.sep)
            ) {
                return;
            }

            const relative = path.relative(STERLING_TEMP_BASE, resolvedTarget);
            if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
                return;
            }

            const [firstSegment] = relative.split(path.sep);
            if (!firstSegment || !STERLING_TEMP_DIR_PATTERN.test(firstSegment)) {
                // Nothing to clean here — not a recognised Sterling temp dir
                return;
            }

            const tempDir = path.join(STERLING_TEMP_BASE, firstSegment);
            if (!fs.existsSync(tempDir)) {
                return;
            }

            fs.rmSync(tempDir, { recursive: true, force: true });
            console.log(`[INFO] Removed Sterling temp directory: ${tempDir}`);
        } catch (error) {
            console.warn(`[WARN] Failed to remove Sterling temp directory: ${error.message}`);
        }
    };

    const resolveSessionId = (req) =>
        (req && req.sessionId)
            || (req && req.body && req.body.sessionId)
            || (req && req.query && req.query.sessionId)
            || "";

    /* ---------- File summarizer ---------- */
    app.post("/file_summarizer/summarize", upload.single("file"), async (req, res) => {
        if (!req.file) {
            return res.status(400).json({ error: "Please upload a file to summarize." });
        }

        const providerRaw = normalizeProviderName(req.body.aiProvider || "openrouter");
        const modelRaw = (req.body.aiModel || DEFAULT_AIMODEL || "").toString().trim();
        if (!modelRaw) {
            return res.status(400).json({ error: "A model selection is required." });
        }

        const openaiClient = getOpenAIClient(providerRaw);
        if (!openaiClient) {
            return res.status(400).json({
                error: `AI provider '${providerRaw}' is not configured. Please supply the required API key.`,
            });
        }

        const filePath = req.file.path;
        let fileContent = "";
        try {
            fileContent = fs.readFileSync(filePath, "utf-8");
        } catch (err) {
            await fs.promises.unlink(filePath).catch(() => {});
            console.error("[ERROR] Failed to read uploaded file for summarization:", err);
            return res.status(500).json({ error: "Unable to read the uploaded file." });
        }

        await fs.promises.unlink(filePath).catch(() => {});

        const MAX_CONTENT_LENGTH = 120000; // ~120 KB of text
        let truncated = false;
        if (fileContent.length > MAX_CONTENT_LENGTH) {
            fileContent = fileContent.slice(0, MAX_CONTENT_LENGTH);
            truncated = true;
        }

        const summarizerPrompt = [
            {
                role: "system",
                content:
                    "You are an expert software analyst. Summarize the provided file with focus on purpose, architecture, and key data or control flows. " +
                    "List all important function, class, and variable definitions with concise explanations. Do not quote the entire code or include long comment blocks. " +
                    "Highlight noteworthy dependencies or patterns if present.",
            },
            {
                role: "user",
                content:
                    `File name: ${req.file.originalname}\n` +
                    (truncated
                        ? "[Note: The file exceeded the maximum length; content truncated for analysis.]\n\n"
                        : "") +
                    "File content:\n" +
                    fileContent,
            },
        ];

        try {
            const response = await openaiClient.chat.completions.create({
                model: modelRaw,
                temperature: 0.2,
                messages: summarizerPrompt,
            });

            const summary = response?.choices?.[0]?.message?.content?.trim();
            if (!summary) {
                throw new Error("No summary returned from provider");
            }

            return res.json({
                summary,
                truncated,
            });
        } catch (error) {
            console.error("[ERROR] /file_summarizer/summarize:", error);
            return res.status(500).json({ error: "Failed to generate summary. Check provider configuration." });
        }
    });



    // Archive a run
    app.post('/agent/run/:runId/archive', (req, res) => {
        const sessionId = resolveSessionId(req);
        const runId = normaliseRunId(req.params && req.params.runId ? req.params.runId : '');
        if (!runId) {
            return res.status(400).json({ error: 'Run id is required.' });
        }
        try {
            if (typeof upsertCodexRun === 'function') {
                upsertCodexRun(sessionId, { id: runId, archived: 1, archivedAt: new Date().toISOString() });
            }
            return res.json({ ok: true });
        } catch (error) {
            console.error('[WARN] Failed to archive run', error);
            return res.status(500).json({ error: 'Failed to archive run.' });
        }
    });

    // Archive all runs (optionally filtered by repo directory)
    app.post('/agent/runs/archive-all', (req, res) => {
        const sessionId = resolveSessionId(req);
        const repoDirectoryFilter = (req.body?.repo_directory || req.query?.repo_directory || "").toString().trim();
        let runs = [];
        try {
            const loaded = typeof loadCodexRuns === "function" ? loadCodexRuns(sessionId) : [];
            runs = Array.isArray(loaded) ? loaded : [];
        } catch (error) {
            console.error("[WARN] Failed to load runs for archive-all", error);
            runs = [];
        }

        let filteredRuns = runs;
        if (repoDirectoryFilter) {
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
                matches = matchRuns(filteredRuns, { allowLowerOnly: true });
            }

            if (!matches.length) {
                const normalizedFilterLower =
                    (normaliseProjectDir(repoDirectoryFilter) || repoDirectoryFilter || "").toLowerCase();
                if (normalizedFilterLower) {
                    matches = filteredRuns.filter((run) => {
                        const candidates = [
                            normaliseProjectDir(run?.projectDir),
                            normaliseProjectDir(run?.effectiveProjectDir),
                            normaliseProjectDir(run?.requestedProjectDir),
                        ].filter(Boolean);
                        return candidates.some((candidate) => candidate.toLowerCase().includes(normalizedFilterLower));
                    });
                }
            }

            if (matches.length) {
                filteredRuns = matches;
            }
        }

        try {
            const archivedAt = new Date().toISOString();
            let archivedCount = 0;
            filteredRuns.forEach((run) => {
                const runId = normaliseRunId(run?.id || "");
                if (!runId || run?.archived) {
                    return;
                }
                if (typeof upsertCodexRun === "function") {
                    upsertCodexRun(sessionId, { id: runId, archived: 1, archivedAt });
                    archivedCount += 1;
                }
            });
            return res.json({ ok: true, archived: archivedCount });
        } catch (error) {
            console.error("[WARN] Failed to archive all runs", error);
            return res.status(500).json({ error: "Failed to archive all runs." });
        }
    });

    // Unarchive a run
    app.post('/agent/run/:runId/unarchive', (req, res) => {
        const sessionId = resolveSessionId(req);
        const runId = normaliseRunId(req.params && req.params.runId ? req.params.runId : '');
        if (!runId) {
            return res.status(400).json({ error: 'Run id is required.' });
        }
        try {
            if (typeof upsertCodexRun === 'function') {
                upsertCodexRun(sessionId, { id: runId, archived: 0, archivedAt: null });
            }
            return res.json({ ok: true });
        } catch (error) {
            console.error('[WARN] Failed to unarchive run', error);
            return res.status(500).json({ error: 'Failed to unarchive run.' });
        }

    // Delete local checkout for a run
    app.post('/agent/run/:runId/delete-local', (req, res) => {
        const sessionId = resolveSessionId(req);
        const runId = normaliseRunId(req.params && req.params.runId ? req.params.runId : '');
        if (!runId) {
            return res.status(400).json({ error: 'Run id is required.' });
        }

        try {
            const runs = typeof loadCodexRuns === 'function' ? loadCodexRuns(sessionId) : [];
            const existingRun = Array.isArray(runs) ? runs.find((r) => r && r.id === runId) : null;
            let targetDir = '';
            if (existingRun) {
                targetDir = existingRun.effectiveProjectDir || existingRun.projectDir || existingRun.requestedProjectDir || '';
            }
            if (!targetDir && req.body && req.body.projectDir) {
                targetDir = req.body.projectDir.toString().trim();
            }

            if (!targetDir) {
                return res.status(400).json({ error: 'Project directory for this run is unknown.' });
            }

            const resolved = path.resolve(targetDir);
            const allowedBase = path.resolve('/git/sterling');
            if (!(resolved === allowedBase || resolved.startsWith(allowedBase + path.sep))) {
                return res.status(403).json({ error: 'Project directory not permitted for deletion.' });
            }

            if (!fs.existsSync(resolved)) {
                return res.status(404).json({ error: 'Project directory not found.' });
            }

            // Danger: remove directory
            fs.rmSync(resolved, { recursive: true, force: true });

            // Persist metadata on run
            if (typeof upsertCodexRun === 'function') {
                upsertCodexRun(sessionId, { id: runId, localDeleted: 1, localDeletedAt: new Date().toISOString() });
            }

            return res.json({ ok: true, deleted: resolved });
        } catch (error) {
            console.error('[WARN] Failed to delete local checkout', error);
            return res.status(500).json({ error: 'Failed to delete local checkout.' });
        }
    });

    });


    // Delete local checkout for a run (no runId provided)
    app.post('/agent/run/delete-local', (req, res) => {
        const sessionId = resolveSessionId(req);
        let targetDir = '';
        if (req.body && req.body.projectDir) {
            targetDir = String(req.body.projectDir).trim();
        }

        if (!targetDir) {
            return res.status(400).json({ error: 'Project directory is required.' });
        }

        try {
            const resolved = path.resolve(targetDir);
            const allowedBase = path.resolve('/git/sterling');
            if (!(resolved === allowedBase || resolved.startsWith(allowedBase + path.sep))) {
                return res.status(403).json({ error: 'Project directory not permitted for deletion.' });
            }

            if (!fs.existsSync(resolved)) {
                return res.status(404).json({ error: 'Project directory not found.' });
            }

            fs.rmSync(resolved, { recursive: true, force: true });

            return res.json({ ok: true, deleted: resolved });
        } catch (error) {
            console.error('[WARN] Failed to delete local checkout (no runId)', error);
            return res.status(500).json({ error: 'Failed to delete local checkout.' });
        }
    });

    /* ---------- Agent runner default model ---------- */
    app.post("/agent/default-model", (req, res) => {
        const incomingModel = req.body && Object.prototype.hasOwnProperty.call(req.body, "defaultModel")
            ? req.body.defaultModel
            : "";
        const rawModel = (incomingModel ?? "").toString().trim();
        if (!rawModel) {
            return res.status(400).json({ error: "Default model is required." });
        }

        if (!codexModelPattern.test(rawModel)) {
            return res.status(400).json({ error: "Default model contains unsupported characters." });
        }

        const sessionId = resolveSessionId(req) || getSessionIdFromRequest(req);
        const previousDefault = typeof resolveCodexModelForSession === "function"
            ? resolveCodexModelForSession(sessionId)
            : (typeof getSessionCodexModel === "function" ? (getSessionCodexModel(sessionId) || getDefaultCodexModel()) : getDefaultCodexModel());
        const savedModel = typeof setSessionCodexModel === "function"
            ? setSessionCodexModel(sessionId, rawModel)
            : rawModel;

        if (!savedModel) {
            return res.status(400).json({ error: "Default model is invalid." });
        }

        return res.json({
            defaultModel: savedModel,
            previousDefaultModel: previousDefault,
            fallbackDefaultModel: (typeof getDefaultCodexModel === "function" ? getDefaultCodexModel() : DEFAULT_CODEX_MODEL) || "",
            message: "Model updated",
        });
    });

    /* ---------- Agent runner instructions ---------- */
    app.post("/agent/agent-instructions", (req, res) => {
        const incoming = req.body && Object.prototype.hasOwnProperty.call(req.body, "agentInstructions")
            ? req.body.agentInstructions
            : "";

        const instructions = typeof incoming === "string" ? incoming : "";

        if (typeof saveCodexConfig !== "function" || typeof loadCodexConfig !== "function") {
            return res.status(500).json({ error: "Agent configuration storage is unavailable." });
        }

        try {
            const existingConfig = loadCodexConfig();
            const updatedConfig = {
                ...existingConfig,
                defaultAgentInstructions: instructions,
            };
            saveCodexConfig(updatedConfig);

            return res.json({
                agentInstructions: instructions,
                message: "Agent instructions updated.",
            });
        } catch (error) {
            console.error("[ERROR] /agent/agent-instructions:", error);
            return res.status(500).json({ error: "Failed to save Agent instructions." });
        }
    });

    /* ---------- /repositories/add ---------- */
    app.post("/repositories/add", (req, res) => {
        const { repoName, gitRepoURL, gitRepoLocalPath } = req.body;
        if (!repoName) {
            return res.status(400).send("Repository name is required.");
        }

        const sessionId = resolveSessionId(req);
        const repoConfig = loadRepoConfig(sessionId) || {};
        const normalizedGitRepoURL = normalizeRepoUrlForClone(gitRepoURL);

        function finalize(localPath) {
            repoConfig[repoName] = {
                gitRepoLocalPath: localPath,
                gitRepoURL: normalizedGitRepoURL || gitRepoURL || "",
                gitBranch: "main",
                openAIAccount: "",
            };
            saveRepoConfig(repoConfig, sessionId);
            const resolvedPath = typeof localPath === "string" ? localPath.trim() : "";
            if (resolvedPath) {
                const params = new URLSearchParams({
                    repo_directory: resolvedPath,
                    repo_name: repoName,
                });
                res.redirect(`/agent?${params.toString()}`);
                return;
            }
            res.redirect("/repositories");
        }

        if (gitRepoLocalPath) {
            if (!fs.existsSync(gitRepoLocalPath)) {
                return res.status(400).send("Local repository path does not exist.");
            }
            finalize(gitRepoLocalPath);
            return;
        }

        if (!gitRepoURL) {
            return res.status(400).send("Either repository URL or local path is required.");
        }

        cloneRepository(repoName, normalizedGitRepoURL || gitRepoURL, sessionId, async (err, localPath) => {
            if (err) {
                console.error("[ERROR] cloneRepository:", err);
                if (err.sshKeyRequired) {
                    const showCreateRepoLink = ["1", "true", "yes", "on"].includes(
                        (process.env.SHOW_NEW_REPOSITORY_LINK || "").toLowerCase(),
                    );
                    const showLoggedOutMessage = await getShowLoggedOutMessage(req);
                    const showSubscribeMessage = await getShowSubscribeMessage(req);
                    return res.status(400).render("add_repository", {
                        serverCWD: process.cwd(),
                        cloneError:
                            "Git SSH authentication failed. Add a Git SSH key to continue cloning.",
                        sshKeyRequired: true,
                        repoNameValue: repoName,
                        gitRepoURLValue: normalizedGitRepoURL || gitRepoURL,
                        showCreateRepoLink,
                        showLoggedOutMessage,
                        showSubscribeMessage,
                    });
                }
                return res.status(500).send("Failed to clone repository.");
            }
            finalize(localPath);
        });
    });

    /* ---------- /repositories/delete ---------- */
    app.post("/repositories/delete", (req, res) => {
        const { repoName } = req.body;
        if (!repoName) {
            return res.status(400).send("Repository name is required.");
        }

        const sessionId = resolveSessionId(req);
        const repoConfig = loadRepoConfig(sessionId) || {};
        const repoEntry = repoConfig[repoName];
        if (!repoEntry) {
            return res.redirect("/repositories");
        }
        if (repoEntry.isDemo) {
            return res.status(403).send("Demo repositories cannot be deleted.");
        }

        delete repoConfig[repoName];
        saveRepoConfig(repoConfig, sessionId);
        return res.redirect("/repositories");
    });

    /* ---------- /repositories/generate-ssh-key ---------- */
    app.post("/repositories/generate-ssh-key", (_req, res) => {
        try {
            const result = ensureGithubSshKey();
            return res.json({
                publicKey: result.publicKey,
                created: result.created,
                addedToAgent: result.addedToAgent,
            });
        } catch (error) {
            console.error("[ERROR] generate-ssh-key:", error);
            return res.status(500).json({ error: "Failed to generate SSH key." });
        }
    });

    /* ---------- /set_chat_model ---------- */
    app.post("/set_chat_model", (req, res) => {
        const { gitRepoNameCLI, chatNumber, aiModel, aiProvider } = req.body;
        const sessionId = resolveSessionId(req);
        const dataObj = loadRepoJson(gitRepoNameCLI, sessionId);
        const chatData = dataObj[chatNumber];
        if (!chatData) {
            return res
                .status(404)
                .send(`Chat #${chatNumber} not found in repo '${gitRepoNameCLI}'.`);
        }
        chatData.aiModel = aiModel;
        const provider = normalizeProviderName(aiProvider);
        chatData.aiProvider = provider;
        dataObj[chatNumber] = chatData;
        saveRepoJson(gitRepoNameCLI, dataObj, sessionId);

        if (!AIModels[provider]) {
            fetchAndSortModels(provider);
        }
        res.redirect(`/${gitRepoNameCLI}/chat/${chatNumber}`);
    });

    /* ---------- Add Other Repo to Chat ---------- */
    app.post("/:repoName/chat/:chatNumber/add_other_repo", (req, res) => {
        const { repoName, chatNumber } = req.params;
        const { otherRepoName } = req.body;
        const sessionId = resolveSessionId(req);
        const dataObj = loadRepoJson(repoName, sessionId);
        const chatData = dataObj[chatNumber];
        if (!chatData) {
            return res.status(404).send("Chat not found.");
        }

        chatData.additionalRepos = chatData.additionalRepos || [];
        if (otherRepoName && !chatData.additionalRepos.includes(otherRepoName)) {
            chatData.additionalRepos.push(otherRepoName);
        }

        dataObj[chatNumber] = chatData;
        saveRepoJson(repoName, dataObj, sessionId);
        res.redirect(`/environment/${repoName}/chat/${chatNumber}`);
    });

    /* ---------- Chat status management ---------- */
    app.post("/:repoName/chat/:chatNumber/deactivate", (req, res) => {
        const { repoName, chatNumber } = req.params;
        const sessionId = resolveSessionId(req);
        const dataObj = loadRepoJson(repoName, sessionId);
        const chatData = dataObj[chatNumber];
        if (!chatData) return res.status(404).send("Chat not found.");
        chatData.status = "INACTIVE";
        dataObj[chatNumber] = chatData;
        saveRepoJson(repoName, dataObj, sessionId);
        res.redirect(`/environment/${repoName}`);
    });

    app.post("/:repoName/chat/:chatNumber/activate", (req, res) => {
        const { repoName, chatNumber } = req.params;
        const sessionId = resolveSessionId(req);
        const dataObj = loadRepoJson(repoName, sessionId);
        const chatData = dataObj[chatNumber];
        if (!chatData) return res.status(404).send("Chat not found.");
        chatData.status = "ACTIVE";
        dataObj[chatNumber] = chatData;
        saveRepoJson(repoName, dataObj, sessionId);
        res.redirect(`/environment/${repoName}`);
    });

    app.post("/:repoName/chat/:chatNumber/archive", (req, res) => {
        // Default archive behavior adds to archived-context
        const { repoName, chatNumber } = req.params;
        const sessionId = resolveSessionId(req);
        const dataObj = loadRepoJson(repoName, sessionId);
        const chatData = dataObj[chatNumber];
        if (!chatData) return res.status(404).send("Chat not found.");
        chatData.status = "ARCHIVED_CONTEXT";
        dataObj[chatNumber] = chatData;
        saveRepoJson(repoName, dataObj, sessionId);
        res.redirect(`/environment/${repoName}`);
    });

    app.post("/:repoName/chat/:chatNumber/archive_plain", (req, res) => {
        const { repoName, chatNumber } = req.params;
        const sessionId = resolveSessionId(req);
        const dataObj = loadRepoJson(repoName, sessionId);
        const chatData = dataObj[chatNumber];
        if (!chatData) return res.status(404).send("Chat not found.");
        chatData.status = "ARCHIVED";
        dataObj[chatNumber] = chatData;
        saveRepoJson(repoName, dataObj, sessionId);
        res.redirect(`/environment/${repoName}`);
    });

    app.post("/:repoName/chat/:chatNumber/unarchive", (req, res) => {
        const { repoName, chatNumber } = req.params;
        const sessionId = resolveSessionId(req);
        const dataObj = loadRepoJson(repoName, sessionId);
        const chatData = dataObj[chatNumber];
        if (!chatData) return res.status(404).send("Chat not found.");
        chatData.status = "ACTIVE";
        dataObj[chatNumber] = chatData;
        saveRepoJson(repoName, dataObj, sessionId);
        res.redirect(`/environment/${repoName}`);
    });

    /* ---------- /:repoName/chat/:chatNumber ---------- */
    app.post("/:repoName/chat/:chatNumber", upload.array("imageFiles"), async (req, res) => {
        try {
            const { repoName, chatNumber } = req.params;
            const sessionId = resolveSessionId(req);
            let userMessage = req.body.message || req.body.chatInput;
            if (!userMessage) {
                return res.status(400).json({ error: "No message provided" });
            }

            const dataObj = loadRepoJson(repoName, sessionId);
            const chatData = dataObj[chatNumber];
            if (!chatData) {
                return res.status(404).json({
                    error: `Chat #${chatNumber} not found in repo '${repoName}'.`,
                });
            }

            /* ----- attachedFiles from hidden field ----- */
            if (req.body.attachedFiles) {
                try {
                    chatData.attachedFiles = JSON.parse(req.body.attachedFiles);
                } catch (e) {
                    console.error("[ERROR] parsing attachedFiles:", e);
                }
            }

            chatData.aiModel = (chatData.aiModel || DEFAULT_AIMODEL).toLowerCase();
            chatData.aiProvider = normalizeProviderName(chatData.aiProvider || "openrouter");

            const repoCfg = loadSingleRepoConfig(repoName, sessionId);
            if (!repoCfg) {
                return res.status(400).json({ error: "No repoConfig found." });
            }
            const { gitRepoLocalPath } = repoCfg;

            /* ----- git pull first ----- */
            await gitUpdatePull(gitRepoLocalPath);

            /* ----- inject attached files’ contents (multiple repos) into userMessage ----- */
            const attachedFiles = chatData.attachedFiles || [];
            for (const fullPath of attachedFiles) {
                let actualRepo = repoName;
                let relativePath = fullPath;
                const splitted = fullPath.split("|");
                if (splitted.length === 2) {
                    actualRepo = splitted[0];
                    relativePath = splitted[1];
                }

                const rConfig = loadSingleRepoConfig(actualRepo, sessionId);
                if (!rConfig) {
                    userMessage += `\n\n[Repo not found: ${actualRepo} for file: ${relativePath}]\n`;
                    continue;
                }

                const absFilePath = path.join(rConfig.gitRepoLocalPath, relativePath);
                if (fs.existsSync(absFilePath)) {
                    const fileContents = fs.readFileSync(absFilePath, "utf-8");
                    userMessage += `\n\n===== Start of file: ${relativePath} =====\n`;
                    userMessage += fileContents;
                    userMessage += `\n===== End of file: ${relativePath} =====\n`;
                } else {
                    userMessage += `\n\n[File not found: ${relativePath} in repo ${actualRepo}]\n`;
                }
            }

            /* ----- handle newly-uploaded images ----- */
            if (req.files && req.files.length > 0) {
                chatData.uploadedImages = chatData.uploadedImages || [];
                for (const file of req.files) {
                    const relativePath = path.relative(PROJECT_ROOT, file.path);
                    chatData.uploadedImages.push(relativePath);
                }
                userMessage += `\n\nUser uploaded ${req.files.length} image(s).`;
            }

            /* ----- build messages for OpenAI ----- */
            const messages = [];
            if (chatData.agentInstructions) {
                messages.push({ role: "user", content: chatData.agentInstructions });
            }
            messages.push({ role: "user", content: userMessage });

            chatData.lastMessagesSent = messages;
            dataObj[chatNumber] = chatData;
            saveRepoJson(repoName, dataObj, sessionId);

            /* ----- OpenAI call ----- */
            const openaiClient = getOpenAIClient(chatData.aiProvider);
            if (!openaiClient) {
                return res.status(500).json({
                    error: `AI provider '${chatData.aiProvider}' is not configured. Please supply the required API key.`,
                });
            }
            const response = await openaiClient.chat.completions.create({
                model: chatData.aiModel,
                messages,
            });
            const assistantReply = response.choices[0].message.content;

            /* ----- parse assistant output ----- */
            const extractedFiles = parseAssistantReplyForFiles(assistantReply);
            const commitSummary = parseAssistantReplyForCommitSummary(assistantReply);

            /* ----- write files to disk ----- */
            for (const file of extractedFiles) {
                // Default to main repo if not recognized in name
                let actualRepo = repoName;
                let relativePath = file.filename;
                const splitted = file.filename.split("|");
                if (splitted.length === 2) {
                    actualRepo = splitted[0];
                    relativePath = splitted[1];
                }
                const rConfig = loadSingleRepoConfig(actualRepo, sessionId);
                if (!rConfig) {
                    console.warn("[WARN] Attempted to write file to unknown repo:", actualRepo);
                    continue;
                }
                const outPath = path.join(rConfig.gitRepoLocalPath, relativePath);
                fs.mkdirSync(path.dirname(outPath), { recursive: true });
                fs.writeFileSync(outPath, file.content, "utf-8");
            }

            /* ----- commit/push, if any ----- */
            if (commitSummary) {
                try {
                    const commitUserName = process.env.GIT_COMMIT_USER_NAME || "YOURNAME";
                    const commitUserEmail = process.env.GIT_COMMIT_USER_EMAIL || "YOURNAME@YOURDOMAIN.tld";
                    execSync(`git config user.name "${commitUserName}"`, { cwd: gitRepoLocalPath });
                    execSync(`git config user.email "${commitUserEmail}"`, { cwd: gitRepoLocalPath });
                    execSync("git add .", { cwd: gitRepoLocalPath });
                    execSync(`git commit -m "${commitSummary.replace(/"/g, '\\"')}"`, { cwd: gitRepoLocalPath });
                    if (chatData.pushAfterCommit) {
                        execSync("git push", { cwd: gitRepoLocalPath });
                    }
                } catch (err) {
                    console.error("[ERROR] Git commit/push failed:", err);
                }
            }

            /* ----- maintain chat & summary history ----- */
            chatData.chatHistory = chatData.chatHistory || [];
            chatData.chatHistory.push({
                role: "user",
                content: userMessage,
                timestamp: new Date().toISOString(),
                messagesSent: messages,
            });
            chatData.chatHistory.push({
                role: "assistant",
                content: assistantReply,
                timestamp: new Date().toISOString(),
            });

            /* create a small summary */
            const summaryPrompt = `Please summarize the following conversation between the user and the assistant.\n\nUser message:\n${userMessage}\n\nAssistant reply:\n${assistantReply}\n\nSummary:\n`;
            const summaryResponse = await openaiClient.chat.completions.create({
                model: chatData.aiModel,
                messages: [{ role: "user", content: summaryPrompt }],
            });
            const summaryText = summaryResponse.choices[0].message.content;
            chatData.summaryHistory = chatData.summaryHistory || [];
            chatData.summaryHistory.push({
                role: "assistant",
                content: summaryText,
                timestamp: new Date().toISOString(),
            });

            chatData.extractedFiles = chatData.extractedFiles || [];
            chatData.extractedFiles.push(...extractedFiles);

            dataObj[chatNumber] = chatData;
            saveRepoJson(repoName, dataObj, sessionId);

            return res.status(200).json({
                success: true,
                assistantReply,
                updatedChat: chatData,
            });
        } catch (error) {
            console.error("[ERROR] /:repoName/chat/:chatNumber:", error);
            return res.status(500).json({ error: "Failed to process your message." });
        }
    });

    /* ---------- helper parsers ---------- */
    function parseAssistantReplyForFiles(assistantReply) {
        const fileRegex = /===== Start of file: (.+?) =====\s*([\s\S]*?)===== End of file: \1 =====/g;
        const files = [];
        let match;
        while ((match = fileRegex.exec(assistantReply)) !== null) {
            files.push({ filename: match[1], content: match[2] });
        }
        return files;
    }

    function parseAssistantReplyForCommitSummary(assistantReply) {
        const commitSummaryRegex = /A\.\s*Commit Summary\s*([\s\S]*?)B\.\s*Files/;
        const match = assistantReply.match(commitSummaryRegex);
        return match && match[1] ? match[1].trim() : null;
    }

    /* ---------- /:repoName/git_update ---------- */
    app.post("/:repoName/git_update", async (req, res) => {
        const repoName = req.params.repoName;
        const sessionId = resolveSessionId(req);
        const repoCfg = loadSingleRepoConfig(repoName, sessionId);
        if (!repoCfg) {
            return res.status(400).json({ error: `Repo '${repoName}' not found.` });
        }
        try {
            const pullOutput = await gitUpdatePull(repoCfg.gitRepoLocalPath);
            const currentCommit = execSync("git rev-parse HEAD", { cwd: repoCfg.gitRepoLocalPath }).toString().trim();
            res.json({ success: true, currentCommit, pullOutput });
        } catch (err) {
            console.error("[ERROR] gitUpdatePull:", err);
            res.status(500).json({ error: "Failed to update repository." });
        }
    });

    app.post("/agent/git-tree/pull", async (req, res) => {
        const projectDirRaw =
            (req.body && req.body.projectDir)
            || (req.query && req.query.projectDir)
            || "";
        const projectDirInput = projectDirRaw.toString().trim();

        if (!projectDirInput) {
            return res.status(400).json({ error: "Project directory is required." });
        }

        let resolvedProjectDir = "";
        try {
            resolvedProjectDir = path.resolve(projectDirInput);
        } catch (error) {
            return res.status(400).json({ error: "Invalid project directory." });
        }

        try {
            const stats = fs.statSync(resolvedProjectDir);
            if (!stats.isDirectory()) {
                return res.status(400).json({
                    error: `Provided project directory is not a directory: ${projectDirInput}`,
                });
            }
        } catch (error) {
            return res.status(400).json({ error: `Project directory not found: ${projectDirInput}` });
        }

        try {
            // Ensure the repository has at least one configured remote before attempting a pull.
            try {
                const remotesRaw = execSync('git remote', { cwd: resolvedProjectDir, stdio: ['pipe','pipe','ignore'] }).toString();
                const remotes = remotesRaw.split(/\r?\n/).map(r => r.trim()).filter(Boolean);
                if (!remotes.length) {
                    return res.status(400).json({ error: 'No git remotes configured for repository.' });
                }
            } catch (_e) {
                return res.status(400).json({ error: 'No git remotes configured for repository.' });
            }

            const pullOutput = await gitUpdatePull(resolvedProjectDir);
            let currentCommit = "";
            try {
                currentCommit = execSync("git rev-parse HEAD", { cwd: resolvedProjectDir })
                    .toString()
                    .trim();
            } catch (commitError) {
                console.warn("[WARN] Failed to determine current commit after pull:", commitError);
            }

            return res.json({ success: true, currentCommit, pullOutput });
        } catch (error) {
            const message =
                (error && error.message)
                    || (typeof error === "string" ? error : "Git pull failed.");
            console.error("[ERROR] /agent/git-tree/pull:", error);
            return res.status(500).json({ error: message || "Git pull failed." });
        }
    });

    /* ---------- save agent instructions ---------- */
    app.post("/:repoName/chat/:chatNumber/save_agent_instructions", (req, res) => {
        const { repoName, chatNumber } = req.params;
        const { agentInstructions } = req.body;
        const sessionId = resolveSessionId(req);
        const dataObj = loadRepoJson(repoName, sessionId);
        const chatData = dataObj[chatNumber];
        if (!chatData) {
            return res.status(404).send("Chat not found.");
        }
        chatData.agentInstructions = agentInstructions;
        dataObj[chatNumber] = chatData;
        saveRepoJson(repoName, dataObj, sessionId);
        res.redirect(`/environment/${repoName}/chat/${chatNumber}`);
    });

    /* ---------- save & load states ---------- */
    app.post("/:repoName/chat/:chatNumber/save_state", (req, res) => {
        const { repoName, chatNumber } = req.params;
        const { stateName, attachedFiles } = req.body;
        const sessionId = resolveSessionId(req);
        const dataObj = loadRepoJson(repoName, sessionId);
        const chatData = dataObj[chatNumber];
        if (!chatData) return res.status(404).send("Chat not found.");

        let attachedFilesArray = [];
        try { attachedFilesArray = JSON.parse(attachedFiles); } catch (e) { /**/ }

        chatData.savedStates = chatData.savedStates || {};
        chatData.savedStates[stateName] = { attachedFiles: attachedFilesArray };
        dataObj[chatNumber] = chatData;
        saveRepoJson(repoName, dataObj, sessionId);
        res.redirect(`/environment/${repoName}/chat/${chatNumber}`);
    });

    app.post("/:repoName/chat/:chatNumber/load_state", (req, res) => {
        const { repoName, chatNumber } = req.params;
        const { stateName } = req.body;
        const sessionId = resolveSessionId(req);
        const dataObj = loadRepoJson(repoName, sessionId);
        const chatData = dataObj[chatNumber];
        if (!chatData) return res.status(404).send("Chat not found.");

        chatData.savedStates = chatData.savedStates || {};
        if (!chatData.savedStates[stateName]) return res.status(404).send("State not found.");

        chatData.attachedFiles = chatData.savedStates[stateName].attachedFiles;
        dataObj[chatNumber] = chatData;
        saveRepoJson(repoName, dataObj, sessionId);
        res.redirect(`/environment/${repoName}/chat/${chatNumber}`);
    });

    /* ---------- Save file from editor ---------- */
    app.post("/:repoName/chat/:chatNumber/editor/file", (req, res) => {
        const { repoName, chatNumber } = req.params;
        const { repo: targetRepo, path: filePath, content, projectDir } = req.body || {};

        if (!targetRepo || !filePath) {
            return res.status(400).json({ error: "Missing repo or path." });
        }

        const sessionId = resolveSessionId(req);
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
                const projectDirParam = projectDir ? projectDir.toString() : '';
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
        const normalizedRelative = path.normalize(filePath);
        const absolutePath = path.resolve(repoRoot, normalizedRelative);
        const relativeToRoot = path.relative(repoRoot, absolutePath);
        if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
            return res.status(400).json({ error: "Invalid file path." });
        }

        try {
            fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
            fs.writeFileSync(absolutePath, content ?? "", "utf-8");

            // Attempt to commit & push the single-file change
            try {
                const commitUserName = process.env.GIT_COMMIT_USER_NAME || "alfe-ai";
                const commitUserEmail = process.env.GIT_COMMIT_USER_EMAIL || "noreply@alfe.sh";
                try {
                    execSync(`git config user.name "${commitUserName}"`, { cwd: repoRoot });
                    execSync(`git config user.email "${commitUserEmail}"`, { cwd: repoRoot });
                } catch(_e) { /* ignore git config errors */ }

                try {
                    // Stage only the edited file (relative path to repo root)
                    execSync(`git add -- "${relativeToRoot}"`, { cwd: repoRoot });
                    const commitMsg = `Edited ${relativeToRoot}`;
                    // Try to commit; if no changes to commit this will throw — ignore in that case
                    try {
                        execSync(`git commit -m "${commitMsg.replace(/"/g, '\"')}"`, { cwd: repoRoot });
                        // Push the commit if remotes are configured
                        try { execSync("git push", { cwd: repoRoot }); } catch (_pushErr) { /* ignore push failures */ }
                    } catch (_commitErr) {
                        // No changes to commit or commit failed; ignore
                    }
                } catch (gitErr) {
                    console.error("[WARN] Git add/commit failed:", gitErr);
                }
            } catch (e) {
                console.error("[WARN] Git commit/push attempt failed:", e);
            }

            const stat = fs.statSync(absolutePath);
            return res.json({
                success: true,
                lastModified: stat.mtimeMs,
            });
        } catch (err) {
            console.error("[ERROR] Failed to save file from editor:", err);
            return res.status(500).json({ error: "Failed to save file." });
        }
    });

    /* ---------- global instructions ---------- */
    app.post("/save_global_instructions", (req, res) => {
        const { globalInstructions } = req.body || {};
        saveGlobalInstructions(globalInstructions || "");
        res.redirect("/global_instructions");
    });

    /* ---------- toggle push-after-commit ---------- */
    app.post("/:repoName/chat/:chatNumber/toggle_push_after_commit", (req, res) => {
        const { repoName, chatNumber } = req.params;
        const sessionId = resolveSessionId(req);
        const dataObj = loadRepoJson(repoName, sessionId);
        const chatData = dataObj[chatNumber];
        if (!chatData) return res.status(404).send("Chat not found.");

        chatData.pushAfterCommit = !!req.body.pushAfterCommit;
        dataObj[chatNumber] = chatData;
        saveRepoJson(repoName, dataObj, sessionId);
        res.redirect(`/environment/${repoName}/chat/${chatNumber}`);
    });

    /* ---------- toggle file attachment ---------- */
    app.post("/:repoName/chat/:chatNumber/toggle_attached", (req, res) => {
        const { repoName, chatNumber } = req.params;
        const { filePath } = req.body || {};
        const sessionId = resolveSessionId(req);
        const dataObj = loadRepoJson(repoName, sessionId);
        const chatData = dataObj[chatNumber];
        if (!chatData) return res.status(404).send("Chat not found.");

        if (!filePath) return res.status(400).json({ error: "File path required." });

        const attachedFiles = chatData.attachedFiles || [];
        const idx = attachedFiles.findIndex(p => p === filePath);
        if (idx === -1) {
            attachedFiles.push(filePath);
        } else {
            attachedFiles.splice(idx, 1);
        }
        chatData.attachedFiles = attachedFiles;
        dataObj[chatNumber] = chatData;
        saveRepoJson(repoName, dataObj, sessionId);
        res.json({ success: true, filePath, isAttached: idx === -1 });
    });

    /* ---------- /:repoName/git_switch_branch ---------- */
    app.post("/:repoName/git_switch_branch", (req, res) => {
        const { repoName } = req.params;
        const { createNew, branchName, newBranchName } = req.body || {};
        const sessionId = resolveSessionId(req);
        const repoCfg = loadSingleRepoConfig(repoName, sessionId);
        if (!repoCfg) {
            return res.status(400).json({ error: `Repo '${repoName}' not found.` });
        }
        const { gitRepoLocalPath } = repoCfg;
        const branchParents =
            repoCfg && typeof repoCfg.branchParents === "object" && repoCfg.branchParents !== null
                ? { ...repoCfg.branchParents }
                : {};

        let startingBranch = "";
        try {
            startingBranch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: gitRepoLocalPath, stdio: "pipe" })
                .toString()
                .trim();
        } catch (err) {
            startingBranch = "";
        }

        const storeSterlingParent = (childBranch, parentBranchName) => {
            if (!childBranch || !parentBranchName || childBranch === parentBranchName) {
                return;
            }
            try {
                execSync(`git config branch."${childBranch}".sterlingParent "${parentBranchName}"`, {
                    cwd: gitRepoLocalPath,
                    stdio: "pipe",
                });
            } catch (configErr) {
                console.warn(
                    `[WARN] Unable to persist sterling parent for ${childBranch}:`,
                    configErr && configErr.message ? configErr.message : configErr,
                );
            }
        };

        try {
            if (createNew === true || createNew === "true") {
                if (!newBranchName) {
                    return res.status(400).json({ error: "No new branch name provided." });
                }
                const targetBranch = newBranchName.trim();
                if (!targetBranch) {
                    return res.status(400).json({ error: "New branch name cannot be empty." });
                }
                execSync(`git checkout -b "${targetBranch}"`, { cwd: gitRepoLocalPath, stdio: "pipe" });
                repoCfg.gitBranch = targetBranch;
                if (startingBranch && startingBranch !== targetBranch) {
                    branchParents[targetBranch] = startingBranch;
                    repoCfg.gitParentBranch = startingBranch;
                    storeSterlingParent(targetBranch, startingBranch);
                } else if (!repoCfg.gitParentBranch) {
                    repoCfg.gitParentBranch = "";
                }
            } else {
                if (!branchName) {
                    return res.status(400).json({ error: "No branch name provided." });
                }
                const targetBranch = branchName.trim();
                if (!targetBranch) {
                    return res.status(400).json({ error: "Branch name cannot be empty." });
                }
                try {
                    execSync(`git checkout "${targetBranch}"`, { cwd: gitRepoLocalPath, stdio: "pipe" });
                } catch (checkoutErr) {
                    let remoteTarget = "";
                    try {
                        const remotesRaw = execSync(
                            "git for-each-ref --format='%(refname:short)' refs/remotes",
                            { cwd: gitRepoLocalPath, stdio: "pipe" },
                        )
                            .toString()
                            .trim()
                            .split("\n");
                        const matchingRemote = remotesRaw.find((ref) => ref.endsWith(`/${targetBranch}`));
                        if (matchingRemote) {
                            const remoteName = matchingRemote.split("/")[0];
                            remoteTarget = `${remoteName}/${targetBranch}`;
                        }
                    } catch (remoteErr) {
                        remoteTarget = "";
                    }
                    const fallbackRemote = remoteTarget || `origin/${targetBranch}`;
                    execSync(`git checkout -t "${fallbackRemote}"`, { cwd: gitRepoLocalPath, stdio: "pipe" });
                }
                repoCfg.gitBranch = targetBranch;
                let configuredParent =
                    typeof branchParents[targetBranch] === "string" ? branchParents[targetBranch] : "";
                if (!configuredParent) {
                    try {
                        configuredParent = execSync(`git config branch."${targetBranch}".sterlingParent`, {
                            cwd: gitRepoLocalPath,
                            stdio: "pipe",
                        })
                            .toString()
                            .trim();
                    } catch (err) {
                        configuredParent = "";
                    }
                }
                if (configuredParent) {
                    branchParents[targetBranch] = configuredParent;
                    storeSterlingParent(targetBranch, configuredParent);
                }
                repoCfg.gitParentBranch = configuredParent || "";
            }
            repoCfg.branchParents = branchParents;
            const allConfig = loadRepoConfig(sessionId) || {};
            allConfig[repoName] = repoCfg;
            saveRepoConfig(allConfig, sessionId);

            return res.json({ success: true });
        } catch (err) {
            console.error("[ERROR] gitSwitchBranch =>", err);
            return res.status(500).json({ error: "Failed to switch branch." });
        }
    });
    /* ---------- /agent/merge ---------- */
    app.post("/agent/merge", (req, res) => {
        const projectDirRaw = (req.body && req.body.projectDir) || (req.query && req.query.projectDir) || "";
        const projectDir = typeof projectDirRaw === "string" ? projectDirRaw.trim() : "";
        if (!projectDir) {
            return res.status(400).json({ error: "projectDir is required" });
        }

        const runId = normaliseRunId(
            (req.body && req.body.runId)
                || (req.query && req.query.runId)
                || "",
        );
        const sessionId = resolveSessionId(req);

        try {
            const resolvedDir = path.resolve(projectDir);
            if (!fs.existsSync(resolvedDir)) {
                return res.status(400).json({ error: `Path not found: ${resolvedDir}` });
            }

            const mergeScriptPath = path.join(PROJECT_ROOT, "codex-tools", "git_merge_parent.sh");
            if (!fs.existsSync(mergeScriptPath)) {
                return res.status(500).json({ error: "git_merge_parent.sh script is missing." });
            }

            let configuredParentBranch = "";
            let activeBranch = "";
            let repoNameForDir = "";
            try {
                const repoConfig = loadRepoConfig(resolveSessionId(req)) || {};
                for (const [name, cfg] of Object.entries(repoConfig)) {
                    if (!cfg || typeof cfg !== "object") continue;
                    const candidatePath = cfg.gitRepoLocalPath ? path.resolve(cfg.gitRepoLocalPath) : "";
                    if (candidatePath && candidatePath === resolvedDir) {
                        repoNameForDir = name;
                        activeBranch = typeof cfg.gitBranch === "string" ? cfg.gitBranch : "";
                        const parentMap =
                            cfg && typeof cfg.branchParents === "object" && cfg.branchParents !== null
                                ? cfg.branchParents
                                : {};
                        if (activeBranch && typeof parentMap[activeBranch] === "string") {
                            configuredParentBranch = parentMap[activeBranch];
                        } else if (typeof cfg.gitParentBranch === "string") {
                            configuredParentBranch = cfg.gitParentBranch;
                        }
                        break;
                    }
                }
            } catch (err) {
                console.warn("[WARN] Unable to resolve parent branch from configuration:", err);
            }

            const envVars = { ...process.env };
            if (configuredParentBranch && configuredParentBranch !== activeBranch) {
                envVars.STERLING_PARENT_BRANCH = configuredParentBranch;
            }
            if (repoNameForDir) {
                envVars.STERLING_REPO_NAME = repoNameForDir;
            }
            if (activeBranch) {
                envVars.STERLING_ACTIVE_BRANCH = activeBranch;
            }

            const child = spawn(mergeScriptPath, [], {
                cwd: resolvedDir,
                env: envVars,
            });

            // Persist an initial merging status entry for the run if available
            if (runId) {
                try {
                    const runs = typeof loadCodexRuns === "function" ? loadCodexRuns(sessionId) : null;
                    const existingRun = Array.isArray(runs) ? runs.find((r) => r && r.id === normaliseRunId(runId)) : null;
                    if (existingRun) {
                        const nextHistory = Array.isArray(existingRun.statusHistory) ? [...existingRun.statusHistory] : [];
                        nextHistory.push("Merging...");
                        upsertCodexRun(sessionId, { id: normaliseRunId(runId), statusHistory: nextHistory });
                    }
                } catch (err) {
                    console.warn("[WARN] Unable to persist initial merging status for run:", err);
                }
            }


            let stdout = "";
            let stderr = "";
            let responded = false;

            const finish = (status, payload) => {
                if (!responded) {
                    responded = true;
                    res.status(status).json(payload);
                }
            };

            child.stdout.on("data", (chunk) => {
                stdout += chunk.toString();
            });

            child.stderr.on("data", (chunk) => {
                stderr += chunk.toString();
            });

            child.on("error", (err) => {
                console.error("[ERROR] git_merge_parent.sh failed to start:", err);
                finish(500, { error: `Failed to start merge script: ${err.message}` });
            });

            child.on("close", (code) => {
                const trimmedStdout = stdout.trim();
                const trimmedStderr = stderr.trim();

                if (code === 0) {
                    const successMessage = "Branch merged.";
                    if (runId) {
                        persistMergeOutcomeToRun({
                            sessionId,
                            runId,
                            exitCode: code,
                            message: successMessage,
                            stdout: trimmedStdout,
                            stderr: trimmedStderr,
                        });
                    }
                    cleanupSterlingTempDir(resolvedDir);
                    finish(200, {
                        message: successMessage,
                        output: trimmedStdout,
                        errorOutput: trimmedStderr,
                        exitCode: code,
                    });
                    return;
                }

                const errorMessage = `git_merge_parent.sh exited with code ${code}.`;
                if (runId) {
                    persistMergeOutcomeToRun({
                        sessionId,
                        runId,
                        exitCode: code,
                        message: "Merge failed.",
                        stdout: trimmedStdout,
                        stderr: trimmedStderr,
                    });
                }
                console.error("[ERROR]", errorMessage, trimmedStderr || trimmedStdout || "");
                finish(500, {
                    error: errorMessage,
                    output: trimmedStdout,
                    errorOutput: trimmedStderr,
                    exitCode: code,
                });
            });
        } catch (err) {
            console.error("[ERROR] /agent/merge:", err);
            return res.status(500).json({ error: "Internal server error" });
        }
    });

    /* ---------- /agent/git-pull ---------- */
    app.post('/agent/git-pull', (req, res) => {
        const projectDir = (req.body && req.body.projectDir) || (req.query && req.query.projectDir) || '';
        const effectiveProjectDir = projectDir || '';
        if (!effectiveProjectDir) {
            return res.status(400).json({ error: 'projectDir is required' });
        }

        try {
            const resolved = path.resolve(effectiveProjectDir);
            if (!fs.existsSync(resolved)) {
                return res.status(400).json({ error: `Path not found: ${resolved}` });
            }
            // perform git pull
            const exec = require('child_process').exec;
            exec('git pull', { cwd: resolved }, (err, stdout, stderr) => {
                if (err) {
                    console.error('[ERROR] git pull failed:', stderr || err.message);
                    return res.status(500).json({ error: stderr || err.message });
                }
                console.log('[DEBUG] git pull success:', stdout);
                return res.json({ message: 'Git pull completed', output: stdout });
            });
        } catch (err) {
            console.error('[ERROR] /agent/git-pull:', err);
            return res.status(500).json({ error: 'Internal server error' });
        }
    });

    /* ---------- /agent/update-branch ---------- */
    app.post('/agent/update-branch', (req, res) => {
        const projectDirRaw = (req.body && req.body.projectDir) || (req.query && req.query.projectDir) || "";
        const projectDir = typeof projectDirRaw === "string" ? projectDirRaw.trim() : "";
        if (!projectDir) {
            return res.status(400).json({ error: "projectDir is required" });
        }

        try {
            const resolvedDir = path.resolve(projectDir);
            if (!fs.existsSync(resolvedDir)) {
                return res.status(400).json({ error: `Path not found: ${resolvedDir}` });
            }

            // Determine active branch and parent branch from repo config if available
            let configuredParentBranch = "";
            let activeBranch = "";
            try {
                const repoConfig = loadRepoConfig(resolveSessionId(req)) || {};
                for (const [name, cfg] of Object.entries(repoConfig)) {
                    if (!cfg || typeof cfg !== "object") continue;
                    const candidatePath = cfg.gitRepoLocalPath ? path.resolve(cfg.gitRepoLocalPath) : "";
                    if (candidatePath && candidatePath === resolvedDir) {
                        activeBranch = typeof cfg.gitBranch === "string" ? cfg.gitBranch : "";
                        const parentMap = cfg && typeof cfg.branchParents === "object" && cfg.branchParents !== null ? cfg.branchParents : {};
                        if (activeBranch && typeof parentMap[activeBranch] === "string") {
                            configuredParentBranch = parentMap[activeBranch];
                        } else if (typeof cfg.gitParentBranch === "string") {
                            configuredParentBranch = cfg.gitParentBranch;
                        }
                        break;
                    }
                }
            } catch (err) {
                console.warn("[WARN] Unable to resolve parent branch from configuration:", err);
            }

            // Fallback: try to read git branch from repository
            try {
                const out = execSync('git rev-parse --abbrev-ref HEAD', { cwd: resolvedDir, stdio: ['pipe','pipe','ignore'] }).toString().trim();
                if (out) activeBranch = activeBranch || out;
            } catch (_err) { /* ignore */ }

            // If no parent configured, try git config branch.<branch>.sterlingParent
            if (!configuredParentBranch && activeBranch) {
                try {
                    const out = execSync(`git config branch."${activeBranch}".sterlingParent`, { cwd: resolvedDir, stdio: ['pipe','pipe','ignore'] }).toString().trim();
                    if (out) configuredParentBranch = out;
                } catch (_err) { /* ignore */ }
            }

            if (!activeBranch) {
                return res.status(400).json({ error: 'Unable to determine active branch for repository.' });
            }

            if (!configuredParentBranch) {
                return res.status(400).json({ error: 'No parent branch configured for this branch.' });
            }

            // Perform fetch, merge parent into active branch, commit if needed, and push
            let stdout = "";
            let stderr = "";
            try {
                stdout += execSync('git fetch --all --prune', { cwd: resolvedDir, stdio: ['pipe','pipe','pipe'] }).toString();
            } catch (err) {
                stderr += (err && err.stderr) ? err.stderr.toString() : String(err);
            }

            try {
                // Ensure we're on the active branch
                execSync(`git checkout ${activeBranch}`, { cwd: resolvedDir, stdio: ['pipe','pipe','pipe'] });
            } catch (err) {
                stderr += (err && err.stderr) ? err.stderr.toString() : String(err);
                return res.status(500).json({ error: 'Failed to checkout active branch.', output: stdout, errorOutput: stderr });
            }

            try {
                // Merge the parent branch into the active branch
                const mergeCmd = `git merge --no-ff origin/${configuredParentBranch} --no-edit`;
                stdout += execSync(mergeCmd, { cwd: resolvedDir, stdio: ['pipe','pipe','pipe'] }).toString();
            } catch (err) {
                // Merge may return non-zero; capture output
                stderr += (err && err.stderr) ? err.stderr.toString() : String(err);
                // Attempt to abort merge to leave repo clean
                try { execSync('git merge --abort', { cwd: resolvedDir, stdio: ['pipe','pipe','pipe'] }); } catch (_) {}
                return res.status(500).json({ error: 'Merge failed.', output: stdout, errorOutput: stderr });
            }

            try {
                // Push the updated branch
                stdout += execSync(`git push origin ${activeBranch}`, { cwd: resolvedDir, stdio: ['pipe','pipe','pipe'] }).toString();
            } catch (err) {
                stderr += (err && err.stderr) ? err.stderr.toString() : String(err);
                return res.status(500).json({ error: 'Failed to push branch.', output: stdout, errorOutput: stderr });
            }

            return res.json({ message: 'Branch updated.', output: stdout, errorOutput: stderr });
        } catch (err) {
            console.error('[ERROR] /agent/update-branch:', err);
            return res.status(500).json({ error: 'Internal server error' });
        }
    });

}

module.exports = { setupPostRoutes };
