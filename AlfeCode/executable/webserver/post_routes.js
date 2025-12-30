const os = require("os");
const path = require("path");
const fs = require("fs");
const { execSync, spawn } = require("child_process");

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
        DEFAULT_CODEX_MODEL,
        CODEX_MODEL_PATTERN,
        loadCodexRuns,
        upsertCodexRun,
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
    const isTruthyEnvValue = (value) => {
        return (
            typeof value === "string"
            && TRUTHY_ENV_VALUES.includes(value.trim().toLowerCase())
        );
    };
    const MERGE_TEMP_CLEANUP_ENABLED = isTruthyEnvValue(process.env.STERLING_MERGE_CLEANUP_ENABLED);

    const normaliseRunId = (value) => (typeof value === "string" ? value.trim() : "");

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

        const providerRaw = (req.body.aiProvider || "openrouter").toString().trim();
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

        if (typeof saveCodexConfig !== "function" || typeof loadCodexConfig !== "function") {
            return res.status(500).json({ error: "Agent configuration storage is unavailable." });
        }

        let previousDefault = "";
        try {
            const existingConfig = loadCodexConfig();
            if (existingConfig && typeof existingConfig.defaultModel === "string") {
                previousDefault = existingConfig.defaultModel;
            } else if (typeof getDefaultCodexModel === "function") {
                previousDefault = getDefaultCodexModel();
            }

            const updatedConfig = {
                ...existingConfig,
                defaultModel: rawModel,
            };
            saveCodexConfig(updatedConfig);

            return res.json({
                defaultModel: rawModel,
                previousDefaultModel: previousDefault,
                fallbackDefaultModel: DEFAULT_CODEX_MODEL || "",
                message: "Agent default model updated.",
            });
        } catch (error) {
            console.error("[ERROR] /agent/default-model:", error);
            return res.status(500).json({ error: "Failed to save Agent default model." });
        }
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

        function finalize(localPath) {
            repoConfig[repoName] = {
                gitRepoLocalPath: localPath,
                gitRepoURL: gitRepoURL || "",
                gitBranch: "main",
                openAIAccount: "",
            };
            saveRepoConfig(repoConfig, sessionId);
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

        cloneRepository(repoName, gitRepoURL, sessionId, (err, localPath) => {
            if (err) {
                console.error("[ERROR] cloneRepository:", err);
                if (err.sshKeyRequired) {
                    return res.status(400).render("add_repository", {
                        serverCWD: process.cwd(),
                        cloneError:
                            "GitHub SSH authentication failed. Add a GitHub SSH key to continue cloning.",
                        sshKeyRequired: true,
                        repoNameValue: repoName,
                        gitRepoURLValue: gitRepoURL,
                    });
                }
                return res.status(500).send("Failed to clone repository.");
            }
            finalize(localPath);
        });
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
        chatData.aiProvider = aiProvider;
        dataObj[chatNumber] = chatData;
        saveRepoJson(gitRepoNameCLI, dataObj, sessionId);

        const provider = aiProvider.toLowerCase();
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
            chatData.aiProvider = chatData.aiProvider || "openrouter";

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
                execSync(`git checkout "${targetBranch}"`, { cwd: gitRepoLocalPath, stdio: "pipe" });
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

            return res.json({ message: 'Branch updated and pushed.', output: stdout, errorOutput: stderr });
        } catch (err) {
            console.error('[ERROR] /agent/update-branch:', err);
            return res.status(500).json({ error: 'Internal server error' });
        }
    });

}

module.exports = { setupPostRoutes };
