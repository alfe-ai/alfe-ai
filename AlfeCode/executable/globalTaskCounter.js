#!/usr/bin/env node
const fs = require("fs");
const os = require("os");
const path = require("path");

function resolveStateRoot() {
    const explicitDir = process.env.STERLING_GLOBAL_STATE_DIR;
    if (explicitDir && explicitDir.trim()) {
        return path.resolve(explicitDir.trim());
    }

    const xdgStateHome = process.env.XDG_STATE_HOME;
    if (xdgStateHome && xdgStateHome.trim()) {
        return path.join(xdgStateHome.trim(), "sterlingcodex");
    }

    const xdgDataHome = process.env.XDG_DATA_HOME;
    if (xdgDataHome && xdgDataHome.trim()) {
        return path.join(xdgDataHome.trim(), "sterlingcodex", "state");
    }

    const homeDir = typeof os.homedir === "function" ? os.homedir() : null;
    if (homeDir && homeDir.trim()) {
        return path.join(homeDir.trim(), ".local", "state", "sterlingcodex");
    }

    return path.join(os.tmpdir(), "sterlingcodex_state");
}

// The state root defaults to a user-writable location (XDG paths or the home directory)
// to avoid permission errors when Sterling runs in shared workspaces.
const STATE_ROOT = resolveStateRoot();
const STATE_FILE = path.join(STATE_ROOT, "global_agent_task_state.json");
const LOCK_DIR = path.join(STATE_ROOT, ".locks", "global_agent_task");
const DEFAULT_BASE_TITLE = "Alfe Agent";

function ensureDirectory(targetPath) {
    try {
        fs.mkdirSync(targetPath, { recursive: true, mode: 0o700 });
    } catch (error) {
        if (error && error.code !== "EEXIST") {
            throw new Error(
                `Unable to create directory at ${targetPath}: ${error.message}`
            );
        }
    }
}

function sanitizeBaseTitle(baseTitle) {
    if (typeof baseTitle !== "string") {
        return DEFAULT_BASE_TITLE;
    }
    const trimmed = baseTitle.trim();
    if (!trimmed) {
        return DEFAULT_BASE_TITLE;
    }
    return trimmed.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ");
}

function acquireLock(timeoutMs = 5000) {
    const start = Date.now();
    ensureDirectory(path.dirname(LOCK_DIR));
    const sleeper = new Int32Array(new SharedArrayBuffer(4));
    while (true) {
        try {
            fs.mkdirSync(LOCK_DIR, { recursive: false, mode: 0o700 });
            return;
        } catch (error) {
            if (error && error.code === "EEXIST") {
                if (Date.now() - start > timeoutMs) {
                    throw new Error("Timed out acquiring global agent task lock.");
                }
                Atomics.wait(sleeper, 0, 0, 25);
                continue;
            }
            throw error;
        }
    }
}

function releaseLock() {
    try {
        fs.rmdirSync(LOCK_DIR);
    } catch (error) {
        if (error && error.code !== "ENOENT") {
            console.warn(`[WARN] Failed to release global agent task lock: ${error.message}`);
        }
    }
}

function loadStateFromDisk() {
    const initialState = { lastTaskId: 0, updatedAt: null };
    try {
        const raw = fs.readFileSync(STATE_FILE, "utf8");
        const parsed = JSON.parse(raw);
        if (typeof parsed.lastTaskId === "number" && Number.isFinite(parsed.lastTaskId) && parsed.lastTaskId >= 0) {
            initialState.lastTaskId = Math.floor(parsed.lastTaskId);
        }
        if (typeof parsed.updatedAt === "string") {
            initialState.updatedAt = parsed.updatedAt;
        }
    } catch (error) {
        if (error && error.code !== "ENOENT") {
            console.warn(`[WARN] Failed to load global agent task state: ${error.message}`);
        }
    }
    return initialState;
}

function persistState(state) {
    ensureDirectory(path.dirname(STATE_FILE));
    const payload = {
        lastTaskId: state.lastTaskId,
        updatedAt: state.updatedAt,
    };
    fs.writeFileSync(STATE_FILE, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function getNextTaskId() {
    acquireLock();
    let state;
    try {
        state = loadStateFromDisk();
        const nextId = Math.max(0, Number(state.lastTaskId) || 0) + 1;
        state.lastTaskId = nextId;
        state.updatedAt = new Date().toISOString();
        persistState(state);
        return nextId;
    } finally {
        releaseLock();
    }
}

function peekLastTaskId() {
    const state = loadStateFromDisk();
    return Math.max(0, Number(state.lastTaskId) || 0);
}

function formatTaskTitle(baseTitle, taskId) {
    const safeBase = sanitizeBaseTitle(baseTitle);
    return `${safeBase} Task${taskId}`;
}

function getNextTaskInfo(baseTitle) {
    const taskId = getNextTaskId();
    const title = formatTaskTitle(baseTitle, taskId);
    return { taskId, title };
}

function getNextTaskTitle(baseTitle) {
    return getNextTaskInfo(baseTitle).title;
}

module.exports = {
    getNextTaskId,
    getNextTaskTitle,
    getNextTaskInfo,
    peekLastTaskId,
    formatTaskTitle,
    sanitizeBaseTitle,
};

if (require.main === module) {
    const [, , command = "next-title", ...rest] = process.argv;
    try {
        if (command === "next-id") {
            const nextId = getNextTaskId();
            process.stdout.write(String(nextId));
            return;
        }
        if (command === "peek") {
            const currentId = peekLastTaskId();
            process.stdout.write(String(currentId));
            return;
        }
        if (command === "next-title") {
            const baseTitle = rest[0] || DEFAULT_BASE_TITLE;
            const title = getNextTaskTitle(baseTitle);
            process.stdout.write(title);
            return;
        }
        if (command === "next-info") {
            const baseTitle = rest[0] || DEFAULT_BASE_TITLE;
            const info = getNextTaskInfo(baseTitle);
            process.stdout.write(`${info.taskId}\t${info.title}`);
            return;
        }
        console.error(
            "Usage: globalTaskCounter.js [next-info|next-title|next-id|peek] [baseTitle]"
        );
        process.exit(1);
    } catch (error) {
        console.error(`[ERROR] ${error.message}`);
        process.exit(1);
    }
}
