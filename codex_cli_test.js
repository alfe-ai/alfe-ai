#!/usr/bin/env node
/*  codex_cli_test.js - Fixed version */
const fetch = typeof globalThis.fetch === "function"
    ? globalThis.fetch
    : async (...args) => {
        const { default: fetch } = await import("node-fetch");
        return fetch(...args);
      };

const readline = require("node:readline");

// ─── CONFIG ────────────────────────────────────────
const API_KEY   = process.env.OPENAI_API_KEY || "PASTE-YOUR-KEY-HERE";
const MODEL     = "codex-mini-latest";
const ENDPOINT  = "https://api.openai.com/v1/responses";
// ──────────────────────────────────────────────────

const getPrompt = async () => {
  const cliPrompt = process.argv.slice(2).join(" ").trim();
  if (cliPrompt) return cliPrompt;
  
  const rl = readline.createInterface({ 
    input: process.stdin, 
    output: process.stdout 
  });
  return new Promise(res => 
    rl.question("Prompt: ", ans => { 
      rl.close(); 
      res(ans); 
    })
  );
};

const main = async () => {
  const promptText = await getPrompt();
  if (!API_KEY || API_KEY === "PASTE-YOUR-KEY-HERE") {
    console.error("✖ Set OPENAI_API_KEY env var or edit API_KEY constant");
    process.exit(1);
  }

  // FIXED: Use correct parameters for /responses endpoint
  const body = {
    model: MODEL,
    prompt: promptText,
    max_tokens: 128,       // Now supported after removing messages[]
    temperature: 0.2
  };

  try {
    const r = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${API_KEY}`,
      },
      body: JSON.stringify(body)
    });

    if (!r.ok) {
      const err = await r.text();
      throw new Error(`HTTP ${r.status}: ${err}`);
    }

    const json = await r.json();
    const responseText = json.choices?.?.text ?? "(no content)";
    console.log("\n— Codex reply —\n");
    console.log(responseText.trim());
  } catch (e) {
    console.error("Request failed:", e.message);
    process.exit(1);
  }
};

main();
