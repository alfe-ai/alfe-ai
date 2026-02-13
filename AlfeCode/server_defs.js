const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const rdsStore = require('./rds_store');

const FALLBACK_CODEX_MODEL = 'openrouter/openai/gpt-5-mini';
const MODEL_ONLY_CONFIG_PATH = path.join(__dirname, 'data', 'config', 'model_only_models.json');
const MODEL_ONLY_CONFIG_FALLBACK_PATH = path.join(__dirname, '..', 'Sterling', 'data', 'config', 'model_only_models.json');

function resolveModelOnlyDefault() {
    const candidates = [MODEL_ONLY_CONFIG_PATH, MODEL_ONLY_CONFIG_FALLBACK_PATH];
    const resolvedPath = candidates.find((candidate) => fs.existsSync(candidate));
    if (!resolvedPath) {
        return '';
    }
    try {
        const raw = fs.readFileSync(resolvedPath, 'utf-8');
        const parsed = JSON.parse(raw || '{}');
        let models = [];
        if (Array.isArray(parsed)) {
            models = parsed;
        } else if (parsed && typeof parsed === 'object') {
            if (Array.isArray(parsed.models)) {
                models = parsed.models;
            } else if (parsed.models && typeof parsed.models === 'object') {
                models = Object.values(parsed.models);
            } else {
                models = Object.values(parsed);
            }
        }
        const entries = [];
        models.forEach((model, index) => {
            let normalized = model;
            if (typeof normalized === 'string') {
                normalized = { id: normalized };
            }
            if (!normalized || typeof normalized !== 'object') {
                return;
            }
            const modelId = typeof normalized.id === 'string' ? normalized.id.trim() : '';
            if (!modelId) {
                return;
            }
            const listOrderRaw = normalized.list_order;
            const listOrder = Number.isFinite(listOrderRaw) ? listOrderRaw : null;
            entries.push({ listOrder, index, id: modelId });
        });
        if (!entries.length) {
            return '';
        }
        entries.sort((a, b) => {
            const aHasOrder = a.listOrder !== null;
            const bHasOrder = b.listOrder !== null;
            if (aHasOrder && bHasOrder) {
                if (a.listOrder !== b.listOrder) return a.listOrder - b.listOrder;
                return a.index - b.index;
            }
            if (aHasOrder) return -1;
            if (bHasOrder) return 1;
            return a.index - b.index;
        });
        return entries[0].id;
    } catch (error) {
        console.error(`[ERROR] resolveModelOnlyDefault: ${error.message}`);
        return '';
    }
}

const MODEL_ONLY_DEFAULT = resolveModelOnlyDefault();
const DEFAULT_CODEX_MODEL = MODEL_ONLY_DEFAULT || FALLBACK_CODEX_MODEL;
const DEFAULT_CODEX_CONFIG_PATH = path.join(__dirname, 'data', 'config', 'codex_runner.json');
const LEGACY_CODEX_CONFIG_PATH = path.join(__dirname, '..', 'Sterling', 'data', 'config', 'codex_runner.json');

function resolveCodexConfigPath() {
    const envPath = typeof process !== 'undefined'
        && process.env
        && typeof process.env.CODEX_CONFIG_PATH === 'string'
        && process.env.CODEX_CONFIG_PATH.trim();
    if (envPath) {
        return path.resolve(envPath);
    }

    if (fs.existsSync(DEFAULT_CODEX_CONFIG_PATH)) {
        return DEFAULT_CODEX_CONFIG_PATH;
    }

    if (fs.existsSync(LEGACY_CODEX_CONFIG_PATH)) {
        return LEGACY_CODEX_CONFIG_PATH;
    }

    return DEFAULT_CODEX_CONFIG_PATH;
}

const CODEX_CONFIG_PATH = resolveCodexConfigPath();
const CODEX_MODEL_PATTERN = /^[A-Za-z0-9._:+-]+(?:\/[A-Za-z0-9._:+-]+)*$/;
const SESSION_DATA_ROOT = path.join(__dirname, 'data', 'sessions');
const SESSION_FALLBACK_KEY = 'default';
const CODEX_RUN_HISTORY_FILENAME = 'codex_runs.json';
const CODEX_RUNS_SESSION_KEY = 'codex_runs';
const CODEX_SETTINGS_MODEL_KEY = 'codex_default_model';
const CODEX_SETTINGS_INSTRUCTIONS_KEY = 'codex_default_agent_instructions';
let hasLoggedModelValidationDisabled = false;

function parseBooleanEnv(value, defaultValue = false) {
    if (typeof value === 'undefined' || value === null) {
        return defaultValue;
    }
    const normalized = String(value).trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) {
        return true;
    }
    if (['false', '0', 'no', 'off'].includes(normalized)) {
        return false;
    }
    return defaultValue;
}

function isCodexModelValidationDisabled() {
    const disabled = parseBooleanEnv(process.env.STERLING_CODEX_DISABLE_MODEL_VALIDATION, false);
    if (disabled && !hasLoggedModelValidationDisabled) {
        console.warn('[WARN] Codex model validation disabled via STERLING_CODEX_DISABLE_MODEL_VALIDATION.');
        hasLoggedModelValidationDisabled = true;
    }
    return disabled;
}

function isCodexModelValid(model) {
    if (typeof model !== 'string') {
        return false;
    }
    const trimmed = model.trim();
    if (!trimmed) {
        return false;
    }
    if (isCodexModelValidationDisabled()) {
        return true;
    }
    return CODEX_MODEL_PATTERN.test(trimmed);
}

function sanitizeSessionId(sessionId) {
    if (typeof sessionId !== 'string') {
        return SESSION_FALLBACK_KEY;
    }
    const trimmed = sessionId.trim();
    if (!trimmed) {
        return SESSION_FALLBACK_KEY;
    }
    return trimmed.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120) || SESSION_FALLBACK_KEY;
}

const sessionCodexModelOverrides = new Map();

function getSessionCodexModel(sessionId) {
    const safeId = sanitizeSessionId(sessionId);
    const stored = sessionCodexModelOverrides.get(safeId);
    if (typeof stored === 'string' && isCodexModelValid(stored)) {
        return stored;
    }
    if (stored) {
        sessionCodexModelOverrides.delete(safeId);
    }
    return '';
}

function setSessionCodexModel(sessionId, model) {
    const safeId = sanitizeSessionId(sessionId);
    const trimmed = typeof model === 'string' ? model.trim() : '';
    if (!trimmed) {
        sessionCodexModelOverrides.delete(safeId);
        return '';
    }
    if (!isCodexModelValid(trimmed)) {
        return '';
    }
    sessionCodexModelOverrides.set(safeId, trimmed);
    return trimmed;
}

function resolveCodexModelForSession(sessionId) {
    const sessionModel = getSessionCodexModel(sessionId);
    if (sessionModel) {
        return sessionModel;
    }
    return getDefaultCodexModel();
}


function sanitizeRepoName(repoName) {
    if (typeof repoName !== 'string') {
        return 'repo';
    }
    const trimmed = repoName.trim();
    if (!trimmed) {
        return 'repo';
    }
    return trimmed.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 160) || 'repo';
}

function ensureDir(targetPath) {
    if (!fs.existsSync(targetPath)) {
        fs.mkdirSync(targetPath, { recursive: true });
    }
}

function resolveSessionRoot(sessionId) {
    const safeId = sanitizeSessionId(sessionId);
    const root = path.join(SESSION_DATA_ROOT, safeId);
    ensureDir(root);
    return root;
}

function getSessionConfigPath(sessionId) {
    const sessionRoot = resolveSessionRoot(sessionId);
    const configDir = path.join(sessionRoot, 'config');
    ensureDir(configDir);
    return path.join(configDir, 'repo_config.json');
}

const DEFAULT_AGENT_INSTRUCTIONS = [
    'Do not ask to commit changes, we run a script to automatically stage, commit, and push after you finish.',
    'Do not ask anything like "Do you want me to run `git commit` with a message?"',
    'Do not mention anything like "The file is staged."',
    'Python command is available via "python3 version" Python 3.11.2',
    'Whenever you need to modify source files, skip git apply and instead programmatically read the target file, replace the desired text (or insert the new snippet) using a Python script (e.g., Path.read_text()/write_text()), then stage the changes.',
    'When starting, please check AGENTS.md in repository root for further instructions.',
    'Unless otherwise specified, NOW MAKE CODE CHANGES FOR THE USERS SPECIFIED REQUEST BELOW:',
].join('\n');


function ensureCodexConfigDir() {
    const dirPath = path.dirname(CODEX_CONFIG_PATH);
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function ensureCodexConfigFile() {
    if (rdsStore.enabled) {
        return;
    }
    ensureCodexConfigDir();
    if (!fs.existsSync(CODEX_CONFIG_PATH)) {
        const initialConfig = {
            defaultModel: DEFAULT_CODEX_MODEL,
            defaultAgentInstructions: DEFAULT_AGENT_INSTRUCTIONS,
        };
        fs.writeFileSync(CODEX_CONFIG_PATH, JSON.stringify(initialConfig, null, 2), 'utf-8');
        return;
    }

    try {
        const existingRaw = fs.readFileSync(CODEX_CONFIG_PATH, 'utf-8');
        const existing = JSON.parse(existingRaw || '{}');
        let mutated = false;

        if (typeof existing.defaultModel !== 'string' || !existing.defaultModel.trim()) {
            existing.defaultModel = DEFAULT_CODEX_MODEL;
            mutated = true;
        }

        if (typeof existing.defaultAgentInstructions !== 'string') {
            existing.defaultAgentInstructions = DEFAULT_AGENT_INSTRUCTIONS;
            mutated = true;
        }

        if (mutated) {
            fs.writeFileSync(CODEX_CONFIG_PATH, JSON.stringify(existing, null, 2), 'utf-8');
        }
    } catch (error) {
        console.error(`[ERROR] ensureCodexConfigFile: ${error.message}`);
        const fallbackConfig = {
            defaultModel: DEFAULT_CODEX_MODEL,
            defaultAgentInstructions: DEFAULT_AGENT_INSTRUCTIONS,
        };
        fs.writeFileSync(CODEX_CONFIG_PATH, JSON.stringify(fallbackConfig, null, 2), 'utf-8');
    }
}

function loadCodexConfigFromFile() {
    ensureCodexConfigFile();
    if (!fs.existsSync(CODEX_CONFIG_PATH)) {
        return {};
    }
    const raw = fs.readFileSync(CODEX_CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' ? { ...parsed } : {};
}

function loadCodexConfig() {
    try {
        let safeConfig = {};

        if (rdsStore.enabled) {
            const storedModel = rdsStore.getSetting(CODEX_SETTINGS_MODEL_KEY);
            const storedInstructions = rdsStore.getSetting(CODEX_SETTINGS_INSTRUCTIONS_KEY);
            if (typeof storedModel === 'string') {
                safeConfig.defaultModel = storedModel;
            }
            if (typeof storedInstructions === 'string') {
                safeConfig.defaultAgentInstructions = storedInstructions;
            }
        } else {
            safeConfig = loadCodexConfigFromFile();
        }

        let mutated = false;

        const rawModel = typeof safeConfig.defaultModel === 'string' ? safeConfig.defaultModel.trim() : '';
        if (!rawModel || !isCodexModelValid(rawModel)) {
            if (rawModel) {
                console.warn(`[WARN] Invalid codex defaultModel "${rawModel}". Falling back to ${DEFAULT_CODEX_MODEL}.`);
            }
            safeConfig.defaultModel = DEFAULT_CODEX_MODEL;
            mutated = true;
        } else if (rawModel === FALLBACK_CODEX_MODEL && MODEL_ONLY_DEFAULT && MODEL_ONLY_DEFAULT !== FALLBACK_CODEX_MODEL) {
            safeConfig.defaultModel = MODEL_ONLY_DEFAULT;
            mutated = true;
        } else {
            safeConfig.defaultModel = rawModel;
        }

        if (typeof safeConfig.defaultAgentInstructions !== 'string') {
            safeConfig.defaultAgentInstructions = DEFAULT_AGENT_INSTRUCTIONS;
            mutated = true;
        }

        if (mutated) {
            saveCodexConfig(safeConfig);
        }

        if (rdsStore.enabled) {
            rdsStore.setSetting(CODEX_SETTINGS_MODEL_KEY, safeConfig.defaultModel);
            rdsStore.setSetting(CODEX_SETTINGS_INSTRUCTIONS_KEY, safeConfig.defaultAgentInstructions);
        }

        return safeConfig;
    } catch (error) {
        console.error(`[ERROR] loadCodexConfig: ${error.message}`);
        const fallbackConfig = {
            defaultModel: DEFAULT_CODEX_MODEL,
            defaultAgentInstructions: DEFAULT_AGENT_INSTRUCTIONS,
        };
        try {
            saveCodexConfig(fallbackConfig);
        } catch (writeError) {
            console.error(`[ERROR] loadCodexConfig/save fallback: ${writeError.message}`);
        }
        return fallbackConfig;
    }
}

function saveCodexConfig(config) {
    const safeConfig = config && typeof config === 'object' ? { ...config } : {};

    const rawModel = typeof safeConfig.defaultModel === 'string' ? safeConfig.defaultModel.trim() : '';
    if (rawModel && !isCodexModelValid(rawModel)) {
        console.warn(`[WARN] Invalid codex defaultModel "${rawModel}" when saving. Falling back to ${DEFAULT_CODEX_MODEL}.`);
    }
    safeConfig.defaultModel = rawModel && isCodexModelValid(rawModel)
        ? rawModel
        : DEFAULT_CODEX_MODEL;

    if (typeof safeConfig.defaultAgentInstructions !== 'string') {
        safeConfig.defaultAgentInstructions = DEFAULT_AGENT_INSTRUCTIONS;
    }

    if (rdsStore.enabled) {
        rdsStore.setSetting(CODEX_SETTINGS_MODEL_KEY, safeConfig.defaultModel);
        rdsStore.setSetting(CODEX_SETTINGS_INSTRUCTIONS_KEY, safeConfig.defaultAgentInstructions);
        return;
    }

    ensureCodexConfigDir();
    fs.writeFileSync(CODEX_CONFIG_PATH, JSON.stringify(safeConfig, null, 2), 'utf-8');
}

function getDefaultCodexModel() {
    const config = loadCodexConfig();
    const candidate = config && typeof config.defaultModel === 'string'
        ? config.defaultModel.trim()
        : '';

    if (candidate && isCodexModelValid(candidate)) {
        return candidate;
    }
    if (candidate) {
        console.warn(`[WARN] Invalid codex config defaultModel "${candidate}". Falling back to ${DEFAULT_CODEX_MODEL}.`);
    }

    // Environment variable is a fallback when the UI/config has not set a valid value.
    const envModelRaw = typeof process !== 'undefined' && process.env && process.env.STERLING_CODEX_DEFAULT_MODEL
        ? String(process.env.STERLING_CODEX_DEFAULT_MODEL).trim()
        : '';
    if (envModelRaw && isCodexModelValid(envModelRaw)) {
        return envModelRaw;
    }
    if (envModelRaw) {
        console.warn(`[WARN] Invalid STERLING_CODEX_DEFAULT_MODEL "${envModelRaw}". Falling back to default.`);
    }

    return DEFAULT_CODEX_MODEL;
}

/**
 * Loads the entire repository configuration from repo_config.json.
 * If the file doesn't exist or contains invalid JSON it will be recreated
 * (the previous file is backed up) and an empty object is returned.
 *
 * @returns {Object} The configuration object (empty object if created).
 */
function loadRepoConfig(sessionId) {
    const configPath = getSessionConfigPath(sessionId);
    console.log(`🔍 Attempting to load repo_config.json from ${configPath}`);

    if (!fs.existsSync(configPath)) {
        console.warn("⚠️ repo_config.json not found. Creating new file.");
        fs.mkdirSync(path.dirname(configPath), { recursive: true });

        const fallbackCandidates = [
            path.join(SESSION_DATA_ROOT, SESSION_FALLBACK_KEY, 'config', 'repo_config.json'),
            path.join(__dirname, 'data', 'config', 'repo_config.json'),
        ];

        let initialConfig = {};
        for (const candidate of fallbackCandidates) {
            try {
                if (!fs.existsSync(candidate)) {
                    continue;
                }
                const raw = fs.readFileSync(candidate, 'utf-8');
                if (!raw.trim()) {
                    continue;
                }
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') {
                    initialConfig = parsed;
                    console.log(`🪄 Seeded repo_config.json for session from ${candidate}`);
                    break;
                }
            } catch (err) {
                console.warn(`⚠️ Failed to read fallback repo_config.json at ${candidate}: ${err.message}`);
            }
        }

        fs.writeFileSync(configPath, JSON.stringify(initialConfig, null, 2), "utf-8");
        return initialConfig;
    }

    let configData;
    try {
        configData = fs.readFileSync(configPath, "utf-8");
    } catch (readError) {
        console.error(`❌ Error reading repo_config.json: ${readError.message}`);
        const backupPath = `${configPath}.bak.${Date.now()}`;
        try {
            fs.renameSync(configPath, backupPath);
            console.warn(`🛟 Backed up unreadable file to ${backupPath}`);
        } catch (err) {
            console.error(`❌ Failed to backup repo_config.json: ${err.message}`);
        }
        fs.writeFileSync(configPath, "{}", "utf-8");
        return {};
    }

    try {
        const config = JSON.parse(configData);
        console.log("✅ repo_config.json loaded successfully.");
        return config;
    } catch (parseError) {
        console.error(`❌ Error parsing repo_config.json: ${parseError.message}`);
        const backupPath = `${configPath}.bak.${Date.now()}`;
        try {
            fs.renameSync(configPath, backupPath);
            console.warn(`🛟 Backed up invalid file to ${backupPath}`);
        } catch (err) {
            console.error(`❌ Failed to backup repo_config.json: ${err.message}`);
        }
        fs.writeFileSync(configPath, "{}", "utf-8");
        console.log("🆕 Created fresh repo_config.json");
        return {};
    }
}

/**
 * Loads the configuration for a single repository.
 * @param {string} repoName - The name of the repository.
 * @returns {Object|null} The repository configuration or null if not found.
 */
function loadSingleRepoConfig(repoName, sessionId) {
    console.log(`🔍 Loading configuration for repository: ${repoName}`);
    const config = loadRepoConfig(sessionId);

    // First try the config key directly
    if (config && config[repoName]) {
        console.log(`✅ Configuration found for repository: ${repoName}`);
        return config[repoName];
    }

    // If the provided repoName looks like a filesystem path, try to resolve
    // by matching the path against known repo entries' `gitRepoLocalPath`.
    try {
        const possiblePath = require('path').resolve(repoName);
        for (const key of Object.keys(config || {})) {
            const entry = config[key];
            if (entry && entry.gitRepoLocalPath) {
                try {
                    const entryPath = require('path').resolve(entry.gitRepoLocalPath);
                    if (entryPath === possiblePath) {
                        console.log(`✅ Configuration found by path for repository: ${repoName} -> ${key}`);
                        return entry;
                    }
                } catch (e) {
                    // ignore path resolution errors for individual entries
                }
            }
        }
    } catch (err) {
        // Ignore any errors resolving paths and fall through to not found.
    }

    console.warn(`⚠️ Configuration not found for repository: ${repoName}`);
    return null;
}

/**
 * Saves the updated repository configuration back to repo_config.json.
 * @param {Object} updatedConfig - The updated configuration object.
 */
function saveRepoConfig(updatedConfig, sessionId) {
    const configPath = getSessionConfigPath(sessionId);
    console.log(`💾 Saving updated repo_config.json to ${configPath}`);

    try {
        fs.writeFileSync(configPath, JSON.stringify(updatedConfig, null, 2), "utf-8");
        console.log("✅ repo_config.json updated successfully.");
    } catch (writeError) {
        console.error(`❌ Error writing to repo_config.json: ${writeError.message}`);
    }
}

/**
 * Retrieves git metadata for a specific file using the current working directory.
 * @param {string} filePath - The absolute path to the file.
 * @returns {Object} An object containing the revision and date string.
 */
function getGitFileMetaData(filePath) {
    const repoPath = process.cwd();
    let rev = "";
    let dateStr = "";
    try {
        rev = execSync(`git log -n 1 --pretty=format:%H -- "${filePath}"`, { cwd: repoPath, stdio: "pipe" }).toString().trim();
        dateStr = execSync(`git log -n 1 --pretty=format:%ci -- "${filePath}"`, { cwd: repoPath, stdio: "pipe" }).toString().trim();
    } catch (err) {
        console.error(`[ERROR] getGitFileMetaData for ${filePath} =>`, err);
    }
    return { rev, dateStr };
}

/**
 * Returns the path to the JSON file for the specified repository.
 */
function getRepoJsonPath(repoName, sessionId) {
    const sessionRoot = resolveSessionRoot(sessionId);
    const repoDir = path.join(sessionRoot, 'repos');
    ensureDir(repoDir);
    return path.join(repoDir, `${sanitizeRepoName(repoName)}.json`);
}

/**
 * Loads JSON data for the specified repository. Creates an empty file if none exists.
 */
function loadRepoJson(repoName, sessionId) {
    const filePath = getRepoJsonPath(repoName, sessionId);
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, "{}", "utf-8");
        return {};
    }
    try {
        return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch (err) {
        console.error("[ERROR] loadRepoJson:", err);
        return {};
    }
}

/**
 * Saves the provided data object to the repository's JSON file.
 */
function saveRepoJson(repoName, data, sessionId) {
    const filePath = getRepoJsonPath(repoName, sessionId);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

function getCodexRunsPath(sessionId) {
    const sessionRoot = resolveSessionRoot(sessionId);
    return path.join(sessionRoot, CODEX_RUN_HISTORY_FILENAME);
}

function loadCodexRunsFromFile(sessionId) {
    const filePath = getCodexRunsPath(sessionId);
    if (fs.existsSync(filePath)) {
        try {
            const raw = fs.readFileSync(filePath, 'utf-8');
            if (!raw.trim()) {
                return [];
            }
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            console.error(`[ERROR] loadCodexRuns: ${error.message}`);
            const backupPath = `${filePath}.corrupt.${Date.now()}`;
            try {
                fs.renameSync(filePath, backupPath);
                console.warn(`[WARN] Backed up unreadable codex runs log to ${backupPath}`);
            } catch (renameError) {
                console.error(`[ERROR] Failed to backup codex runs log: ${renameError.message}`);
            }
            return [];
        }
    }

    // Fallback: check a few legacy/global locations for codex_runs.json
    const fallbackCandidates = [
        path.join(__dirname, CODEX_RUN_HISTORY_FILENAME),
        path.join(__dirname, 'data', CODEX_RUN_HISTORY_FILENAME),
        path.join(__dirname, '..', CODEX_RUN_HISTORY_FILENAME),
        path.join(SESSION_DATA_ROOT, SESSION_FALLBACK_KEY, CODEX_RUN_HISTORY_FILENAME),
    ];

    for (const candidate of fallbackCandidates) {
        try {
            if (!fs.existsSync(candidate)) {
                continue;
            }
            const raw = fs.readFileSync(candidate, 'utf-8');
            if (!raw || !raw.trim()) {
                continue;
            }
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                console.warn(`[WARN] Loaded codex runs from fallback path: ${candidate}`);
                return parsed;
            }
        } catch (err) {
            console.error(`[WARN] loadCodexRuns fallback ${candidate}: ${err.message}`);
        }
    }

    return [];
}

function loadCodexRuns(sessionId) {
    const safeSessionId = sanitizeSessionId(sessionId);
    if (rdsStore.enabled) {
        const stored = rdsStore.getSessionSetting(safeSessionId, CODEX_RUNS_SESSION_KEY);
        if (typeof stored === 'string' && stored.trim()) {
            try {
                const parsed = JSON.parse(stored);
                if (Array.isArray(parsed)) {
                    return parsed;
                }
            } catch (error) {
                console.error(`[ERROR] loadCodexRuns: ${error.message}`);
            }
        }
        if (stored === undefined) {
            rdsStore.prefetchSessionSetting(safeSessionId, CODEX_RUNS_SESSION_KEY);
            const fallback = loadCodexRunsFromFile(sessionId);
            if (fallback.length) {
                rdsStore.setSessionSetting(safeSessionId, CODEX_RUNS_SESSION_KEY, JSON.stringify(fallback));
            }
            return fallback;
        }
        return [];
    }

    return loadCodexRunsFromFile(sessionId);
}

function saveCodexRuns(sessionId, runs) {
    const safeSessionId = sanitizeSessionId(sessionId);
    if (rdsStore.enabled) {
        try {
            rdsStore.setSessionSetting(safeSessionId, CODEX_RUNS_SESSION_KEY, JSON.stringify(runs));
            return;
        } catch (error) {
            console.error(`[ERROR] saveCodexRuns: ${error.message}`);
        }
    }

    const filePath = getCodexRunsPath(sessionId);
    try {
        fs.writeFileSync(filePath, JSON.stringify(runs, null, 2), 'utf-8');
    } catch (error) {
        console.error(`[ERROR] saveCodexRuns: ${error.message}`);
    }
}

function assignNumericId(runs, runRecord) {
    if (!runRecord) {
        return runRecord;
    }

    if (Number.isFinite(runRecord.numericId)) {
        return runRecord;
    }

    try {
        const maxId = runs.reduce((acc, r) => {
            const v = Number(r && r.numericId);
            return Number.isFinite(v) && v > acc ? v : acc;
        }, 0);
        runRecord.numericId = maxId + 1;
    } catch (err) {
        runRecord.numericId = Number(Date.now());
    }

    return runRecord;
}

function appendCodexRun(sessionId, runRecord, maxEntries = 200) {
    if (!runRecord || typeof runRecord !== 'object') {
        return null;
    }

    const runs = loadCodexRuns(sessionId);

    assignNumericId(runs, runRecord);

    runs.unshift(runRecord);
    if (Number.isFinite(maxEntries) && maxEntries > 0 && runs.length > maxEntries) {
        runs.length = maxEntries;
    }
    saveCodexRuns(sessionId, runs);
    return runRecord;
}

function upsertCodexRun(sessionId, runRecord, maxEntries = 200) {
    if (!runRecord || typeof runRecord !== 'object') {
        return null;
    }

    const runs = loadCodexRuns(sessionId);
    const nextRuns = Array.isArray(runs) ? [...runs] : [];

    const runId = typeof runRecord.id === 'string' ? runRecord.id : '';
    const numericId = Number(runRecord.numericId);

    let existingIndex = -1;
    if (runId) {
        existingIndex = nextRuns.findIndex((entry) => entry && entry.id === runId);
    }

    if (existingIndex === -1 && Number.isFinite(numericId)) {
        existingIndex = nextRuns.findIndex((entry) => Number(entry && entry.numericId) === numericId);
    }

    if (existingIndex !== -1) {
        const existing = nextRuns[existingIndex] || {};
        const merged = { ...existing, ...runRecord };
        if (Number.isFinite(existing.numericId) && !Number.isFinite(merged.numericId)) {
            merged.numericId = existing.numericId;
        }
        assignNumericId(nextRuns, merged);
        // Merge updates in place and preserve ordering by start time.
        nextRuns[existingIndex] = merged;
        if (Number.isFinite(maxEntries) && maxEntries > 0 && nextRuns.length > maxEntries) {
            nextRuns.length = maxEntries;
        }
        saveCodexRuns(sessionId, nextRuns);
        return merged;
    }

    assignNumericId(nextRuns, runRecord);
    nextRuns.unshift(runRecord);
    if (Number.isFinite(maxEntries) && maxEntries > 0 && nextRuns.length > maxEntries) {
        nextRuns.length = maxEntries;
    }
    saveCodexRuns(sessionId, nextRuns);
    return runRecord;
}

module.exports = {
    loadRepoConfig,
    loadSingleRepoConfig,
    saveRepoConfig,
    getGitFileMetaData,

    // Newly added exports
    getRepoJsonPath,
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
    saveCodexRuns,
    appendCodexRun,
    upsertCodexRun,
};
