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