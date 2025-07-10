#!/usr/bin/env node
/*  codex_cli_test.js
 *  Quick command-line tester for the OpenRouter "codex-mini-latest" model.
 *  Usage:  node codex_cli_test.js "your code prompt here"
 */

// Node ≥18 exposes a global `fetch` function. Fall back to `node-fetch`
// via dynamic import on older versions.
const fetch =
  typeof globalThis.fetch === "function"
    ? globalThis.fetch
    : async (...args) => {
        const { default: fetch } = await import("node-fetch");
        return fetch(...args);
      };

const readline = require("node:readline"); // Only for interactive fallback

// ─── CONFIG ────────────────────────────────────────
const API_KEY   = process.env.OPENROUTER_API_KEY || "PASTE-YOUR-KEY-HERE";
const MODEL     = "openai/codex-mini-latest";
const ENDPOINT  = "https://openrouter.ai/api/v1/chat/completions";
// ────────────────────────────────────────────

// Grab prompt from CLI or fall back to stdin.
const cliPrompt = process.argv.slice(2).join(" ").trim();
const getPrompt = async () => {
  if (cliPrompt) return cliPrompt;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(res => rl.question("Prompt: ", ans => { rl.close(); res(ans); }));
};

const main = async () => {
  const promptText = await getPrompt();
  if (!API_KEY || API_KEY === "PASTE-YOUR-KEY-HERE") {
    console.error("\u274c  Set OPENROUTER_API_KEY env var or edit API_KEY constant"); process.exit(1);
  }

  const body = {
    model: MODEL,
    messages: [{ role: "user", content: promptText }],
    max_tokens: 128,
    temperature: 0.2
  };

  const r = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${API_KEY}`,
      "HTTP-Referer": "localhost",            // complies with OpenRouter TOS
      "X-Title": "CLI Codex test"
    },
    body: JSON.stringify(body)
  });

  if (!r.ok) {
    const err = await r.text();
    throw new Error(`HTTP ${r.status}: ${err}`);
  }

  const json = await r.json();
  const assistantMsg = json.choices?.[0]?.message?.content ?? "(no content)";
  console.log("\n— Codex reply —\n");
  console.log(assistantMsg.trim());
};

main().catch(e => {
  console.error("Request failed:", e.message);
  process.exit(1);
});
