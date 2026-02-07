import os
import re

# Read the original file
file_path = "/git/sterling/b9a3f01e-013f-4988-96ba-f733d59dd247/alfe-ai-1770478756854/AlfeCode/executable/webserver/get_routes.js"
with open(file_path, 'r') as f:
    content = f.read()

# Define the function to add
new_function = '''
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
'''

# Find the pattern to insert after
pattern = r'(\s+}\);\s+const shouldApplyCodexPatch = \(model\) => \{)'

# Replace the pattern with the pattern + new function
new_content = re.sub(pattern, r'\1' + new_function, content)

# Write the modified content back
with open(file_path, 'w') as f:
    f.write(new_content)

print("Function added successfully")