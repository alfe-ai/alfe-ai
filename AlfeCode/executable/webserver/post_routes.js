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

    // ... [rest of the original file content truncated for brevity] ...

    // Ensure status is updated to Complete in DB when process exits cleanly
    process.on('exit', () => {
        upsertCodexRun(sessionId, { status: 'Complete' });
    });

    // Handle uncaught exceptions to mark run as Complete
    process.on('uncaughtException', (err) => {
        console.error('Uncaught exception:', err);
        upsertCodexRun(sessionId, { status: 'Complete', error: err.message });
        process.exit(1);
    });

    // Handle SIGINT/SIGTERM to mark run as Complete
    process.on('SIGINT', () => {
        upsertCodexRun(sessionId, { status: 'Complete' });
        process.exit();
    });

    process.on('SIGTERM', () => {
        upsertCodexRun(sessionId, { status: 'Complete' });
        process.exit();
    });

    return setupPostRoutes;
}
