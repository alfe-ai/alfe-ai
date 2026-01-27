import dotenv from "dotenv";
import GitHubClient from "./githubClient.js";
import TaskQueue from "./taskQueue.js";
import TaskDBAws from "./taskDbAws.js";

dotenv.config();

const TaskDB = TaskDBAws;

async function main() {
  try {
    const client = new GitHubClient({
      token: process.env.GITHUB_TOKEN,
      owner: process.env.GITHUB_OWNER,
      repo: process.env.GITHUB_REPO
    });

    const db = new TaskDB(); // uses AWS RDS
    const queue = new TaskQueue();

    const label = process.env.GITHUB_LABEL;
    console.log(
        `[AlfeChat] Fetching tasks from GitHub ${
            label ? `(label='${label}')` : "(all open issues)"
        } …`
    );

    //const issues = await client.fetchOpenIssues(label?.trim() || undefined);
    const issues = null;

    const resolvedIssues = Array.isArray(issues) ? issues : [];

    // Build full repository slug once
    const repositorySlug = `${client.owner}/${client.repo}`;

    // ------------------------------------------------------------------
    // 1. Synchronise local DB
    // ------------------------------------------------------------------
    resolvedIssues.forEach((iss) => db.upsertIssue(iss, repositorySlug));

    // Closed issue detection
    const openIds = resolvedIssues.map((i) => i.id);
    db.markClosedExcept(openIds);

    // ------------------------------------------------------------------
    // 2. Populate in-memory queue (only open issues)
    resolvedIssues.forEach((issue) => queue.enqueue(issue));

    console.log(`[AlfeChat] ${queue.size()} task(s) in queue.`);
    // Intentionally omit printing the full issue list to keep logs concise

    // Debug: show DB snapshot (can be removed)
    // console.debug("[AlfeChat] Current DB state:", db.dump());
  } catch (err) {
    console.error("Fatal:", err.message);
    process.exit(1);
  }
}

main();
