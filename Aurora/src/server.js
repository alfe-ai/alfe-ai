import dotenv from "dotenv";
import fs from "fs";
import { mkdir, readFile, writeFile, access, unlink, readdir } from "fs/promises";
import path from "path";
import https from "https";
import { URL, fileURLToPath } from "url";
import Jimp from "jimp";
import GitHubClient from "./githubClient.js";
import TaskQueue from "./taskQueue.js";
import TaskDBAws from "./taskDbAws.js";

dotenv.config();

const TaskDB = TaskDBAws;
import { pbkdf2Sync, randomBytes, randomUUID } from "crypto";
import speakeasy from "speakeasy";

function parseBooleanEnv(value, defaultValue = false) {
  if (typeof value === "undefined" || value === null) {
    return defaultValue;
  }
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }
  return defaultValue;
}

const accountsEnabled = parseBooleanEnv(process.env.ACCOUNTS_ENABLED, false);
const IMAGE_UPLOAD_ENABLED = parseBooleanEnv(process.env.IMAGE_UPLOAD_ENABLED, false);
const SEARCH_ENABLED_2026 = parseBooleanEnv(process.env.SEARCH_ENABLED_2026, true);
const IMAGES_ENABLED_2026 = parseBooleanEnv(process.env.IMAGES_ENABLED_2026, true);
const TWO_FACTOR_ENABLED_2026 = parseBooleanEnv(
  process.env["2FA_ENABLED_2026"],
  false
);
const MIN_PASSWORD_LENGTH = 8;

const CODE_ALFE_REDIRECT_TARGET = "https://code.alfe.sh";
const codeAlfeRedirectEnabled = parseBooleanEnv(
  process.env.CODE_ALFE_REDIRECT,
  false
);

function normalizeSterlingBaseUrl(url) {
  return url.replace(/\/+$/, "");
}

const sterlingBaseUrlInput = process.env.STERLING_BASE_URL?.trim();
const sterlingBaseUrl = sterlingBaseUrlInput
  ? normalizeSterlingBaseUrl(sterlingBaseUrlInput)
  : undefined;
const sterlingApiBaseUrl =
  sterlingBaseUrl && sterlingBaseUrl.endsWith("/api")
    ? sterlingBaseUrl
    : sterlingBaseUrl
      ? `${sterlingBaseUrl}/api`
      : undefined;

const origDebug = console.debug.bind(console);
console.debug = (...args) => {
  const ts = new Date().toISOString();
  origDebug(`[${ts}]`, ...args);
};
const origLog = console.log.bind(console);
console.log = (...args) => {
  const ts = new Date().toISOString();
  origLog(`[${ts}]`, ...args);
};
const origError = console.error.bind(console);
console.error = (...args) => {
  const ts = new Date().toISOString();
  origError(`[${ts}]`, ...args);
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectViewDataFile = path.join(
  __dirname,
  "../data/projectView/projects.json"
);

const projectViewQueueFile = path.join(
  __dirname,
  "../data/projectView/queue.json"
);

const legacyProjectViewDataFile = path.join(
  __dirname,
  "../../ProjectView/data/projects.json"
);

let projectViewDataMigrationPromise = null;

function getDbConnectionInfo() {
  const {
    AWS_DB_URL,
    AWS_DB_HOST,
    AWS_DB_USER,
    AWS_DB_NAME,
    AWS_DB_PORT,
    AWS_DB_SSL,
    AWS_DB_SSL_MODE
  } = process.env;
  const info = {
    type: "postgres",
    source: "AWS RDS",
    host: "",
    port: "",
    database: "",
    user: "",
    ssl: Boolean(AWS_DB_SSL === "true" || AWS_DB_SSL_MODE)
  };

  if (AWS_DB_URL) {
    try {
      const parsed = new URL(AWS_DB_URL);
      info.host = parsed.hostname;
      info.port = parsed.port || "5432";
      info.database = parsed.pathname?.replace(/^\/+/, "") || "";
      info.user = parsed.username || "";
    } catch (err) {
      console.error("[Server Debug] Failed to parse AWS_DB_URL:", err);
    }
  } else {
    info.host = AWS_DB_HOST || "";
    info.port = AWS_DB_PORT || "5432";
    info.database = AWS_DB_NAME || "";
    info.user = AWS_DB_USER || "";
  }

  return info;
}

async function migrateLegacyProjectViewDataIfNeeded() {
  if (!projectViewDataMigrationPromise) {
    projectViewDataMigrationPromise = (async () => {
      try {
        await access(legacyProjectViewDataFile);
      } catch (err) {
        if (err?.code === "ENOENT") {
          return;
        }

        console.warn(
          "[ProjectView] Skipping legacy data migration: unable to access legacy file:",
          err
        );
        return;
      }

      try {
        const legacyPayload = await readFile(legacyProjectViewDataFile, "utf-8");
        await mkdir(path.dirname(projectViewDataFile), { recursive: true });
        await writeFile(projectViewDataFile, legacyPayload, "utf-8");

        try {
          await unlink(legacyProjectViewDataFile);
        } catch (removeErr) {
          if (removeErr?.code !== "ENOENT") {
            console.warn(
              "[ProjectView] Migrated legacy data but failed to remove original file:",
              removeErr
            );
          }
        }

        console.log(
          "[ProjectView] Migrated legacy projects.json to Aurora/data/projectView/projects.json"
        );
      } catch (migrationErr) {
        console.error(
          "[ProjectView] Failed to migrate legacy ProjectView data:",
          migrationErr
        );
      }
    })();
  }

  return projectViewDataMigrationPromise;
}

async function loadGlobalProjectViewData(dataDir) {
  try {
    const file = await readFile(projectViewDataFile, "utf-8");
    return JSON.parse(file);
  } catch (err) {
    if (err?.code !== "ENOENT") {
      throw err;
    }
  }

  try {
    const entries = await readdir(dataDir, { withFileTypes: true });
    const fallbackFiles = entries
      .filter(
        (entry) =>
          entry.isFile() &&
          entry.name.endsWith(".json") &&
          !entry.name.endsWith(".queue.json") &&
          entry.name !== path.basename(projectViewDataFile)
      )
      .map((entry) => entry.name)
      .sort();

    for (const name of fallbackFiles) {
      const fullPath = path.join(dataDir, name);
      try {
        const payload = await readFile(fullPath, "utf-8");
        const parsed = JSON.parse(payload);
        await mkdir(dataDir, { recursive: true });
        await writeFile(projectViewDataFile, JSON.stringify(parsed, null, 2), "utf-8");
        console.log(
          `[ProjectView] Seeded ${path.basename(projectViewDataFile)} from existing ${name}`
        );
        return parsed;
      } catch (fallbackErr) {
        console.warn(
          `[ProjectView] Unable to seed projects.json from ${name}:`,
          fallbackErr
        );
      }
    }
  } catch (dirErr) {
    if (dirErr?.code !== "ENOENT") {
      throw dirErr;
    }
  }

  return null;
}

async function readProjectViewProjects(sessionId) {
  await migrateLegacyProjectViewDataIfNeeded();
  const dataDir = path.dirname(projectViewDataFile);
  if (sessionId) {
    const sessionFile = path.join(dataDir, `${sessionId}.json`);
    try {
      const file = await readFile(sessionFile, "utf-8");
      return JSON.parse(file);
    } catch (err) {
      if (err?.code === "ENOENT") {
        const fallback = await loadGlobalProjectViewData(dataDir);
        if (fallback) {
          await mkdir(dataDir, { recursive: true });
          await writeFile(sessionFile, JSON.stringify(fallback, null, 2), "utf-8");
          return fallback;
        }
        return [];
      }
      throw err;
    }
  }

  const globalProjects = await loadGlobalProjectViewData(dataDir);
  return globalProjects ?? [];
}

async function writeProjectViewProjects(projects, sessionId) {
  await migrateLegacyProjectViewDataIfNeeded();
  const dataDir = path.dirname(projectViewDataFile);
  await mkdir(dataDir, { recursive: true });
  const payload = JSON.stringify(projects, null, 2);
  if (sessionId) {
    const sessionFile = path.join(dataDir, `${sessionId}.json`);
    await writeFile(sessionFile, payload, "utf-8");
    await writeFile(projectViewDataFile, payload, "utf-8");
  } else {
    await writeFile(projectViewDataFile, payload, "utf-8");
  }
}


async function readProjectViewQueue(sessionId) {
  await migrateLegacyProjectViewDataIfNeeded();
  try {
    const dataDir = path.dirname(projectViewDataFile);
    if (sessionId) {
      const sessionFile = path.join(dataDir, `${sessionId}.queue.json`);
      try {
        const file = await readFile(sessionFile, "utf-8");
        return JSON.parse(file);
      } catch (err) {
        if (err?.code === "ENOENT") {
          try {
            const globalFile = await readFile(projectViewQueueFile, "utf-8");
            const parsed = JSON.parse(globalFile);
            await mkdir(dataDir, { recursive: true });
            await writeFile(sessionFile, JSON.stringify(parsed, null, 2), "utf-8");
            return parsed;
          } catch (globalErr) {
            if (globalErr?.code === "ENOENT") {
              return [];
            }
            throw globalErr;
          }
        }
        throw err;
      }
    }

    try {
      const file = await readFile(projectViewQueueFile, "utf-8");
      return JSON.parse(file);
    } catch (err) {
      if (err?.code === "ENOENT") {
        return [];
      }
      throw err;
    }
  } catch (err) {
    throw err;
  }
}

async function writeProjectViewQueue(queue, sessionId) {
  await migrateLegacyProjectViewDataIfNeeded();
  const dataDir = path.dirname(projectViewDataFile);
  await mkdir(dataDir, { recursive: true });
  const payload = JSON.stringify(queue, null, 2);
  if (sessionId) {
    const sessionFile = path.join(dataDir, `${sessionId}.queue.json`);
    await writeFile(sessionFile, payload, "utf-8");
  } else {
    await writeFile(projectViewQueueFile, payload, "utf-8");
  }
}


async function main() {
  try {
    const db = new TaskDB(); // uses AWS RDS
    const queue = new TaskQueue();

    const tasks = await db.listTasks(true);
    tasks.forEach(t => queue.enqueue(t));
    console.log(`[AlfeChat] ${queue.size()} task(s) loaded from DB.`);
    // Intentionally omit printing the full issue list to keep logs concise

    // Debug: show DB snapshot (can be removed)
    // console.debug("[AlfeChat] Current DB state:", db.dump());
  } catch (err) {
    console.error("Fatal:", err.message);
    process.exit(1);
  }
}

main();

import express from "express";
import sterlingProxy from './sterlingproxy.js';

import cors from "cors";
import bodyParser from "body-parser";
import multer from "multer";
import compression from "compression";
import OpenAI from "openai";
import { encoding_for_model } from "tiktoken";
import axios from "axios";

import os from "os";
import child_process from "child_process";
import JobManager from "./jobManager.js";
import PrintifyJobQueue from "./printifyJobQueue.js";
import { extractProductUrl, extractPrintifyUrl, extractUpdatedTitle } from "./printifyUtils.js";

// Simple in-memory cache for AI model list
let aiModelsCache = null;
let aiModelsCacheTs = 0;
const AI_MODELS_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// Instantiate the configured TaskDB backend.
const db = new TaskDB();
const DEFAULT_CHAT_MODEL = (process.env.AI_MODEL && process.env.AI_MODEL.trim()) ||
  "openai/gpt-oss-20b";
const DEFAULT_SEARCH_MODEL = "openai/gpt-4o-mini-search-preview";
console.debug(`[Server Debug] Using default chat model => ${DEFAULT_CHAT_MODEL}`);

const LIMITS_ENABLED = parseBooleanEnv(process.env.AURORA_LIMITS_ENABLED, true);
const FREE_IMAGE_LIMIT = LIMITS_ENABLED ? parseInt(process.env.AURORA_FREE_IMAGE_LIMIT || process.env.FREE_IMAGE_LIMIT || '10', 10) : Number.POSITIVE_INFINITY;
const FREE_SEARCH_LIMIT = LIMITS_ENABLED ? parseInt(process.env.AURORA_FREE_SEARCH_LIMIT || process.env.FREE_SEARCH_LIMIT || '10', 10) : Number.POSITIVE_INFINITY;

const SESSION_SETTING_KEYS = new Set(["last_chat_tab"]);

function isSessionSettingKey(key) {
  return SESSION_SETTING_KEYS.has(key);
}

function readSessionAwareSetting(sessionId, key) {
  if (!isSessionSettingKey(key)) {
    return db.getSetting(key);
  }
  const normalizedSessionId = sessionId || "";
  try {
    const sessionValue = db.getSessionSetting(normalizedSessionId, key);
    if (typeof sessionValue !== "undefined") {
      return sessionValue;
    }
  } catch (err) {
    console.error(`[Server Debug] Failed reading session setting ${key} for ${normalizedSessionId.slice(0, 8)}…:`, err);
  }
  const fallback = db.getSetting(key);
  if (typeof fallback !== "undefined" && normalizedSessionId) {
    try {
      db.setSessionSetting(normalizedSessionId, key, fallback);
    } catch (err) {
      console.error(`[Server Debug] Failed seeding session setting ${key} for ${normalizedSessionId.slice(0, 8)}…:`, err);
    }
  }
  return fallback;
}

function writeSessionAwareSetting(sessionId, key, value) {
  if (!isSessionSettingKey(key)) {
    db.setSetting(key, value);
    return;
  }
  const normalizedSessionId = sessionId || "";
  try {
    if (normalizedSessionId) {
      db.setSessionSetting(normalizedSessionId, key, value);
    } else {
      db.setSetting(key, value);
    }
  } catch (err) {
    console.error(`[Server Debug] Failed writing session setting ${key} for ${normalizedSessionId.slice(0, 8)}…:`, err);
  }
}

async function buildContextsForTab(tabInfo) {
  const savedInstructions = db.getSetting("agent_instructions") || "";
  let systemContext = `System Context:\n${savedInstructions}`;
  let projectContext = '';

  if (tabInfo && tabInfo.send_project_context && (tabInfo.project_name || tabInfo.extra_projects)) {
    const allProjects = [];
    if (tabInfo.project_name && tabInfo.project_name.trim()) {
      allProjects.push(tabInfo.project_name.trim());
    }
    if (tabInfo.extra_projects) {
      tabInfo.extra_projects.split(',').forEach(p => {
        p = p.trim();
        if (p && !allProjects.includes(p)) allProjects.push(p);
      });
    }

    const histories = [];
    for (const pr of allProjects) {
      const projectPairs = db.getChatPairsByProject(pr);
      const pairsByTab = {};
      for (const p of projectPairs) {
        const tab = await db.getChatTab(p.chat_tab_id);
        const tName = (tab && tab.name) ? tab.name : `Chat ${p.chat_tab_id}`;
        if (!pairsByTab[tName]) pairsByTab[tName] = [];
        pairsByTab[tName].push(p);
      }
      const lines = [`Project: ${pr}`];
      for (const [chatName, ps] of Object.entries(pairsByTab)) {
        lines.push(`Chat: ${chatName}`);
        ps.forEach(cp => {
          if (cp.user_text) lines.push(`User: ${cp.user_text}`);
          if (cp.ai_text) lines.push(`Assistant: ${cp.ai_text}`);
        });
      }
      histories.push(lines.join('\n'));
    }
    projectContext = histories.join('\n');
  }

  return { systemContext, projectContext };
}

console.debug("[Server Debug] Checking or setting default 'ai_search_model' in DB...");
const currentSearchModel = db.getSetting("ai_search_model");
if (!currentSearchModel) {
  console.debug(
    `[Server Debug] 'ai_search_model' is missing in DB, setting default to '${DEFAULT_SEARCH_MODEL}'.`
  );
  db.setSetting("ai_search_model", DEFAULT_SEARCH_MODEL);
} else if (isDeprecatedSearchModel(currentSearchModel)) {
  console.debug(
    `[Server Debug] 'ai_search_model' found legacy value '${currentSearchModel}', updating to '${DEFAULT_SEARCH_MODEL}'.`
  );
  db.setSetting("ai_search_model", DEFAULT_SEARCH_MODEL);
} else {
  console.debug("[Server Debug] 'ai_search_model' found =>", currentSearchModel);
}

console.debug("[Server Debug] Checking or setting default 'ai_chatsearch_model' in DB...");
const currentChatSearchModel = db.getSetting("ai_chatsearch_model");
if (!currentChatSearchModel) {
  console.debug("[Server Debug] 'ai_chatsearch_model' is missing in DB, setting default to 'openai/gpt-4o'.");
  db.setSetting("ai_chatsearch_model", "openai/gpt-4o");
} else {
  console.debug("[Server Debug] 'ai_chatsearch_model' found =>", currentChatSearchModel);
}

console.debug("[Server Debug] Checking or setting default 'ai_reasoning_model' in DB...");
const currentReasoningModel = db.getSetting("ai_reasoning_model");
if (!currentReasoningModel) {
  console.debug("[Server Debug] 'ai_reasoning_model' is missing in DB, setting default to 'openai/o4-mini'.");
  db.setSetting("ai_reasoning_model", "openai/o4-mini");
} else {
  console.debug("[Server Debug] 'ai_reasoning_model' found =>", currentReasoningModel);
}

console.debug("[Server Debug] Checking or setting default 'ai_vision_model' in DB...");
const currentVisionModel = db.getSetting("ai_vision_model");
if (!currentVisionModel) {
  console.debug("[Server Debug] 'ai_vision_model' is missing in DB, setting default to 'openai/gpt-4o'.");
  db.setSetting("ai_vision_model", "openai/gpt-4o");
} else {
  console.debug("[Server Debug] 'ai_vision_model' found =>", currentVisionModel);
}

console.debug("[Server Debug] Checking or setting default 'ai_service' in DB...");
if (!db.getSetting("ai_service")) {
  db.setSetting("ai_service", "openrouter");
}

// Theme configuration removed; using default dark style

console.debug("[Server Debug] Checking or setting default 'image_gen_service' in DB...");
if (!db.getSetting("image_gen_service")) {
  db.setSetting("image_gen_service", "openai");
}

console.debug("[Server Debug] Checking or setting default 'image_gen_model' in DB...");
if (!db.getSetting("image_gen_model")) {
  db.setSetting("image_gen_model", "gptimage1");
}

console.debug("[Server Debug] Checking or setting default 'image_upload_enabled' in DB...");
if (db.getSetting("image_upload_enabled") === undefined) {
  db.setSetting("image_upload_enabled", IMAGE_UPLOAD_ENABLED);
}

console.debug("[Server Debug] Checking or setting default 'show_session_id' in DB...");
if (db.getSetting("show_session_id") === undefined) {
  db.setSetting("show_session_id", false);
}

console.debug("[Server Debug] Checking or setting default 'remove_color_swatches' in DB...");
if (db.getSetting("remove_color_swatches") === undefined) {
  db.setSetting("remove_color_swatches", false);
}

console.debug("[Server Debug] Checking or setting default 'search_enabled' in DB...");
if (db.getSetting("search_enabled") === undefined) {
  db.setSetting("search_enabled", false);
}

console.debug("[Server Debug] Checking or setting default 'reasoning_enabled' in DB...");
if (db.getSetting("reasoning_enabled") === undefined) {
  db.setSetting("reasoning_enabled", false);
}

console.debug("[Server Debug] Checking or setting default 'ai_responses_enabled' in DB...");
if (db.getSetting("ai_responses_enabled") === undefined) {
  db.setSetting("ai_responses_enabled", true);
}

console.debug("[Server Debug] Checking or setting default 'new_tab_opens_search' in DB...");
if (db.getSetting("new_tab_opens_search") === undefined) {
  db.setSetting("new_tab_opens_search", false);
}

const app = express();

// Auto-hide cookie banner when requested via env var HIDE_COOKIE_BANNER=true
const _hideCookieBanner = parseBooleanEnv(process.env.HIDE_COOKIE_BANNER, false);
if (_hideCookieBanner) {
  app.use((req, res, next) => {
    const _send = res.send.bind(res);
    res.send = function (body) {
      try {
        if (typeof body === 'string') {
          const inject = "<script>try{localStorage.setItem('cookieAccepted','yes');}catch(e){};</script>";
          if (body.includes('</head>')) {
            body = body.replace('</head>', inject + '</head>');
          } else if (body.includes('</body>')) {
            body = body.replace('</body>', inject + '</body>');
          }
        }
      } catch (e) {
        // ignore
      }
      return _send(body);
    };
    next();
  });
}

// Auto-hide theme selector when requested via env var HIDE_THEME_OPTION=true
const hideThemeOption = parseBooleanEnv(process.env.HIDE_THEME_OPTION, false);
const collapseReasoningByDefaultVisible = parseBooleanEnv(
  process.env.COLLAPSE_REASONING_BY_DEFAULT_VISIBLE,
  false
);
if (hideThemeOption) {
  app.use((req, res, next) => {
    const _send = res.send.bind(res);
    res.send = function (body) {
      try {
        if (typeof body === 'string') {
          const inject = "<script>try{window.addEventListener('DOMContentLoaded',()=>{const el=document.getElementById('themeSection');if(el){el.style.display='none';}});}catch(e){};</script>";
          if (body.includes('</body>')) {
            body = body.replace('</body>', inject + '</body>');
          } else if (body.includes('</head>')) {
            body = body.replace('</head>', inject + '</head>');
          }
        }
      } catch (e) {
        // ignore
      }
      return _send(body);
    };
    next();
  });
}



// Serve Sterling proxy either via the internal mock splash pages or by redirecting
// to an externally hosted Sterling instance when STERLINGPROXY_URL is provided.
const sterlingProxyTarget = (process.env.STERLINGPROXY_URL || '').trim();
if(sterlingProxyTarget){
  const normalizedTarget = sterlingProxyTarget.replace(/\/$/, '');
  app.use('/sterlingproxy', (req, res) => {
    const suffix = req.originalUrl.replace(/^\/sterlingproxy/, '') || '';
    res.redirect(302, `${normalizedTarget}${suffix}`);
  });
  app.get('/code', (req, res) => {
    const qs = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
    // Redirect /code to the external Sterling instance's /splash so the external :3333 server
    // serves the splash page (preserve query string)
    res.redirect(302, `${normalizedTarget}/splash${qs}`);
  });
} else {
  app.use('/sterlingproxy', sterlingProxy);
  app.get('/code', (req, res) => {
    const qs = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
    res.redirect(302, `/sterlingproxy/splash${qs}`);
  });
}


app.use(compression());
// Body parser must come before any routes that access req.body
app.use(bodyParser.json());
const jobHistoryPath = path.join(__dirname, "../jobsHistory.json");
const jobManager = new JobManager({ historyPath: jobHistoryPath });

// Printify configuration
// Support both legacy PRINTIFY_TOKEN and the newer PRINTIFY_API_TOKEN env vars
const printifyToken =
  process.env.PRINTIFY_API_TOKEN || process.env.PRINTIFY_TOKEN || "";
// Allow overriding the default shop ID via PRINTIFY_SHOP_ID
const shopId = process.env.PRINTIFY_SHOP_ID || 18663958;

/**
 * Returns a configured OpenAI client, depending on "ai_service" setting.
 * Added checks to help diagnose missing or invalid API keys.
 */
function getOpenAiClient(options = {}) {
  let preferredModel = null;
  let serviceOverride = null;

  if (typeof options === "string") {
    preferredModel = options;
  } else if (options && typeof options === "object") {
    preferredModel = options.model || null;
    serviceOverride = options.service || null;
  }

  const configuredService = db.getSetting("ai_service") || "openrouter";
  let service = serviceOverride || configuredService;
  const modelHint = preferredModel || DEFAULT_CHAT_MODEL;

  const { provider } = parseProviderModel(modelHint);
  if (provider === "openai") {
    service = "openai";
  } else if (provider === "openrouter") {
    service = "openrouter";
  }

  const openAiKey = process.env.OPENAI_API_KEY || "";
  const openRouterKey = process.env.OPENROUTER_API_KEY || "";

  console.debug(
    "[Server Debug] Creating OpenAI client with service =",
    service,
    "(model hint =",
    modelHint,
    ")"
  );

  if (service === "openrouter" || service === "deepseek") {
    if (!openRouterKey) {
      throw new Error(
        "Missing OPENROUTER_API_KEY environment variable, please set it before using OpenRouter."
      );
    }
    // Use openrouter.ai with app name and referer
    console.debug("[Server Debug] Using openrouter.ai with provided OPENROUTER_API_KEY.");
    return new OpenAI({
      apiKey: openRouterKey,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "X-Title": "MyAwesomeApp",
        "HTTP-Referer": "https://alfe.sh"
      }
    });
  }

  if (service === "openai" || !service) {
    if (!openAiKey) {
      throw new Error(
        "Missing OPENAI_API_KEY environment variable, please set it before using OpenAI."
      );
    }
    console.debug("[Server Debug] Using openai with provided OPENAI_API_KEY.");
    return new OpenAI({
      apiKey: openAiKey
    });
  }

  throw new Error(`Unsupported ai_service '${service}'.`);
}

function parseProviderModel(model) {
  if (!model) return { provider: "Unknown", shortModel: "Unknown" };
  if (model.startsWith("openai/")) {
    return { provider: "openai", shortModel: model.replace(/^openai\//, "") };
  } else if (model.startsWith("openrouter/")) {
    return { provider: "openrouter", shortModel: model.replace(/^openrouter\//, "") };
  } else if (model.startsWith("deepseek/")) {
    return { provider: "openrouter", shortModel: model.replace(/^deepseek\//, "") };
  } else if (model.startsWith("anthropic/")) {
    return { provider: "anthropic", shortModel: model.replace(/^anthropic\//, "") };
  }
  return { provider: "Unknown", shortModel: model };
}

function stripModelPrefix(model) {
  if (!model) {
    return DEFAULT_CHAT_MODEL.replace(/^openrouter\//, "");
  }
  if (model.startsWith("openai/")) return model.substring("openai/".length);
  if (model.startsWith("openrouter/")) return model.substring("openrouter/".length);
  if (model.startsWith("deepseek/")) return model.substring("deepseek/".length);
  if (model.startsWith("anthropic/")) return model.substring("anthropic/".length);
  return model;
}

function isDeprecatedSearchModel(model) {
  // defensively handle non-string model values (e.g., objects returned by DB)
  if (typeof model !== 'string') {
    try {
      model = String(model);
    } catch (e) {
      return true;
    }
  }
  const trimmed = (model || "").trim();
  if (!trimmed) {
    return true;
  }
  const parts = trimmed.split("/");
  const base = parts[parts.length - 1];
  return base.startsWith("sonar") || base === "r1-1776";
}

// Cache tokenizers to avoid repeated disk loads
const encoderCache = {};

function getEncoding(modelName) {
  console.debug(
    "[Server Debug] Attempting to load tokenizer for model =>",
    modelName
  );
  if (encoderCache[modelName]) return encoderCache[modelName];
  try {
    const enc = encoding_for_model(modelName);
    encoderCache[modelName] = enc;
    return enc;
  } catch (e) {
    console.debug(
      "[Server Debug] Tokenizer load failed, falling back to gpt-4.1-mini =>",
      e.message
    );
    if (!encoderCache["gpt-4.1-mini"]) {
      encoderCache["gpt-4.1-mini"] = encoding_for_model("gpt-4.1-mini");
    }
    return encoderCache["gpt-4.1-mini"];
  }
}

function countTokens(encoder, text) {
  return encoder.encode(text || "").length;
}

function stripUtmSource(text) {
  return (text || "").replace(/https?:\/\/[^\s)]+/g, raw => {
    try {
      const u = new URL(raw);
      if (u.searchParams.has('utm_source')) {
        u.searchParams.delete('utm_source');
        return u.toString();
      }
    } catch {
      // ignore malformed URLs
    }
    return raw;
  });
}

function normalizeReasoningDetails(details) {
  if (!details) return "";
  if (typeof details === "string") return details;
  if (!Array.isArray(details)) {
    if (typeof details === "object") {
      return (
        details.text ||
        details.summary ||
        details.reasoning ||
        details.content ||
        ""
      );
    }
    return "";
  }
  return details
    .map((item) => {
      if (!item) return "";
      if (typeof item === "string") return item;
      if (typeof item === "object") {
        return (
          item.text ||
          item.summary ||
          item.reasoning ||
          item.content ||
          ""
        );
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

async function callOpenAiModel(client, model, opts = {}) {
  const {
    messages = [],
    max_tokens,
    temperature,
    stream = false,
    ...extraOptions
  } = opts;

  // All chat-style models—including codex-mini-latest and openrouter/openai/codex-mini—use the chat endpoint
  return client.chat.completions.create({
    model,
    messages,
    max_tokens,
    temperature,
    stream,
    ...extraOptions
  });
}

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

function normalizeHostname(req) {
  const header = req.hostname || req.get("host") || "";
  return header.split(":")[0].toLowerCase();
}

function buildSessionCookie(sessionId, hostname) {
  const expires = new Date(Date.now() + ONE_YEAR_MS);
  const parts = [
    `sessionId=${encodeURIComponent(sessionId)}`,
    "Path=/",
    `Expires=${expires.toUTCString()}`,
    `Max-Age=${Math.floor(ONE_YEAR_MS / 1000)}`,
  ];

  if (hostname === "alfe.sh" || hostname.endsWith(".alfe.sh")) {
    parts.push("Domain=.alfe.sh");
  }

  return parts.join("; ");
}

function ensureSessionIdCookie(req, res) {
  let sessionId = getSessionIdFromRequest(req);
  let created = false;

  if (!sessionId) {
    sessionId = randomUUID();
    created = true;
    const hostname = normalizeHostname(req);
    const cookie = buildSessionCookie(sessionId, hostname);
    res.append("Set-Cookie", cookie);
    console.debug(
      `[Server Debug] ensureSessionIdCookie => Issued new session ${sessionId.slice(0, 8)}… for host ${hostname || "(unknown)"}`
    );
  }

  return { sessionId, created };
}

function getSessionIdFromRequest(req) {
  const header = req.headers.cookie || "";
  const cookies = {};
  header.split(";").forEach((c) => {
    const idx = c.indexOf("=");
    if (idx === -1) return;
    const name = c.slice(0, idx).trim();
    const val = decodeURIComponent(c.slice(idx + 1).trim());
    cookies[name] = val;
  });
  return cookies.sessionId || "";
}

function resolveTabPath(tab) {
  if (!tab) return null;
  if (tab.path_alias && tab.path_alias.trim()) {
    return tab.path_alias.trim();
  }
  if (tab.tab_uuid) {
    return `/chat/${tab.tab_uuid}`;
  }
  return null;
}

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = pbkdf2Sync(password, salt, 10000, 64, 'sha256').toString('hex');
  return `${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split('$');
  const h = pbkdf2Sync(password, salt, 10000, 64, 'sha256').toString('hex');
  return h === hash;
}

// Updated to include ".json" suffix
async function updatePrintifyProduct(productId, variants) {
  try {
    // Validate product existence first
    const validateRes = await axios.get(
      `https://api.printify.com/v1/shops/${shopId}/products/${productId}.json`,
      { headers: { Authorization: `Bearer ${printifyToken}` } }
    );

    if (!validateRes.data || validateRes.status !== 200) {
      throw new Error('Product not found or access denied');
    }

    // Verify variants structure
    if (
      !Array.isArray(variants) ||
      !variants.every(v => v.id && v.price !== undefined)
    ) {
      throw new Error('Invalid variants format');
    }

    const formattedVariants = variants.map(v => ({
      id: v.id,
      price: Math.round(Number(v.price)),
      inventory_quantity: v.inventory_quantity
    }));

    const response = await axios.put(
      `https://api.printify.com/v1/shops/${shopId}/products/${productId}/variants.json`,
      { variants: formattedVariants },
      {
        headers: {
          Authorization: `Bearer ${printifyToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    return response.data;
  } catch (error) {
    const errorDetails = {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
      config: {
        url: error.config?.url,
        method: error.config?.method
      }
    };
    console.error('Printify API Error:', JSON.stringify(errorDetails, null, 2));
    throw new Error(`Printify update failed: ${errorDetails.data?.error || error.message}`);
  }
}

function detectProminentColors(filePath) {
  try {
    const colorScript = path.join(__dirname, '../scripts/detectColors.js');
    const detected = child_process
      .execFileSync(colorScript, [filePath], { encoding: 'utf8' })
      .trim();
    console.debug('[Server Debug] Detected colors =>', detected);
    return detected
      .split(/\s*,\s*/)
      .map(c => c.trim())
      .filter(Boolean)
      .slice(0, 3);
  } catch (err) {
    console.error('[Server Debug] Color detection failed =>', err.message || err);
    return [];
  }
}

app.use('/api/printify/updateProduct', (req, res, next) => {
  if (!req.body.productId?.match(/^[0-9a-f]{24}$/i)) {
    return res.status(400).json({ error: 'Invalid product ID format' });
  }
  if (
    req.body.variants !== undefined &&
    !Array.isArray(req.body.variants)
  ) {
    return res.status(400).json({ error: 'Variants must be an array if provided' });
  }
  next();
});

// Updated to include ".json" suffix in the GET request
app.get('/api/printify/product/:id', async (req, res) => {
  const productId = req.params.id;
  try {
    const response = await axios.get(
      `https://api.printify.com/v1/shops/${shopId}/products/${productId}.json`,
      { headers: { Authorization: `Bearer ${printifyToken}` } }
    );
    res.json(response.data);
  } catch (err) {
    console.error('Error in /api/printify/product:', err);
    if (err.response?.status === 404) {
      return res.status(404).json({ error: "Printify product not found" });
    }
    res.status(500).json({ error: 'Failed to load product' });
  }
});

// List products for the configured shop
app.get('/api/printify/products', async (req, res) => {
  const page = parseInt(req.query.page || '1', 10);
  const limit = parseInt(req.query.limit || String(process.env.AURORA_DEFAULT_PAGE_LIMIT || process.env.DEFAULT_PAGE_LIMIT || '10'), 10);
  const fetchAll = req.query.all === 'true' || req.query.all === '1';

  try {
    if (fetchAll) {
      let currentPage = page;
      let results = [];
      while (true) {
        const url = `https://api.printify.com/v1/shops/${shopId}/products.json?page=${currentPage}&limit=${limit}`;
        const response = await axios.get(url, {
          headers: { Authorization: `Bearer ${printifyToken}` }
        });
        const products = Array.isArray(response.data?.data)
          ? response.data.data
          : Array.isArray(response.data?.products)
          ? response.data.products
          : Array.isArray(response.data)
          ? response.data
          : [];

        results = results.concat(products);

        if (!products.length || products.length < limit) break;
        currentPage += 1;
      }
      return res.json({ data: results });
    }

    const url = `https://api.printify.com/v1/shops/${shopId}/products.json?page=${page}&limit=${limit}`;
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${printifyToken}` }
    });
    res.json(response.data);
  } catch (err) {
    console.error('Error in /api/printify/products:', err);
    const status = err.response?.status || 500;
    const msg = err.response?.data?.error || 'Failed to load product list';
    res.status(status).json({ error: msg });
  }
});

async function deriveImageTitle(prompt, client = null) {
  if (!prompt) return '';

  const openAiClient = client || getOpenAiClient(DEFAULT_CHAT_MODEL);
  const storedModel = DEFAULT_CHAT_MODEL;
  const modelForOpenAI = stripModelPrefix(storedModel);

  if (openAiClient) {
    try {
      const completion = await callOpenAiModel(openAiClient, modelForOpenAI, {
        messages: [
          {
            role: 'system',
            content:
              'Given the following AI generated text description of an image, '
              + 'respond ONLY with a concise 3-6 word title for that image.'
          },
          { role: 'user', content: prompt }
        ],
        max_tokens: 16,
        temperature: 0.5
      });
      const title =
        completion.choices?.[0]?.message?.content?.trim() ||
        completion.choices?.[0]?.text?.trim();
      if (title) return title.replace(/^"|"$/g, '');
    } catch (e) {
      console.debug('[Server Debug] AI title generation failed, falling back =>', e.message);
    }
  }

  let str = prompt.trim().split('\n')[0];
  str = str.replace(/^\s*[-*]+\s*/, '');
  str = str.replace(/^(?:Thought\s+Process|Observation|Prompt|Image\s+Desc|Description|Title|Caption)\s*:\s*/i, '');
  str = str.replace(/^here['’]s another design[:\s-]*/i, '');
  const sentEnd = str.search(/[.!?]/);
  if (sentEnd !== -1) {
    str = str.slice(0, sentEnd);
  }
  const words = str.split(/\s+/).filter(Boolean);
  let titleWords = words.slice(0, 6);
  if (titleWords.length < 3) {
    titleWords = words.slice(0, 3);
  }
  let title = titleWords.join(' ');
  if (title) {
    title = title.charAt(0).toUpperCase() + title.slice(1);
  }
  return title;
}

async function deriveTabTitle(message, client = null) {
  if (!message) return '';

  const openAiClient = client || getOpenAiClient(DEFAULT_CHAT_MODEL);
  const storedModel = DEFAULT_CHAT_MODEL;
  const modelForOpenAI = stripModelPrefix(storedModel);

  if (openAiClient) {
    try {
      const completion = await callOpenAiModel(openAiClient, modelForOpenAI, {
        messages: [
          { role: 'system', content: 'Create a short 3-6 word title summarizing the user message.' },
          { role: 'user', content: message }
        ],
        max_tokens: 16,
        temperature: 0.5
      });
      const title =
        completion.choices?.[0]?.message?.content?.trim() ||
        completion.choices?.[0]?.text?.trim();
      if (title) return title.replace(/^"|"$/g, '');
    } catch (e) {
      console.debug('[Server Debug] AI tab title generation failed, falling back =>', e.message);
    }
  }

  let str = message.trim();
  str = str.replace(/^here['’]s another design[:\s-]*/i, '');
  const sentEnd = str.search(/[.!?]/);
  if (sentEnd !== -1) {
    str = str.slice(0, sentEnd);
  }
  const words = str.split(/\s+/).slice(0, 6);
  let title = words.join(' ');
  if (title) {
    title = title.charAt(0).toUpperCase() + title.slice(1);
  }
  return title;
}

async function removeColorSwatches(filePath) {
  const enabled = db.getSetting("remove_color_swatches");
  if (!enabled) return;
  try {
    const img = await Jimp.read(filePath);
    const { width, height } = img.bitmap;
    const sliceHeight = Math.round(height * 0.15);
    const bottom = img.clone().crop(0, height - sliceHeight, width, sliceHeight);
    const small = bottom.clone().resize(10, 1);
    const diff = (c1, c2) => {
      const a = Jimp.intToRGBA(c1);
      const b = Jimp.intToRGBA(c2);
      return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
    };
    let changes = 0;
    for (let x = 1; x < 10; x++) {
      const c1 = small.getPixelColor(x - 1, 0);
      const c2 = small.getPixelColor(x, 0);
      if (diff(c1, c2) > 40) changes++;
    }
    if (changes >= 5) {
      img.crop(0, 0, width, height - sliceHeight);
      await img.writeAsync(filePath);
    }
  } catch (err) {
    console.error('[Server Debug] palette removal failed =>', err);
  }
}

// Explicit CORS configuration
app.use(cors({
  origin: "*",
  methods: ["GET","POST","PUT","DELETE","OPTIONS","HEAD"],
  allowedHeaders: ["Content-Type","Authorization","Accept","X-Requested-With","Origin"]
}));

// Handle preflight requests
app.options("*", cors({
  origin: "*",
  methods: ["GET","POST","PUT","DELETE","OPTIONS","HEAD"],
  allowedHeaders: ["Content-Type","Authorization","Accept","X-Requested-With","Origin"]
}), (req, res) => {
  res.sendStatus(200);
});

// Restrict access by IP when WHITELIST_IP is set. Localhost is always allowed
const whitelistEnv = process.env.whitelist_ip || process.env.WHITELIST_IP;
const whitelistIps = new Set();
if (whitelistEnv) {
  whitelistEnv
    .split(',')
    .map((ip) => ip.trim())
    .filter(Boolean)
    .forEach((ip) => {
      whitelistIps.add(ip);
      whitelistIps.add(`::ffff:${ip}`);
    });
}
if (whitelistIps.size > 0) {
  const localIps = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
  app.use((req, res, next) => {
    const requestIp =
      (req.headers["x-forwarded-for"] || "")
        .split(",")[0]
        .trim() || req.connection.remoteAddress;

    const isImage = /\.(png|jpe?g|gif|webp|svg|ico)$/i.test(req.path);
    const allowedPaths = ["/portfolio.html", "/api/upload/list"];
    if (isImage || req.path.startsWith("/uploads") || allowedPaths.includes(req.path)) {
      return next();
    }

    const allowed = localIps.has(requestIp) || whitelistIps.has(requestIp);
    if (allowed) {
      return next();
    }

    if (req.path === "/" || req.path === "/index.html") {
      return res.redirect("https://alfe.sh");
    }

    res.status(403).send("Forbidden");
  });
}

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

function getRequestIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  const forwardedIp = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const ip =
    (forwardedIp ? String(forwardedIp).split(",")[0].trim() : "") ||
    req.ip ||
    req.connection?.remoteAddress ||
    "";
  return ip.trim();
}

function isIpAllowed(ip, whitelist) {
  if (whitelist.size === 0) {
    return false;
  }
  if (!ip) {
    return false;
  }
  const normalized = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  return whitelist.has(ip) || whitelist.has(normalized);
}

// Determine uploads directory
const uploadsDir = path.join(__dirname, "../uploads");
try {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log("[Server Debug] Ensured uploads directory exists at", uploadsDir);
} catch (err) {
  console.error("[Server Debug] Error creating uploads folder:", err);
}

const mosaicDir = path.join(__dirname, "../mosaic/files");
try {
  fs.mkdirSync(mosaicDir, { recursive: true });
  console.log("[Server Debug] Ensured mosaic directory exists at", mosaicDir);
} catch (err) {
  console.error("[Server Debug] Error creating mosaic folder:", err);
}

const queueDataPath = path.join(__dirname, "../printifyQueue.json");

const printifyQueue = new PrintifyJobQueue(jobManager, {
  uploadsDir,
  persistencePath: queueDataPath,
  upscaleScript: path.join(__dirname, "../scripts/upscale.js"),
  printifyScript:
    process.env.PRINTIFY_SCRIPT_PATH ||
    "/home/admin/Puppets/PrintifyPuppet/run.sh",
  printifyPriceScript:
    process.env.PRINTIFY_PRICE_SCRIPT_PATH ||
    "/home/admin/Puppets/PrintifyPricePuppet/run.sh",
  printifyTitleFixScript:
    process.env.PRINTIFY_TITLE_FIX_SCRIPT_PATH ||
    path.join(__dirname, "../scripts/printifyTitleFix.js"),
  colorIdentifyScript: path.join(__dirname, "../scripts/detectColors.js"),
  removeBgScript: path.join(__dirname, "../scripts/remove_bg.sh"),
  runPuppetScript: path.join(__dirname, "../scripts/runPuppet.js"),
  db,
});

// Serve static files
app.use("/uploads", express.static(uploadsDir));
app.use("/mosaic/files", (req, res, next) => {
  if (req.path.includes('/.git')) {
    return res.status(404).end();
  }
  next();
});
app.use("/mosaic/files", express.static(mosaicDir));

// Allow loading images from absolute paths produced by the upscale script.
app.use((req, res, next) => {
  try {
    const decoded = decodeURIComponent(req.path);
    if (fs.existsSync(decoded) && fs.statSync(decoded).isFile()) {
      return res.sendFile(decoded);
    }
  } catch (err) {
    console.error("[Server Debug] Error serving absolute path:", err);
  }
  next();
});

// Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix + ext);
  }
});
const upload = multer({ storage });
// Block image upload endpoints when IMAGE_UPLOAD_ENABLED is false
app.use((req, res, next) => {
  try {
    if (!IMAGE_UPLOAD_ENABLED) {
      const isUploadApi = req.path.startsWith('/api/upload');
      const isReadOnlyUpload =
        req.method === 'GET' &&
        (req.path === '/api/upload/list' || req.path === '/api/upload/byId' || req.path === '/api/upload/title');

      if (isUploadApi && !isReadOnlyUpload) {
        return res.status(403).json({ error: 'Image upload disabled' });
      }

      if (req.path === '/api/chat/image') {
        return res.status(403).json({ error: 'Image upload disabled' });
      }
    }
  } catch (e) {
    // ignore
  }
  next();
});


// Database calls and API routes

app.get("/api/tasks", async (req, res) => {
  console.debug("[Server Debug] GET /api/tasks called.");
  try {
    const includeHidden =
      req.query.includeHidden === "1" ||
      req.query.includeHidden === "true";
    console.debug("[Server Debug] includeHidden =", includeHidden);
    const tasks = await db.listTasks(includeHidden);
    if (typeof db.getChatTabUuidByTaskId === "function") {
      for (const task of tasks) {
        const uuid = await db.getChatTabUuidByTaskId(task.id);
        if (uuid) task.chat_sha = uuid;
      }
    }
    console.debug("[Server Debug] Found tasks =>", tasks.length);
    res.json(tasks);
  } catch (err) {
    console.error("[AlfeChat] /api/tasks failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/db/tables", (req, res) => {
  if (!isIpAllowed(getRequestIp(req), configIpWhitelist)) {
    console.warn("[Server Debug] GET /api/db/tables blocked by CONFIG_IP_WHITELIST");
    return res.status(403).json({ error: "Forbidden" });
  }
  console.debug("[Server Debug] GET /api/db/tables called.");
  (async () => {
    try {
      if (typeof db.listTables !== "function") {
        return res.status(501).json({ error: "Database table listing not supported." });
      }
      const tables = await Promise.resolve(db.listTables());
      res.json({ tables });
    } catch (err) {
      console.error("[Server Debug] GET /api/db/tables error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  })();
});

app.get("/api/db/table/:name", (req, res) => {
  const tableName = req.params.name;
  if (!isIpAllowed(getRequestIp(req), configIpWhitelist)) {
    console.warn("[Server Debug] GET /api/db/table blocked by CONFIG_IP_WHITELIST");
    return res.status(403).json({ error: "Forbidden" });
  }
  console.debug("[Server Debug] GET /api/db/table =>", tableName);
  (async () => {
    try {
      if (typeof db.getTableData !== "function") {
        return res.status(501).json({ error: "Database table read not supported." });
      }
      const limit = Math.max(1, Math.min(parseInt(req.query.limit, 10) || 200, 1000));
      const data = await Promise.resolve(db.getTableData(tableName, limit));
      res.json(data);
    } catch (err) {
      console.error("[Server Debug] GET /api/db/table error:", err);
      const message = err?.message?.startsWith("Unknown table")
        ? err.message
        : "Internal server error";
      res.status(message === err?.message ? 404 : 500).json({ error: message });
    }
  })();
});

app.get("/api/db/info", (req, res) => {
  if (!isIpAllowed(getRequestIp(req), configIpWhitelist)) {
    console.warn("[Server Debug] GET /api/db/info blocked by CONFIG_IP_WHITELIST");
    return res.status(403).json({ error: "Forbidden" });
  }
  console.debug("[Server Debug] GET /api/db/info called.");
  try {
    const info = getDbConnectionInfo();
    res.json(info);
  } catch (err) {
    console.error("[Server Debug] GET /api/db/info error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/projects", (req, res) => {
  console.debug("[Server Debug] GET /api/projects called.");
  try {
    const showArchived = req.query.showArchived === '1';
    const projects = db.listProjects(showArchived);
    console.debug("[Server Debug] Found projects =>", projects.length);
    res.json(projects);
  } catch (err) {
    console.error("[AlfeChat] /api/projects failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/sprints", (req, res) => {
  console.debug("[Server Debug] GET /api/sprints called.");
  try {
    const sprints = db.listSprints();
    console.debug("[Server Debug] Found sprints =>", sprints.length);
    res.json(sprints);
  } catch (err) {
    console.error("[AlfeChat] /api/sprints failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/projectBranches", (req, res) => {
  console.debug("[Server Debug] GET /api/projectBranches called.");
  try {
    const result = db.listProjectBranches();
    console.debug("[Server Debug] Found projectBranches =>", result.length);
    res.json(result);
  } catch (err) {
    console.error("[AlfeChat] GET /api/projectBranches error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/projectBranches", (req, res) => {
  console.debug("[Server Debug] POST /api/projectBranches called.");
  try {
    const { data } = req.body; // expects { project, base_branch }
    if (!Array.isArray(data)) {
      console.debug("[Server Debug] Provided data is not an array =>", data);
      return res.status(400).json({ error: "Must provide an array of branch data." });
    }
    data.forEach((entry) => {
      db.upsertProjectBranch(entry.project, entry.base_branch || "");
    });
    db.logActivity("Update project branches", JSON.stringify(data));
    res.json({ success: true });
  } catch (err) {
    console.error("[AlfeChat] POST /api/projectBranches error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.delete("/api/projectBranches/:project", (req, res) => {
  console.debug("[Server Debug] DELETE /api/projectBranches called =>", req.params.project);
  try {
    const project = req.params.project;
    db.deleteProjectBranch(project);
    db.logActivity("Delete project branch", project);
    res.json({ success: true });
  } catch (err) {
    console.error("[AlfeChat] DELETE /api/projectBranches/:project error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/upworkJobs", (req, res) => {
  try {
    const jobs = db.listUpworkJobs();
    res.json(jobs);
  } catch (err) {
    console.error("[AlfeChat] /api/upworkJobs failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/upworkJobs", (req, res) => {
  try {
    const { title, link, bid, status, notes } = req.body || {};
    if (!title) {
      return res.status(400).json({ error: "Title required" });
    }
    const id = db.addUpworkJob({ title, link, bid, status, notes });
    res.json({ success: true, id });
  } catch (err) {
    console.error("[AlfeChat] POST /api/upworkJobs failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.delete("/api/upworkJobs/:id", (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: "Invalid id" });
    }
    db.deleteUpworkJob(id);
    res.json({ success: true });
  } catch (err) {
    console.error("[AlfeChat] DELETE /api/upworkJobs/:id failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/tasks/hidden", (req, res) => {
  console.debug("[Server Debug] POST /api/tasks/hidden called => body:", req.body);
  try {
    const { id, hidden } = req.body;
    db.setHidden(id, hidden);
    db.logActivity("Set hidden", JSON.stringify({ id, hidden }));
    res.json({ success: true });
  } catch (err) {
    console.error("[AlfeChat] /api/tasks/hidden failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/tasks/reorder", (req, res) => {
  console.debug("[Server Debug] POST /api/tasks/reorder => body:", req.body);
  try {
    const { id, direction } = req.body;
    const ok = db.reorderTask(id, direction);
    if (ok) {
      db.logActivity("Reorder task", JSON.stringify({ id, direction }));
      res.json({ success: true });
    } else {
      res.status(400).json({ error: "Unable to reorder" });
    }
  } catch (err) {
    console.error("[AlfeChat] /api/tasks/reorder failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/tasks/reorderAll", (req, res) => {
  console.debug("[Server Debug] POST /api/tasks/reorderAll => body:", req.body);
  try {
    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds)) {
      return res.status(400).json({ error: "orderedIds must be an array" });
    }
    db.reorderAll(orderedIds);
    db.logActivity("Reorder all tasks", JSON.stringify({ orderedIds }));
    res.json({ success: true });
  } catch (err) {
    console.error("[AlfeChat] /api/tasks/reorderAll failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/tasks/points", (req, res) => {
  console.debug("[Server Debug] POST /api/tasks/points => body:", req.body);
  try {
    const { id, points } = req.body;
    db.setPoints(id, points);
    db.logActivity("Set fib_points", JSON.stringify({ id, points }));
    res.json({ success: true });
  } catch (err) {
    console.error("[AlfeChat] /api/tasks/points failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/tasks/project", (req, res) => {
  console.debug("[Server Debug] POST /api/tasks/project => body:", req.body);
  try {
    const { id, project } = req.body;
    db.setProject(id, project);
    db.logActivity("Set project", JSON.stringify({ id, project }));
    res.json({ success: true });
  } catch (err) {
    console.error("[AlfeChat] /api/tasks/project failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/tasks/sprint", (req, res) => {
  console.debug("[Server Debug] POST /api/tasks/sprint => body:", req.body);
  try {
    const { id, sprint } = req.body;
    db.setSprint(id, sprint);
    db.logActivity("Set sprint", JSON.stringify({ id, sprint }));
    res.json({ success: true });
  } catch (err) {
    console.error("[AlfeChat] /api/tasks/sprint failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/tasks/priority", async (req, res) => {
  console.debug("[Server Debug] POST /api/tasks/priority => body:", req.body);
  try {
    const { id, priority } = req.body;
    const oldTask = await db.getTaskById(id);
    const oldPriority = oldTask?.priority || null;

    db.setPriority(id, priority);

    db.logActivity(
      "Set priority",
      JSON.stringify({ id, from: oldPriority, to: priority })
    );

    res.json({ success: true });
  } catch (err) {
    console.error("[AlfeChat] /api/tasks/priority failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/tasks/status", (req, res) => {
  console.debug("[Server Debug] POST /api/tasks/status => body:", req.body);
  try {
    const { id, status } = req.body;
    db.setStatus(id, status);
    db.logActivity("Set status", JSON.stringify({ id, status }));
    res.json({ success: true });
  } catch (err) {
    console.error("[AlfeChat] /api/tasks/status failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/tasks/dependencies", (req, res) => {
  console.debug("[Server Debug] POST /api/tasks/dependencies => body:", req.body);
  try {
    const { id, dependencies } = req.body;
    db.setDependencies(id, dependencies);
    db.logActivity("Set dependencies", JSON.stringify({ id, dependencies }));
    res.json({ success: true });
  } catch (err) {
    console.error("[AlfeChat] /api/tasks/dependencies failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/tasks/blocking", (req, res) => {
  console.debug("[Server Debug] POST /api/tasks/blocking => body:", req.body);
  try {
    const { id, blocking } = req.body;
    db.setBlocking(id, blocking);
    db.logActivity("Set blocking", JSON.stringify({ id, blocking }));
    res.json({ success: true });
  } catch (err) {
    console.error("[AlfeChat] /api/tasks/blocking failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/tasks/codex-url", (req, res) => {
  console.debug("[Server Debug] POST /api/tasks/codex-url => body:", req.body);
  try {
    const { id, url } = req.body;
    db.setCodexUrl(id, url);
    db.logActivity("Set codex_url", JSON.stringify({ id, url }));
    res.json({ success: true });
  } catch (err) {
    console.error("[AlfeChat] /api/tasks/codex-url failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/tasks/new", async (req, res) => {
  console.debug("[Server Debug] POST /api/tasks/new => body:", req.body);
  try {
    const { title, body, project } = req.body;
    if (!title) {
      return res.status(400).json({ error: "Title required" });
    }

    const defaultProject = db.getSetting('default_project');
    const defaultSprint = db.getSetting('default_sprint');
    const taskId = db.createTask(title, project || defaultProject || '', defaultSprint || '');
    db.logActivity('New task', JSON.stringify({ title, project: project || null }));
    res.json({ success: true, id: taskId });
  } catch (err) {
    console.error("POST /api/tasks/new error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/settings", (req, res) => {
  console.debug("[Server Debug] GET /api/settings =>", req.query.keys);
  try {
    const sessionId = getSessionIdFromRequest(req);
    const keysParam = req.query.keys;
    let settings;
    if (keysParam) {
      const keys = Array.isArray(keysParam)
        ? keysParam
        : String(keysParam)
            .split(",")
            .map((k) => k.trim())
            .filter((k) => k);
      settings = keys.map((k) => ({ key: k, value: readSessionAwareSetting(sessionId, k) }));
    } else {
      settings = db.allSettings();
    }
    res.json({ settings });
  } catch (err) {
    console.error("[AlfeChat] GET /api/settings failed", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/settings/:key", (req, res) => {
  console.debug("[Server Debug] GET /api/settings/:key =>", req.params.key);
  try {
    const sessionId = getSessionIdFromRequest(req);
    const val = readSessionAwareSetting(sessionId, req.params.key);
    res.json({ key: req.params.key, value: val });
  } catch (err) {
    console.error("[AlfeChat] GET /api/settings/:key failed", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/settings", (req, res) => {
  console.debug("[Server Debug] POST /api/settings => body:", req.body);
  try {
    const sessionId = getSessionIdFromRequest(req);
    const { key, value } = req.body;
    writeSessionAwareSetting(sessionId, key, value);
    res.json({ success: true });
  } catch (err) {
    console.error("[AlfeChat] POST /api/settings failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/settings/batch", (req, res) => {
  console.debug("[Server Debug] POST /api/settings/batch => body:", req.body);
  try {
    const sessionId = getSessionIdFromRequest(req);
    const { settings } = req.body;
    if (!Array.isArray(settings)) {
      return res.status(400).json({ error: "settings array required" });
    }
    settings.forEach(({ key, value }) => {
      if (typeof key !== "undefined") {
        writeSessionAwareSetting(sessionId, key, value);
      }
    });
    res.json({ success: true });
  } catch (err) {
    console.error("[AlfeChat] POST /api/settings/batch failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/nodes", (req, res) => {
  console.debug("[Server Debug] GET /api/nodes called.");
  try {
    const nodes = db.getSetting("nodes") || [];
    const host = os.hostname();
    const ifaces = os.networkInterfaces();
    const addresses = [];
    Object.values(ifaces).forEach((arr) => {
      arr.forEach((i) => {
        if (i.family === "IPv4" && !i.internal) addresses.push(i.address);
      });
    });
    res.json({ nodes, host, addresses });
  } catch (err) {
    console.error("[AlfeChat] GET /api/nodes failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/nodes", (req, res) => {
  console.debug("[Server Debug] POST /api/nodes =>", req.body);
  try {
    const { hostname, ip } = req.body;
    if (!hostname && !ip) {
      return res.status(400).json({ error: "hostname or ip required" });
    }
    const nodes = db.getSetting("nodes") || [];
    nodes.push({ hostname: hostname || "", ip: ip || "" });
    db.setSetting("nodes", nodes);
    res.json({ success: true });
  } catch (err) {
    console.error("[AlfeChat] POST /api/nodes failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/feedback", (req, res) => {
  console.debug("[Server Debug] POST /api/feedback =>", req.body);
  try {
    const { message, type } = req.body;
    if (!message) {
      return res.status(400).json({ error: "Message required" });
    }
    const fbType = typeof type === 'string' && type ? type : 'misc';
    db.addFeedback(message, fbType);
    res.json({ success: true });
  } catch (err) {
    console.error("[AlfeChat] POST /api/feedback failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/register", async (req, res) => {
  console.debug("[Server Debug] POST /api/register =>", req.body);
  try {
    if (!accountsEnabled) {
      return res.status(404).json({ error: "not found" });
    }
    const { email, password } = req.body;
    const sessionId = req.body.sessionId || getSessionIdFromRequest(req);
    if (!email || !password) {
      return res.status(400).json({ error: "email and password required" });
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }
    if (await db.getAccountByEmail(email)) {
      return res.status(400).json({ error: "account exists" });
    }
    const hash = hashPassword(password);
    const id = await db.createAccount(email, hash, sessionId);
    res.json({ success: true, id, accountsEnabled });
  } catch (err) {
    console.error("[AlfeChat] POST /api/register failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/account/exists", async (req, res) => {
  console.debug("[Server Debug] POST /api/account/exists =>", req.body);
  try {
    if (!accountsEnabled) {
      return res.status(404).json({ error: "not found" });
    }
    const { email } = req.body || {};
    if (!email) {
      return res.status(400).json({ error: "email required" });
    }
    const exists = !!(await db.getAccountByEmail(email));
    res.json({ success: true, accountsEnabled, exists });
  } catch (err) {
    console.error("[AlfeChat] POST /api/account/exists failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/login", async (req, res) => {
  console.debug("[Server Debug] POST /api/login =>", req.body);
  try {
    if (!accountsEnabled) {
      return res.status(404).json({ error: "not found" });
    }
    const { email, password, token } = req.body;
    let sessionId = req.body.sessionId || getSessionIdFromRequest(req);
    if (!email || !password) {
      return res.status(400).json({ error: "email and password required" });
    }
    const account = await db.getAccountByEmail(email);
    if (!account || !verifyPassword(password, account.password_hash)) {
      return res.status(400).json({ error: "invalid credentials" });
    }
    if (account.disabled) {
      return res.status(403).json({ error: "account disabled" });
    }

    const disable2fa = process.env.DISABLE_2FA === 'true' || process.env.DISABLE_2FA === '1';
    if (account.totp_secret && !disable2fa) {
      if (!token) {
        return res.status(400).json({ error: "totp required" });
      }
      const ok = speakeasy.totp.verify({ secret: account.totp_secret, encoding: 'base32', token, window: 1 });
      if (!ok) {
        return res.status(400).json({ error: "invalid totp" });
      }
    }

    if (account.session_id && account.session_id !== sessionId) {
      await db.mergeSessions(account.session_id, sessionId); // Fixed to use separate queries in rds_store.js
      sessionId = account.session_id;
    }

    await db.setAccountSession(account.id, sessionId);
    res.json({ success: true, id: account.id, email: account.email, sessionId, accountsEnabled });
  } catch (err) {
    console.error("[AlfeChat] POST /api/login failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/totp/generate", async (req, res) => {
  if (!accountsEnabled) {
    return res.status(404).json({ error: "not found" });
  }
  const sessionId = getSessionIdFromRequest(req);
  const account = sessionId ? await db.getAccountBySession(sessionId) : null;
  if (!account) return res.status(401).json({ error: "not logged in" });
  const secret = speakeasy.generateSecret({ name: "Aurora" });
  res.json({ secret: secret.base32, otpauth_url: secret.otpauth_url });
});

app.post("/api/totp/enable", async (req, res) => {
  if (!accountsEnabled) {
    return res.status(404).json({ error: "not found" });
  }
  const sessionId = getSessionIdFromRequest(req);
  const account = sessionId ? await db.getAccountBySession(sessionId) : null;
  if (!account) return res.status(401).json({ error: "not logged in" });
  const { secret, token } = req.body || {};
  if (!secret || !token) {
    return res.status(400).json({ error: "missing secret or token" });
  }
  const ok = speakeasy.totp.verify({ secret, encoding: 'base32', token, window: 1 });
  if (!ok) {
    return res.status(400).json({ error: "invalid token" });
  }
  await db.setAccountTotpSecret(account.id, secret);
  res.json({ success: true });
});

app.get("/api/account", async (req, res) => {
  console.debug("[Server Debug] GET /api/account");
  try {
    if (!accountsEnabled) {
      return res.json({ accountsEnabled: false, exists: false });
    }
    const sessionId = getSessionIdFromRequest(req);
    const account = sessionId ? await db.getAccountBySession(sessionId) : null;
    if (!account) {
      return res.json({ accountsEnabled: true, exists: false });
    }
    res.json({
      accountsEnabled: true,
      exists: true,
      id: account.id,
      email: account.email,
      totpEnabled: !!account.totp_secret,
      timezone: account.timezone || '',
      plan: account.plan || 'Free'
    });
  } catch(err) {
    console.error("[AlfeChat] GET /api/account failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/account/timezone", async (req, res) => {
  if (!accountsEnabled) {
    return res.status(404).json({ error: "not found" });
  }
  const sessionId = getSessionIdFromRequest(req);
  const account = sessionId ? await db.getAccountBySession(sessionId) : null;
  if (!account) return res.status(401).json({ error: "not logged in" });
  const { timezone } = req.body || {};
  if (typeof timezone !== 'string') {
    return res.status(400).json({ error: "timezone required" });
  }
  await db.setAccountTimezone(account.id, timezone);
  res.json({ success: true });
});

app.post("/api/account/plan", async (req, res) => {
  if (!accountsEnabled) {
    return res.status(404).json({ error: "not found" });
  }
  const sessionId = getSessionIdFromRequest(req);
  const account = sessionId ? await db.getAccountBySession(sessionId) : null;
  if (!account) return res.status(401).json({ error: "not logged in" });
  const { plan } = req.body || {};
  if (typeof plan !== 'string') {
    return res.status(400).json({ error: "plan required" });
  }
  await db.setAccountPlan(account.id, plan);
  res.json({ success: true, plan });
});

app.post("/api/account/password", async (req, res) => {
  if (!accountsEnabled) {
    return res.status(404).json({ error: "not found" });
  }
  const sessionId = getSessionIdFromRequest(req);
  const account = sessionId ? await db.getAccountBySession(sessionId) : null;
  if (!account) return res.status(401).json({ error: "not logged in" });
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "current and new password required" });
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }
  if (!verifyPassword(currentPassword, account.password_hash)) {
    return res.status(400).json({ error: "incorrect password" });
  }
  const hash = hashPassword(newPassword);
  await db.setAccountPassword(account.id, hash);
  res.json({ success: true });
});

app.post("/api/logout", async (req, res) => {
  console.debug("[Server Debug] POST /api/logout");
  try {
    const sessionId = getSessionIdFromRequest(req);
    if (sessionId) {
      const account = await db.getAccountBySession(sessionId);
      if (account) console.debug("[Server Debug] Keeping session", sessionId, "for account", account.id);
    }
    res.json({ success: true });
  } catch(err) {
    console.error("[AlfeChat] POST /api/logout failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/tasks/:id", async (req, res) => {
  console.debug("[Server Debug] GET /api/tasks/:id =>", req.params.id);
  try {
    const taskId = parseInt(req.params.id, 10);
    if (Number.isNaN(taskId)) {
      return res.status(400).json({ error: "Invalid task ID" });
    }
    const t = await db.getTaskById(taskId);
    if (!t) {
      return res.status(404).json({ error: "Task not found" });
    }
    res.json(t);
  } catch (err) {
    console.error("[AlfeChat] /api/tasks/:id failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/projects/:project", async (req, res) => {
  console.debug("[Server Debug] GET /api/projects/:project =>", req.params.project);
  try {
    const tasks = await db.listTasksByProject(req.params.project);
    res.json(tasks);
  } catch (err) {
    console.error("[AlfeChat] /api/projects/:project failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/sprints/:sprint", async (req, res) => {
  console.debug("[Server Debug] GET /api/sprints/:sprint =>", req.params.sprint);
  try {
    const tasks = await db.listTasksBySprint(req.params.sprint);
    res.json(tasks);
  } catch (err) {
    console.error("[AlfeChat] /api/sprints/:sprint failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/tasks/rename", async (req, res) => {
  console.debug("[Server Debug] POST /api/tasks/rename => body:", req.body);
  try {
    const { id, newTitle } = req.body;
    if (!id || !newTitle) {
      return res.status(400).json({ error: "Missing id or newTitle" });
    }
    const task = await db.getTaskById(id);
    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    
    db.setTitle(id, newTitle);
    db.logActivity("Rename task", JSON.stringify({ id, newTitle }));

    res.json({ success: true });
  } catch (err) {
    console.error("[AlfeChat] /api/tasks/rename error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/activity", (req, res) => {
  console.debug("[Server Debug] GET /api/activity called.");
  try {
    const activity = db.getActivity();
    res.json(activity);
  } catch (err) {
    console.error("[AlfeChat] /api/activity failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/ai/models", async (req, res) => {
  console.debug("[Server Debug] GET /api/ai/models called.");

  if (aiModelsCache && Date.now() - aiModelsCacheTs < AI_MODELS_CACHE_TTL_MS) {
    return res.json(aiModelsCache);
  }

  const knownTokenLimits = {
    "openai/gpt-4o-mini": 128000,
    "openai/gpt-4.1": 1047576,
    "openai/gpt-4.1-mini": 1047576,
    "openai/gpt-4.1-nano": 1047576,
    "openai/gpt-5-chat": 400000,
    "openai/gpt-5": 400000,
    "openai/gpt-5-mini": 400000,
    "openai/gpt-5-nano": 400000,
    "openai/o4-mini": 200000,
    "openai/gpt-4o": 128000,
    "openai/gpt-4o-2024-11-20": 128000,
    "openai/o4-mini-high": 200000,
    "openai/gpt-4o-mini-2024-07-18": 128000,
    "openai/o3-mini": 200000,
    "openai/chatgpt-4o-latest": 128000,
    "openai/gpt-4o-2024-08-06": 128000,
    "openai/o3": 200000,
    "anthropic/claude-3.7-sonnet": 200000,
    "anthropic/claude-sonnet-4": 200000,
    "anthropic/claude-opus-4": 200000,
    "anthropic/claude-3.5-haiku": 200000,
    "openrouter/anthropic/claude-3.5-haiku": 200000,
    "anthropic/claude-3.7-sonnet:thinking": 200000,
    "openai/gpt-3.5-turbo": 16385,
    "openai/o3-mini-high": 200000,
    "openai/o1": 200000,
    "openai/gpt-4o-search-preview": 128000,
    "openai/gpt-4-turbo": 128000,
    "openai/gpt-4.5-preview": 128000,
    "openai/o1-mini": 128000,
    "openai/gpt-4o-2024-05-13": 128000,
    "openai/gpt-3.5-turbo-0125": 16385,
    "openai/gpt-4-1106-preview": 128000,
    "openai/gpt-4": 8191,
    "openai/gpt-4o-mini-search-preview": 128000,
    "openai/gpt-3.5-turbo-1106": 16385,
    "openai/codex-mini-latest": 200000,
    "openai/codex-mini": 200000,
    "openrouter/openai/codex-mini": 200000,
    "openrouter/openai/gpt-4.1-mini": 1047576,
    "openrouter/openai/gpt-4o-mini": 128000,
    "openai/o1-preview-2024-09-12": 128000,
    "openai/gpt-3.5-turbo-0613": 4095,
    "openai/gpt-4-turbo-preview": 128000,
    "openai/o1-preview": 128000,
    "openai/gpt-3.5-turbo-instruct": 4095,
    "openai/o1-mini-2024-09-12": 128000,
    "openai/gpt-4o:extended": 128000,
    "openai/gpt-3.5-turbo-16k": 16385,
    "openai/gpt-4-32k": 32767,
    "openai/o1-pro": 200000,
    "openai/gpt-4-0314": 8191,
    "openai/gpt-4-32k-0314": 32767,
    "openai/gpt-4-vision-preview": 128000,
    "openai/gpt-3.5-turbo-0301": "--"
  };

  // Known model costs are stored per one million tokens so that the
  // frontend can easily convert to user-facing pricing.
  const knownCosts = {
    "openai/gpt-4o-mini": { input: "$0.15", output: "$0.60" },
    "openai/gpt-4.1": { input: "$2", output: "$8" },
    "openai/gpt-4.1-mini": { input: "$0.40", output: "$1.60" },
    "openai/gpt-4.1-nano": { input: "$0.10", output: "$0.40" },
    "openai/gpt-5-chat": { input: "$1.25", output: "$10" },
    "openai/gpt-5": { input: "$1.25", output: "$10" },
    "openai/gpt-5-mini": { input: "$0.25", output: "$2" },
    "openai/gpt-5-nano": { input: "$0.05", output: "$0.40" },
    "openai/o4-mini": { input: "$1.10", output: "$4.40" },
    "openai/gpt-4o": { input: "$2.50", output: "$10" },
    "openai/gpt-4o-2024-11-20": { input: "$2.50", output: "$10" },
    "openai/o4-mini-high": { input: "$1.10", output: "$4.40" },
    "openai/gpt-4o-mini-2024-07-18": { input: "$0.15", output: "$0.60" },
    "openai/o3-mini": { input: "$1.10", output: "$4.40" },
    "openai/chatgpt-4o-latest": { input: "$5", output: "$15" },
    "openai/gpt-4o-2024-08-06": { input: "$2.50", output: "$10" },
    "openai/o3": { input: "$10", output: "$40" },
    "anthropic/claude-3.7-sonnet": { input: "$3", output: "$15" },
    "anthropic/claude-sonnet-4": { input: "$3", output: "$15" },
    "anthropic/claude-opus-4": { input: "$15", output: "$75" },
    "anthropic/claude-3.5-haiku": { input: "$0.80", output: "$4" },
    "openrouter/anthropic/claude-3.5-haiku": { input: "$0.80", output: "$4" },
    "anthropic/claude-3.7-sonnet:thinking": { input: "$3", output: "$15" },
    "openai/gpt-3.5-turbo": { input: "$0.50", output: "$1.50" },
    "openai/o3-mini-high": { input: "$1.10", output: "$4.40" },
    "openai/o1": { input: "$15", output: "$60" },
    "openai/gpt-4o-search-preview": { input: "$2.50", output: "$10" },
    "openai/gpt-4-turbo": { input: "$10", output: "$30" },
    "openai/gpt-4.5-preview": { input: "$75", output: "$150" },
    "openai/o1-mini": { input: "$1.10", output: "$4.40" },
    "openai/gpt-4o-2024-05-13": { input: "$5", output: "$15" },
    "openai/gpt-3.5-turbo-0125": { input: "$0.50", output: "$1.50" },
    "openai/gpt-4-1106-preview": { input: "$10", output: "$30" },
    "openai/gpt-4": { input: "$30", output: "$60" },
    "openai/gpt-4o-mini-search-preview": { input: "$0.15", output: "$0.60" },
    "openai/gpt-3.5-turbo-1106": { input: "$1", output: "$2" },
    "openai/codex-mini-latest": { input: "$1.50", output: "$6" },
    "openai/codex-mini": { input: "$1.50", output: "$6" },
    "openrouter/openai/codex-mini": { input: "$1.50", output: "$6" },
    "openrouter/openai/gpt-4.1-mini": { input: "$0.40", output: "$1.60" },
    "openrouter/openai/gpt-4o-mini": { input: "$0.15", output: "$0.60" },
    "openai/o1-preview-2024-09-12": { input: "$15", output: "$60" },
    "openai/gpt-3.5-turbo-0613": { input: "$1", output: "$2" },
    "openai/gpt-4-turbo-preview": { input: "$10", output: "$30" },
    "openai/o1-preview": { input: "$15", output: "$60" },
    "openai/gpt-3.5-turbo-instruct": { input: "$1.50", output: "$2" },
    "openai/o1-mini-2024-09-12": { input: "$1.10", output: "$4.40" },
    "openai/gpt-4o:extended": { input: "$6", output: "$18" },
    "openai/gpt-3.5-turbo-16k": { input: "$3", output: "$4" },
    "openai/gpt-4-32k": { input: "$60", output: "$120" },
    "openai/o1-pro": { input: "$150", output: "$600" },
    "openai/gpt-4-0314": { input: "$30", output: "$60" },
    "openai/gpt-4-32k-0314": { input: "$60", output: "$120" },
    "openai/gpt-4-vision-preview": { input: "--", output: "--" },
    "openai/gpt-3.5-turbo-0301": { input: "--", output: "--" }
  };

  let openAIModelData = [];
  let openRouterModelData = [];

  try {
    const openAiKey = process.env.OPENAI_API_KEY || "";
    const openRouterKey = process.env.OPENROUTER_API_KEY || "";

    // If we have OpenAI key, fetch from OpenAI
    if (openAiKey) {
      try {
        console.debug("[Server Debug] Fetching OpenAI model list...");
        const openaiClient = new OpenAI({ apiKey: openAiKey });
        const modelList = await openaiClient.models.list();
        const modelIds = modelList.data.map(m => m.id).sort();
        openAIModelData = modelIds.map(id => {
          const combinedId = "openai/" + id;
          const limit = knownTokenLimits[combinedId] || "N/A";
          const cInfo = knownCosts[combinedId]
            ? knownCosts[combinedId]
            : { input: "N/A", output: "N/A" };
          return {
            id: combinedId,
            provider: "openai",
            tokenLimit: limit,
            inputCost: cInfo.input,
            outputCost: cInfo.output
          };
        });
      } catch (err) {
        console.error("[AlfeChat] Error listing OpenAI models:", err);
      }
    }

    // If we have OpenRouter key, fetch from OpenRouter
    if (openRouterKey) {
      try {
        console.debug("[Server Debug] Fetching OpenRouter model list...");
        const orResp = await axios.get("https://openrouter.ai/api/v1/models", {
          headers: {
            Authorization: `Bearer ${openRouterKey}`,
            "HTTP-Referer": "Alfe-DevAgent",
            "X-Title": "Alfe AI",
            "User-Agent": "Alfe AI"
          }
        });
        const rawModels = orResp.data?.data?.map((m) => m.id).sort() || [];
        openRouterModelData = rawModels.map((id) => {
          const combinedId = "openrouter/" + id;
          const limit = knownTokenLimits[combinedId] || "N/A";
          const cInfo = knownCosts[combinedId]
            ? knownCosts[combinedId]
            : { input: "N/A", output: "N/A" };
          return {
            id: combinedId,
            provider: "openrouter",
            tokenLimit: limit,
            inputCost: cInfo.input,
            outputCost: cInfo.output
          };
        });
      } catch (err) {
        console.error("[AlfeChat] Error fetching OpenRouter models:", err);
      }
    }

    // Ensure certain known models are always included even if not returned
    // by the provider APIs so that users can favorite them.
    const forcedModels = [
      "openai/o4-mini-high",
      "openai/codex-mini",
      "openrouter/anthropic/claude-3.5-haiku",
      "anthropic/claude-3.5-haiku",
      "anthropic/claude-3.7-sonnet",
      "anthropic/claude-sonnet-4",
      "anthropic/claude-opus-4",
      "anthropic/claude-3.7-sonnet:thinking"
    ];
    for (const id of forcedModels) {
      let entry = openAIModelData.find((m) => m.id === id) ||
                  openRouterModelData.find((m) => m.id === id);
      const limit = knownTokenLimits[id] || "N/A";
      const cInfo = knownCosts[id] ? knownCosts[id] : { input: "N/A", output: "N/A" };
      if (entry) {
        if (entry.tokenLimit === "N/A") entry.tokenLimit = limit;
        if (entry.inputCost === "N/A") entry.inputCost = cInfo.input;
        if (entry.outputCost === "N/A") entry.outputCost = cInfo.output;
        continue;
      }
      entry = {
        id,
        provider:
          id.startsWith("openrouter/") ? "openrouter" :
          id.includes("anthropic/") ? "anthropic" :
          "openai",
        tokenLimit: limit,
        inputCost: cInfo.input,
        outputCost: cInfo.output,
      };
      if (entry.provider === "openai") {
        openAIModelData.push(entry);
      } else {
        openRouterModelData.push(entry);
      }
    }
  } catch (err) {
    console.error("[AlfeChat] /api/ai/models error:", err);
  }

  const deepseekModelData = [
    {
      id: "openrouter/deepseek/deepseek-chat-v3-0324:free",
      provider: "deepseek",
      tokenLimit: 163840,
      inputCost: "$0",
      outputCost: "$0"
    },
    {
      id: "openrouter/deepseek/deepseek-chat-v3-0324",
      provider: "deepseek",
      tokenLimit: 163840,
      inputCost: "$0.30",
      outputCost: "$0.88"
    },
    {
      id: "deepseek/deepseek-r1:free",
      provider: "deepseek",
      tokenLimit: 163840,
      inputCost: "$0",
      outputCost: "$0"
    },
    {
      id: "deepseek/deepseek-chat",
      provider: "deepseek",
      tokenLimit: 163840,
      inputCost: "$0.38",
      outputCost: "$0.89"
    },
    {
      id: "deepseek/deepseek-r1",
      provider: "deepseek",
      tokenLimit: 163840,
      inputCost: "$0.50",
      outputCost: "$2.18"
    },
    {
      id: "deepseek/deepseek-r1-0528",
      provider: "deepseek",
      tokenLimit: 163840,
      inputCost: "$0.272",
      outputCost: "$0.272"
    },
    {
      id: "deepseek/deepseek-r1-distill-llama-70b",
      provider: "deepseek",
      tokenLimit: 131072,
      inputCost: "$0.10",
      outputCost: "$0.40"
    },
    {
      id: "deepseek/deepseek-chat:free",
      provider: "deepseek",
      tokenLimit: 163840,
      inputCost: "$0",
      outputCost: "$0"
    },
    {
      id: "tngtech/deepseek-r1t-chimera:free",
      provider: "deepseek",
      tokenLimit: 163840,
      inputCost: "$0",
      outputCost: "$0"
    },
    {
      id: "deepseek/deepseek-prover-v2:free",
      provider: "deepseek",
      tokenLimit: 163840,
      inputCost: "$0",
      outputCost: "$0"
    },
    {
      id: "deepseek/deepseek-r1-distill-llama-70b:free",
      provider: "deepseek",
      tokenLimit: 8192,
      inputCost: "$0",
      outputCost: "$0"
    },
    {
      id: "deepseek/deepseek-prover-v2",
      provider: "deepseek",
      tokenLimit: 131072,
      inputCost: "$0.50",
      outputCost: "$2.18"
    },
    {
      id: "deepseek/deepseek-r1-distill-qwen-32b",
      provider: "deepseek",
      tokenLimit: 131072,
      inputCost: "$0.12",
      outputCost: "$0.18"
    },
    {
      id: "deepseek/deepseek-r1-distill-llama-8b",
      provider: "deepseek",
      tokenLimit: 32000,
      inputCost: "$0.04",
      outputCost: "$0.04"
    },
    {
      id: "deepseek/deepseek-r1-distill-qwen-32b:free",
      provider: "deepseek",
      tokenLimit: 16000,
      inputCost: "$0",
      outputCost: "$0"
    },
    {
      id: "deepseek/deepseek-r1-distill-qwen-1.5b",
      provider: "deepseek",
      tokenLimit: 131072,
      inputCost: "$0.18",
      outputCost: "$0.18"
    },
    {
      id: "deepseek/deepseek-r1-distill-qwen-14b",
      provider: "deepseek",
      tokenLimit: 64000,
      inputCost: "$0.15",
      outputCost: "$0.15"
    },
    {
      id: "deepseek/deepseek-r1-distill-qwen-14b:free",
      provider: "deepseek",
      tokenLimit: 64000,
      inputCost: "$0",
      outputCost: "$0"
    },
    {
      id: "deepseek/deepseek-coder",
      provider: "deepseek",
      tokenLimit: 128000,
      inputCost: "$0.04",
      outputCost: "$0.12"
    },
    {
      id: "deepseek/deepseek-chat-v2.5",
      provider: "deepseek",
      tokenLimit: 128000,
      inputCost: "--",
      outputCost: "--"
    }
  ];

  const combinedModels = [
    ...openAIModelData,
    ...openRouterModelData,
    ...deepseekModelData
  ].sort((a, b) => a.id.localeCompare(b.id));

  const favoritesSetting = db.getSetting("favorite_ai_models");
  const favorites = Array.isArray(favoritesSetting)
    ? favoritesSetting
    : favoritesSetting
        ? [favoritesSetting]
        : [];
  for (const m of combinedModels) {
    m.favorite = favorites.includes(m.id);
  }

  const responseData = { models: combinedModels };
  aiModelsCache = responseData;
  aiModelsCacheTs = Date.now();
  res.json(responseData);
});

app.post("/api/chat", async (req, res) => {
  console.debug("[Server Debug] POST /api/chat => body:", req.body);
  try {
    const userMessage = req.body.message || "";
    const chatTabId = req.body.tabId || 1;
    const sessionId = req.body.sessionId || "";
    const ipAddress = (req.headers["x-forwarded-for"] || req.ip || "")
        .split(",")[0]
        .trim();
    const tabInfo = await db.getChatTab(chatTabId, sessionId || null);
    if (!tabInfo) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const userTime = req.body.userTime || new Date().toISOString();

    if (tabInfo && tabInfo.tab_type === 'search') {
      if (sessionId) {
        const sessionSearchCount = db.countSearchesForSession(sessionId);
        if (sessionSearchCount >= FREE_SEARCH_LIMIT) {
          return res.status(429).json({
            error: "Search limit reached for this session",
            type: "search_session_limit",
            counts: { sessionCount: sessionSearchCount, sessionLimit: FREE_SEARCH_LIMIT }
          });
        }
      }
      if (ipAddress) {
        const ipSearchCount = db.countSearchesForIp(ipAddress);
        if (ipSearchCount >= FREE_SEARCH_LIMIT) {
          return res.status(429).json({
            error: "Search limit reached for this IP",
            type: "search_ip_limit",
            counts: { ipCount: ipSearchCount, ipLimit: FREE_SEARCH_LIMIT }
          });
        }
      }
    }

    if (!userMessage) {
      return res.status(400).send("Missing message");
    }

    const priorPairsAll = await db.getAllChatPairs(chatTabId);
    const isFirstMessage = !(await db.hasUserMessages(chatTabId));
    let model = tabInfo && tabInfo.model_override
      ? tabInfo.model_override
      : DEFAULT_CHAT_MODEL;
    model = (model || "").trim() || DEFAULT_CHAT_MODEL;

    if (tabInfo && tabInfo.tab_type === 'search') {
      const configuredSearchModel = (db.getSetting("ai_search_model") || DEFAULT_SEARCH_MODEL).trim();
      if (isDeprecatedSearchModel(model)) {
        if (model !== configuredSearchModel) {
          console.debug(
            `[Server Debug] Updating legacy search model '${model}' to '${configuredSearchModel}' for tab ${chatTabId}.`
          );
          db.setChatTabModel(chatTabId, configuredSearchModel);
          tabInfo.model_override = configuredSearchModel;
        }
        model = configuredSearchModel;
      }
    }

    const isDesignTab = tabInfo && tabInfo.tab_type === 'design';
    let finalUserMessage = userMessage;
    if (isDesignTab) {
      const prependInstr =
        `Agent Instructions (Alfe.TaskAgent.Thinking beta-0.70):\n\n` +
        `1. You are a programming assistant AI based off of "Thinking" LLM Models (OpenAI o1 & OpenAI o3 & DeepSeek R1 & Perplexity Sonar Reasoning) named "Alfe", "Alfe.TaskAgent.Thinking".\n` +
        `2. The user prefers minimal detail.\n` +
        `2.a. You are an AI assistant designed to provide clear, concise, and friendly responses.\n\n` +
        `   - Describe your internal thought process in a conversational manner\n` +
        `   - Provide the final answer, maintaining a helpful and approachable tone\n\n` +
        `3. If the user asks for the time, if you need the time for something, use the userTime value provided by the user.\n` +
        `4. Don't say anything like "Since I can’t create images directly here..." . You can. You have a built in hook to generate images automatically, you don't need to worry about that.\n` +
        `5. Don't Hallucinate anything like this, "Got it! I’m creating a simple, cute image of a penguin for you right now. Here it comes: ![Penguin](https://cdn.openai.com/penguin.png)" You have a built in hook to generate AND DISPLAY images automatically, you don't need to worry about that.\n` +
        `6. If including an example URL to an image, please use https://alfe.sh, e.g. ![Abstract Calming Blue-Green](https://alfe.sh/abstract-blue-green.png)`;
      finalUserMessage = `${prependInstr}\n\n${userMessage}`;
    }

    const { systemContext, projectContext } = await buildContextsForTab(tabInfo);
    const fullContext = projectContext ?
      `${systemContext}\n${projectContext}` : systemContext;
    const { provider } = parseProviderModel(model);
    const sysContent = `${fullContext}\n\nModel: ${model} (provider: ${provider})\nUserTime: ${userTime}\nTimeZone: Central`;

    const conversation = [{ role: "system", content: sysContent }];

    for (const p of priorPairsAll) {
      conversation.push({ role: "user", content: p.user_text });
      if (p.ai_text) {
        conversation.push({ role: "assistant", content: p.ai_text });
      }
    }

    const chatPairId = await db.createChatPair(
        userMessage,
        chatTabId,
        systemContext,
        projectContext,
        sessionId,
        ipAddress
    );
    conversation.push({ role: "user", content: finalUserMessage });
    db.logActivity("User chat", JSON.stringify({ tabId: chatTabId, message: userMessage, userTime }));

    if (isFirstMessage) {
      try {
        const newTitle = await deriveTabTitle(userMessage);
        if (newTitle) {
          db.renameChatTab(chatTabId, newTitle);
        }
      } catch (e) {
        console.debug('[Server Debug] deriveTabTitle failed =>', e.message);
      }
    }

    const includeReasoning = provider === "openrouter";
    if (includeReasoning) {
      res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    } else {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
    }
    res.setHeader("Transfer-Encoding", "chunked");
    res.setHeader("Cache-Control", "no-cache");

    console.debug("[Server Debug] Chat conversation assembled with length =>", conversation.length);

    const openaiClient = getOpenAiClient({ model });
    if (!model) {
      model = "unknown";
    }

    const modelForOpenAI = stripModelPrefix(model);

    console.debug("[Server Debug] Using model =>", model, " (stripped =>", modelForOpenAI, ")");
    const encoder = getEncoding(modelForOpenAI);

    let convTokens = 0;
    let truncatedConversation = [];
    truncatedConversation.push(conversation[0]);
    const remainder = conversation.slice(1).reverse();

    for (const msg of remainder) {
      const chunkTokens = countTokens(encoder, msg.content) + 4;
      if ((convTokens + chunkTokens) > 7000) {
        break;
      }
      truncatedConversation.unshift(msg);
      convTokens += chunkTokens;
    }

    console.debug("[Server Debug] Truncated conversation length =>", truncatedConversation.length);

    let assistantMessage = "";
    let requestStartTime = Date.now();

    const streamingSetting = db.getSetting("chat_streaming");
    const useStreaming = (streamingSetting === false) ? false : true;

    const citations = [];
    const REASONING_SEPARATOR = "\n\n[[AURORA_REASONING]]\n\n";
    const writeReasoningChunk = (type, text) => {
      if (!includeReasoning) {
        res.write(text);
        return;
      }
      res.write(`${JSON.stringify({ type, text })}\n`);
    };
    if (useStreaming) {
      const stream = await callOpenAiModel(openaiClient, modelForOpenAI, {
        messages: truncatedConversation,
        stream: true,
        ...(includeReasoning ? { reasoning: {} } : {})
      });

      console.debug("[Server Debug] AI streaming started...");
      res.flushHeaders();

      let reasoningSeen = false;
      let contentSeen = false;
      let insertedSeparator = false;
      for await (const part of stream) {
        const delta = part.choices?.[0]?.delta || {};
        const reasoningChunk =
          delta.reasoning ||
          normalizeReasoningDetails(delta.reasoning_details) ||
          delta.reasoning_content ||
          delta.thoughts ||
          "";
        const contentChunk =
          delta.content ||
          delta.text ||
          part.choices?.[0]?.text ||
          "";
        if ((reasoningChunk || contentChunk).includes("[DONE]")) {
          break;
        }
        if (reasoningChunk) {
          const cleanChunk = stripUtmSource(reasoningChunk);
          reasoningSeen = true;
          assistantMessage += cleanChunk;
          writeReasoningChunk("reasoning", cleanChunk);
        }
        if (contentChunk) {
          const cleanChunk = stripUtmSource(contentChunk);
          if (reasoningSeen && !contentSeen && !insertedSeparator) {
            assistantMessage += REASONING_SEPARATOR;
            insertedSeparator = true;
          }
          assistantMessage += cleanChunk;
          writeReasoningChunk("content", cleanChunk);
          contentSeen = true;
        }
        if (res.flush) res.flush();
      }
      res.end();
      console.debug("[Server Debug] AI streaming finished, total length =>", assistantMessage.length);

    } else {
      const completion = await callOpenAiModel(openaiClient, modelForOpenAI, {
        messages: truncatedConversation,
        ...(includeReasoning ? { reasoning: {} } : {})
      });
      const reasoningText =
        completion.choices?.[0]?.message?.reasoning ||
        normalizeReasoningDetails(completion.choices?.[0]?.message?.reasoning_details) ||
        completion.choices?.[0]?.message?.reasoning_content ||
        completion.choices?.[0]?.message?.thoughts ||
        "";
      const contentText =
        completion.choices?.[0]?.message?.content ||
        completion.choices?.[0]?.text ||
        "";
      assistantMessage = reasoningText
        ? `${reasoningText}${REASONING_SEPARATOR}${contentText}`.trim()
        : contentText;
      assistantMessage = stripUtmSource(assistantMessage);
      if (reasoningText) {
        writeReasoningChunk("reasoning", stripUtmSource(reasoningText));
      }
      if (contentText) {
        writeReasoningChunk("content", stripUtmSource(contentText));
      }
      res.end();
      console.debug("[Server Debug] AI non-streaming completed, length =>", assistantMessage.length);
    }

    let requestEndTime = Date.now();
    let diffMs = requestEndTime - requestStartTime;
    let responseTime = Math.ceil(diffMs * 0.01) / 100;

    const systemTokens = countTokens(encoder, sysContent);
    const projectTokens = projectContext ? countTokens(encoder, projectContext) : 0;
    let prevAssistantTokens = 0;
    let historyTokens = 0;
    for (const p of priorPairsAll) {
      historyTokens += countTokens(encoder, p.user_text);
      prevAssistantTokens += countTokens(encoder, p.ai_text || "");
    }

    const inputTokens = countTokens(encoder, userMessage);
    const finalAssistantTokens = countTokens(encoder, assistantMessage);

    const total =
      systemTokens + historyTokens + inputTokens + prevAssistantTokens + finalAssistantTokens;

    const tokenInfo = {
      systemTokens,
      projectTokens,
      historyTokens,
      inputTokens,
      assistantTokens: prevAssistantTokens,
      finalAssistantTokens,
      total,
      responseTime
    };

    await db.finalizeChatPair(chatPairId, assistantMessage, model, new Date().toISOString(), JSON.stringify(tokenInfo), JSON.stringify(citations));
    db.logActivity("AI chat", JSON.stringify({ tabId: chatTabId, response: assistantMessage, tokenInfo }));
  } catch (err) {
    console.error("[Server Debug] /api/chat error:", err);
    if (!res.headersSent) {
      res.status(500).send("Internal server error");
    }
  }
});

app.post("/api/chat/pairs/prefab", async (req, res) => {
  console.debug("[Server Debug] POST /api/chat/pairs/prefab =>", req.body);
  try {
    const chatTabId = parseInt(req.body.tabId || "1", 10);
    const sessionId = req.body.sessionId || "";
    const text = (req.body.text || "").trim();
    const kind = (req.body.kind || "prefab").toLowerCase();
    const ipAddress = (req.headers["x-forwarded-for"] || req.ip || "")
        .split(",")[0]
        .trim();

    if (!text) {
      return res.status(400).json({ error: "Missing text" });
    }
    if (Number.isNaN(chatTabId)) {
      return res.status(400).json({ error: "Invalid tab" });
    }

    const tabInfo = await db.getChatTab(chatTabId, sessionId || null);
    if (!tabInfo) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { systemContext, projectContext } = await buildContextsForTab(tabInfo);
    const pairId = await db.createChatPair('', chatTabId, systemContext, projectContext, sessionId, ipAddress);
    const modelLabel = kind === 'greeting' ? 'prefab/greeting' : 'prefab/manual';
    await db.finalizeChatPair(pairId, text, modelLabel, new Date().toISOString());
    db.logActivity("AI chat (prefab)", JSON.stringify({ tabId: chatTabId, response: text, kind }));

    const pair = await db.getPairById(pairId);
    res.json({ pair });
  } catch (err) {
    console.error("[Server Debug] POST /api/chat/pairs/prefab error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/chat/history", async (req, res) => {
  console.debug("[Server Debug] GET /api/chat/history =>", req.query);
  try {
    const tabId = parseInt(req.query.tabId || "1", 10);
    const sessionId = req.query.sessionId || "";
    const limit = parseInt(req.query.limit || "10", 10);
    const offset = parseInt(req.query.offset || "0", 10);

    const tabInfo = await db.getChatTab(tabId, sessionId || null);
    if (!tabInfo) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const pairsDesc = await db.getChatPairsPage(tabId, limit, offset);
    const pairsAsc = pairsDesc.slice().reverse();

    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for (const pair of pairsAsc) {
      if (!pair.token_info) continue;
      try {
        const tInfo = JSON.parse(pair.token_info);
        const inputT = (tInfo.systemTokens || 0) + (tInfo.historyTokens || 0) + (tInfo.inputTokens || 0);
        const outputT = (tInfo.assistantTokens || 0) + (tInfo.finalAssistantTokens || 0);

        totalInputTokens += inputT;
        totalOutputTokens += outputT;

        pair._tokenSections = {
          input: inputT,
          output: outputT
        };
      } catch (e) {
        console.debug("[Server Debug] Could not parse token_info for pair =>", pair.id, e.message);
      }
    }

    res.json({
      pairs: pairsAsc,
      totalInputTokens,
      totalOutputTokens
    });
  } catch (err) {
    console.error("[AlfeChat] /api/chat/history error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/model", (req, res) => {
  console.debug("[Server Debug] GET /api/model called.");
  const model = DEFAULT_CHAT_MODEL;
  console.debug(`[Server Debug] Effective ai_model => ${model}`);
  res.json({ model });
});

app.get("/api/chat/tabs", async (req, res) => {
  const nexumParam = req.query.nexum;
  const showArchivedParam = req.query.showArchived;
  const sessionId = req.query.sessionId || "";
  console.debug(
    `[Server Debug] GET /api/chat/tabs => listing tabs (nexum=${nexumParam}, showArchived=${showArchivedParam}, sessionId=${sessionId})`
  );
  try {
    let tabs;
    const includeArchived =
      showArchivedParam === "1" || showArchivedParam === "true";
    if (nexumParam === undefined) {
      tabs = await db.listChatTabs(null, includeArchived, sessionId);
    } else {
      const flag = parseInt(nexumParam, 10);
      tabs = await db.listChatTabs(flag ? 1 : 0, includeArchived, sessionId);
    }
    for (const tab of tabs) {
      if (tab.task_id) {
        const task = await db.getTaskById(tab.task_id);
        if (task) tab.priority = task.priority;
      }
    }
    res.json(tabs);
  } catch (err) {
    console.error("[AlfeChat] GET /api/chat/tabs error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/chat/design_tab", (req, res) => {
  const sessionId = req.query.sessionId || "";
  if (!sessionId) {
    return res.status(400).json({ error: "Missing sessionId" });
  }
  try {
    const tab = db.ensureDesignChatTab(sessionId);
    if (!tab) {
      return res.status(500).json({ error: "Failed to create design chat" });
    }
    res.json({
      id: tab.id,
      uuid: tab.tab_uuid,
      pathAlias: tab.path_alias || '/chat/design',
      showInSidebar: tab.show_in_sidebar !== 0,
      tabType: tab.tab_type
    });
  } catch (err) {
    console.error("[Server Debug] GET /api/chat/design_tab error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/chat/tabs/new", async (req, res) => {
  console.debug("[Server Debug] POST /api/chat/tabs/new =>", req.body);
  try {
    let name = req.body.name || (req.body.type === 'search' ? 'Search' : 'Untitled');
    const nexum = req.body.nexum ? 1 : 0;
    const project = req.body.project || '';
    const repo = req.body.repo || '';
    const extraProjects = req.body.extraProjects || '';
    const taskId = req.body.taskId || 0;
    const type = req.body.type || 'chat';
    const sessionId = req.body.sessionId || '';
    const chatgptUrl = req.body.chatgptUrl || '';
    const showInSidebarRaw = Object.prototype.hasOwnProperty.call(req.body, 'showInSidebar')
      ? req.body.showInSidebar
      : undefined;
    let showInSidebar = showInSidebarRaw === undefined
      ? 1
      : (showInSidebarRaw === true || showInSidebarRaw === 1 || showInSidebarRaw === '1' ? 1 : 0);
    let pathAlias = typeof req.body.pathAlias === 'string' ? req.body.pathAlias.trim() : '';
    const sendProjectContextRaw = Object.prototype.hasOwnProperty.call(req.body, 'sendProjectContext')
      ? req.body.sendProjectContext
      : undefined;
    const sendProjectContext = sendProjectContextRaw === undefined
      ? 0
      : (sendProjectContextRaw === true || sendProjectContextRaw === 1 || sendProjectContextRaw === '1' ? 1 : 0);

    if (type === 'code') {
      showInSidebar = 0;
    }

    const autoNaming = db.getSetting("chat_tab_auto_naming");
    const projectName = db.getSetting("sterling_project") || "";
    if (autoNaming && projectName) {
      name = `${projectName}: ${name}`;
    }

    const { id: tabId, uuid } = await db.createChatTab(
      name,
      nexum,
      project,
      repo,
      extraProjects,
      taskId,
      type,
      sessionId,
      sendProjectContext,
      chatgptUrl,
      showInSidebar,
      pathAlias
    );

    if (type === 'code') {
      pathAlias = '/code';
      db.setChatTabPathAlias(tabId, pathAlias);
    } else if (pathAlias) {
      db.setChatTabPathAlias(tabId, pathAlias);
    }

    res.json({ success: true, id: tabId, uuid, pathAlias });
    if (type === 'search') {
      const searchModel = db.getSetting('ai_search_model') || DEFAULT_SEARCH_MODEL;
      db.setChatTabModel(tabId, searchModel);
    }
  } catch (err) {
    console.error("[AlfeChat] POST /api/chat/tabs/new error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/chat/tabs/rename", async (req, res) => {
  console.debug("[Server Debug] POST /api/chat/tabs/rename =>", req.body);
  try {
    const { tabId, newName, sessionId = '' } = req.body;
    if (!tabId || !newName) {
      return res.status(400).json({ error: "Missing tabId or newName" });
    }
    const tab = await db.getChatTab(tabId, sessionId || null);
    if (!tab) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    db.renameChatTab(tabId, newName);
    res.json({ success: true });
  } catch (err) {
    console.error("[AlfeChat] POST /api/chat/tabs/rename error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/chat/tabs/duplicate", async (req, res) => {
  console.debug("[Server Debug] POST /api/chat/tabs/duplicate =>", req.body);
  try {
    const { tabId, name = null, sessionId = '' } = req.body;
    if (!tabId) {
      return res.status(400).json({ error: "Missing tabId" });
    }
    const tab = await db.getChatTab(tabId, sessionId || null);
    if (!tab) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const { id: newId, uuid } = db.duplicateChatTab(tabId, name);
    res.json({ success: true, id: newId, uuid });
  } catch (err) {
    console.error("[AlfeChat] POST /api/chat/tabs/duplicate error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/chat/tabs/archive", async (req, res) => {
  console.debug("[Server Debug] POST /api/chat/tabs/archive =>", req.body);
  try {
    const { tabId, archived = true, sessionId = '' } = req.body;
    if (!tabId) {
      return res.status(400).json({ error: "Missing tabId" });
    }
    const tab = await db.getChatTab(tabId, sessionId || null);
    if (!tab) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    db.setChatTabArchived(tabId, archived ? 1 : 0);
    res.json({ success: true });
  } catch (err) {
    console.error("[AlfeChat] POST /api/chat/tabs/archive error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/chat/tabs/favorite", async (req, res) => {
  console.debug("[Server Debug] POST /api/chat/tabs/favorite =>", req.body);
  try {
    const { tabId, favorite = false, sessionId = '' } = req.body;
    if (!tabId) {
      return res.status(400).json({ error: "Missing tabId" });
    }
    const tab = sessionId ? await db.getChatTab(tabId, sessionId) : await db.getChatTab(tabId);
    if (!tab) {
      return res.status(404).json({ error: "Chat tab not found" });
    }
    db.setChatTabFavorite(tabId, favorite ? 1 : 0);
    res.json({ success: true, favorite: !!favorite });
  } catch (err) {
    console.error("[AlfeChat] POST /api/chat/tabs/favorite error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/chat/tabs/generate_images", async (req, res) => {
  console.debug("[Server Debug] POST /api/chat/tabs/generate_images =>", req.body);
  try {
    const { tabId, enabled = true, sessionId = '' } = req.body;
    if (!tabId) {
      return res.status(400).json({ error: "Missing tabId" });
    }
    const tab = await db.getChatTab(tabId, sessionId || null);
    if (!tab) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    db.setChatTabGenerateImages(tabId, enabled ? 1 : 0);
    res.json({ success: true });
  } catch (err) {
    console.error("[AlfeChat] POST /api/chat/tabs/generate_images error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/chat/tabs/config", async (req, res) => {
  console.debug("[Server Debug] POST /api/chat/tabs/config =>", req.body);
  try {
    const {
      tabId,
      project = '',
      repo = '',
      extraProjects = '',
      taskId = 0,
      type = 'chat',
      chatgptUrl = '',
      sessionId = ''
    } = req.body;
    const sendProjectContextRaw = Object.prototype.hasOwnProperty.call(req.body, 'sendProjectContext')
      ? req.body.sendProjectContext
      : undefined;
    const sendProjectContext = sendProjectContextRaw === undefined
      ? 0
      : (sendProjectContextRaw === true || sendProjectContextRaw === 1 || sendProjectContextRaw === '1' ? 1 : 0);
    if (!tabId) {
      return res.status(400).json({ error: "Missing tabId" });
    }
    const tab = await db.getChatTab(tabId, sessionId || null);
    if (!tab) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    db.setChatTabConfig(tabId, project, repo, extraProjects, taskId, type, sendProjectContext, chatgptUrl);
    res.json({ success: true });
  } catch (err) {
    console.error("[AlfeChat] POST /api/chat/tabs/config error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/chat/tabs/model", async (req, res) => {
  console.debug("[Server Debug] POST /api/chat/tabs/model =>", req.body);
  try {
    const { tabId, model = '', sessionId = '' } = req.body;
    if (!tabId) {
      return res.status(400).json({ error: "Missing tabId" });
    }
    const tab = await db.getChatTab(tabId, sessionId || null);
    if (!tab) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    db.setChatTabModel(tabId, model.trim());
    res.json({ success: true });
  } catch (err) {
    console.error("[AlfeChat] POST /api/chat/tabs/model error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/chat/tabs/parent", async (req, res) => {
  console.debug("[Server Debug] POST /api/chat/tabs/parent =>", req.body);
  try {
    const { tabId, parentId = 0, sessionId = '' } = req.body;
    if (!tabId) {
      return res.status(400).json({ error: "Missing tabId" });
    }
    const tab = await db.getChatTab(tabId, sessionId || null);
    if (!tab) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    db.setChatTabParent(tabId, parentId);
    res.json({ success: true });
  } catch (err) {
    console.error("[AlfeChat] POST /api/chat/tabs/parent error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/chat/subroutines", async (req, res) => {
  console.debug("[Server Debug] GET /api/chat/subroutines");
  try {
    const subs = await db.listChatSubroutines();
    res.json(subs);
  } catch (err) {
    console.error("[AlfeChat] GET /api/chat/subroutines error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/chat/subroutines/new", (req, res) => {
  console.debug("[Server Debug] POST /api/chat/subroutines/new =>", req.body);
  try {
    const { name, trigger = "", action = "", hook = "" } = req.body;
    if (!name) {
      return res.status(400).json({ error: "Name required" });
    }
    const id = db.createChatSubroutine(name, trigger, action, hook);
    res.json({ success: true, id });
  } catch (err) {
    console.error("[AlfeChat] POST /api/chat/subroutines/new error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/chat/subroutines/rename", (req, res) => {
  console.debug("[Server Debug] POST /api/chat/subroutines/rename =>", req.body);
  try {
    const { id, newName } = req.body;
    if (!id || !newName) {
      return res.status(400).json({ error: "Missing id or newName" });
    }
    db.renameChatSubroutine(id, newName);
    res.json({ success: true });
  } catch (err) {
    console.error("[AlfeChat] POST /api/chat/subroutines/rename error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/chat/subroutines/update", (req, res) => {
  console.debug("[Server Debug] POST /api/chat/subroutines/update =>", req.body);
  try {
    const { id, name, trigger = "", action = "", hook = "" } = req.body;
    if (!id || !name) {
      return res.status(400).json({ error: "Missing id or name" });
    }
    db.updateChatSubroutine(id, name, trigger, action, hook);
    res.json({ success: true });
  } catch (err) {
    console.error("[AlfeChat] POST /api/chat/subroutines/update error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.delete("/api/chat/tabs/:id", async (req, res) => {
  console.debug("[Server Debug] DELETE /api/chat/tabs =>", req.params.id);
  try {
    const tabId = parseInt(req.params.id, 10);
    const sessionId = req.query.sessionId || '';
    if (!tabId) {
      return res.status(400).json({ error: "Invalid tabId" });
    }
    const tab = await db.getChatTab(tabId, sessionId || null);
    if (!tab) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    db.deleteChatTab(tabId);
    res.json({ success: true });
  } catch (err) {
    console.error("[AlfeChat] DELETE /api/chat/tabs/:id error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/pair/:id", async (req, res) => {
  console.debug("[Server Debug] GET /pair/:id =>", req.params.id);
  const pairId = parseInt(req.params.id, 10);
  if (Number.isNaN(pairId)) return res.status(400).send("Invalid pair ID");
  const pair = await db.getPairById(pairId);
  if (!pair) return res.status(404).send("Pair not found");
  const allPairs = await db.getAllChatPairs(pair.chat_tab_id);
  const tabInfo = await db.getChatTab(pair.chat_tab_id);
  const project = tabInfo ? tabInfo.project_name || "" : "";
  const extras = tabInfo && tabInfo.extra_projects ? tabInfo.extra_projects.split(',').map(p=>p.trim()).filter(Boolean) : [];
  if ((project || extras.length) && (!('project_context' in pair) || !pair.project_context)) {
    if (pair.system_context && pair.system_context.includes("Project:")) {
      const lines = pair.system_context.split("\n");
      const idx = lines.findIndex(l => l.startsWith("Project:"));
      if (idx !== -1) {
        pair.project_context = lines.splice(idx, 1)[0];
        pair.system_context = lines.join("\n");
      }
    }
    if (!pair.project_context) {
      const entries = [];
      if(project) entries.push(`Project: ${project}`);
      extras.forEach(p=>entries.push(`Project: ${p}`));
      pair.project_context = entries.join('\n');
    }
  }
  res.json({
    pair,
    conversation: allPairs,
    project
  });
});

app.get("/api/time", (req, res) => {
  console.debug("[Server Debug] GET /api/time => returning server time.");
  const now = new Date();
  res.json({
    time: now.toLocaleString("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true
    }),
    iso: now.toISOString()
  });
});

app.post("/api/upload", upload.single("myfile"), (req, res) => {
  console.debug("[Server Debug] POST /api/upload => File info:", req.file);
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const sessionId = getSessionIdFromRequest(req);
  const ipAddress = (req.headers["x-forwarded-for"] || req.ip || "")
    .split(",")[0]
    .trim();

  if (sessionId) {
    db.ensureImageSession(sessionId);
  }

  const url = `/uploads/${req.file.filename}`;
  db.createImagePair(url, "", 1, "", "Uploaded", sessionId, ipAddress, "", 0, "", "");

  db.logActivity("File upload", JSON.stringify({ filename: req.file.originalname }));
  res.json({ success: true, file: req.file });
});

app.get("/api/upload/list", async (req, res) => {
  console.debug("[Server Debug] GET /api/upload/list => listing files.", req.query);
  try {
    const sessionId = req.query.sessionId || "";
    const showHidden = req.query.showHidden === '1';
    const limit = parseInt(req.query.limit) || 0;
    const offset = parseInt(req.query.offset) || 0;
    const fileNames = fs.readdirSync(uploadsDir);
    const files = [];
    for (const name of fileNames) {
      const imgSession = await db.getImageSessionForUrl(`/uploads/${name}`);
      // Some legacy images were created without a recorded session. When the
      // user filters by session, keep showing those session-less entries so the
      // table isn’t empty even though images exist for the current visit.
      if (sessionId && imgSession && imgSession !== sessionId) continue;
      const hidden = (await db.getImageHiddenForUrl(`/uploads/${name}`)) ? 1 : 0;
      if(!showHidden && hidden) continue;
      const { size, mtime } = fs.statSync(path.join(uploadsDir, name));
      const title = db.getImageTitleForUrl(`/uploads/${name}`);
      const id = db.getImageIdForUrl(`/uploads/${name}`);
      const uuid = db.getImageUuidForUrl(`/uploads/${name}`);
      const model = db.getImageModelForUrl(`/uploads/${name}`);
      const source = db.isGeneratedImage(`/uploads/${name}`) ? 'Generated' : 'Uploaded';
      const status = db.getImageStatusForUrl(`/uploads/${name}`) || (source === 'Generated' ? 'Generated' : 'Uploaded');
      const portfolio = db.getImagePortfolioForUrl(`/uploads/${name}`) ? 1 : 0;
      const productUrl = db.getProductUrlForImage(`/uploads/${name}`);
      const ebayUrl = db.getEbayUrlForImage(`/uploads/${name}`);
      files.push({ id, uuid, name, size, mtime, title, source, status, portfolio, hidden, productUrl, ebayUrl, model });
    }

    // Sort by database id (highest first)
    files.sort((a, b) => (b.id || 0) - (a.id || 0));

    // Apply pagination if requested
    const start = offset > 0 ? offset : 0;
    const end = limit > 0 ? start + limit : undefined;
    const slice = files.slice(start, end);

    res.json(slice);
  } catch (err) {
    console.error("[Server Debug] /api/upload/list error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/image/counts", (req, res) => {
  try {
    const sessionId = req.query.sessionId || "";
    const ipAddress = (req.headers["x-forwarded-for"] || req.ip || "").split(",")[0].trim();
    const sessionCount = sessionId ? db.countImagesForSession(sessionId) : 0;
    const ipCount = ipAddress ? db.countImagesForIp(ipAddress) : 0;
    const searchSessionCount = sessionId ? db.countSearchesForSession(sessionId) : 0;
    const searchIpCount = ipAddress ? db.countSearchesForIp(ipAddress) : 0;

    const sessionLimit = sessionId
      ? db.imageLimitForSession(sessionId, FREE_IMAGE_LIMIT)
      : FREE_IMAGE_LIMIT;
    const ipLimit = FREE_IMAGE_LIMIT;
    const searchSessionLimit = FREE_SEARCH_LIMIT;
    const searchIpLimit = FREE_SEARCH_LIMIT;

    const nextReduction = sessionId ? db.nextImageLimitReductionTime(sessionId) : null;
    res.json({
      sessionCount,
      sessionLimit,
      ipCount,
      ipLimit,
      nextReduction,
      searchSessionCount,
      searchSessionLimit,
      searchIpCount,
      searchIpLimit
    });
  } catch (err) {
    console.error("[Server Debug] /api/image/counts error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/upload/byId", async (req, res) => {
  try {
    const id = parseInt(req.query.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const pair = await db.getPairById(id);
    if (!pair || !pair.image_url) return res.status(404).json({ error: "Not found" });
    const name = pair.image_url.replace(/^\/?uploads\//, "");
    res.json({ file: name });
  } catch (err) {
    console.error("[Server Debug] /api/upload/byId error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/upload/title", (req, res) => {
  try {
    const name = req.query.name;
    if(!name){
      return res.status(400).json({ error: "Missing name" });
    }
    const title = db.getImageTitleForUrl(`/uploads/${name}`);
    res.json({ title: title || "" });
  } catch(err){
    console.error("[Server Debug] /api/upload/title error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/upload/status", (req, res) => {
  try {
    const { name, status, productUrl, ebayUrl } = req.body || {};
    if(!name){
      return res.status(400).json({ error: "Missing name" });
    }
    const url = `/uploads/${name}`;
    if(status !== undefined){
      db.setImageStatus(url, status || "");
    }
    if(productUrl !== undefined){
      db.setProductUrl(url, productUrl || "");
    }
    if(ebayUrl !== undefined){
      db.setEbayUrl(url, ebayUrl || "");
    }
    res.json({ success: true });
  } catch(err){
    console.error("[Server Debug] /api/upload/status error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/upload/portfolio", (req, res) => {
  try {
    const { name, portfolio } = req.body || {};
    if(!name){
      return res.status(400).json({ error: "Missing name" });
    }
    const url = `/uploads/${name}`;
    db.setImagePortfolio(url, portfolio ? 1 : 0);
    res.json({ success: true });
  } catch(err){
    console.error("[Server Debug] /api/upload/portfolio error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/upload/hidden", (req, res) => {
  try {
    const { name, hidden } = req.body || {};
    if(!name){
      return res.status(400).json({ error: "Missing name" });
    }
    const url = `/uploads/${name}`;
    db.setImageHidden(url, hidden ? 1 : 0);
    res.json({ success: true });
  } catch(err){
    console.error("[Server Debug] /api/upload/hidden error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/ebay/bulkUpdate", (req, res) => {
  try {
    const { listings } = req.body || {};
    if (!Array.isArray(listings)) {
      return res.status(400).json({ error: "Invalid listings" });
    }
    let updated = 0;
    for (const item of listings) {
      const { printifyId, ebayId } = item || {};
      if (!printifyId || !ebayId) continue;
      const ebayUrl = `https://www.ebay.com/itm/${ebayId}`;
      updated += db.setEbayUrlForProductId(printifyId, ebayUrl);
    }
    res.json({ success: true, updated });
  } catch (err) {
    console.error("[Server Debug] /api/ebay/bulkUpdate error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/chat/image", upload.single("imageFile"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No image file received." });
    }

    const userInput = req.body?.userInput || "";
    const filePath = path.join(uploadsDir, req.file.filename);

    let desc = "";
    try {
      const visionSetting = db.getSetting("ai_vision_model") || "openai/gpt-4o";
      const openaiClient = getOpenAiClient(visionSetting);
      const imageData = fs.readFileSync(filePath, { encoding: "base64" });
      function stripModelPrefix(m) {
        if (!m) return "gpt-4o";
        if (m.startsWith("openai/")) return m.substring("openai/".length);
        if (m.startsWith("openrouter/")) return m.substring("openrouter/".length);
        if (m.startsWith("deepseek/")) return m.substring("deepseek/".length);
        return m;
      }
      const visionModel = stripModelPrefix(visionSetting);
      const contentParts = [];
      if (userInput) {
        contentParts.push({ type: "text", text: userInput });
      }
      contentParts.push({ type: "text", text: "Describe this image in verbose detail." });
      contentParts.push({ type: "image_url", image_url: { url: `data:image/png;base64,${imageData}` } });
      const completion = await openaiClient.chat.completions.create({
        model: visionModel,
        messages: [
          {
            role: "user",
            content: contentParts
          }
        ],
        max_tokens: 60,
        temperature: 0.3
      });
      desc = completion.choices?.[0]?.message?.content?.trim();
      if (!desc) {
        desc = "(Could not generate description.)";
      }
    } catch (e) {
      console.error("[Server Debug] Error calling OpenAI vision API =>", e);
      desc = "(Could not generate description.)";
    }

    db.logActivity(
      "Image upload",
      JSON.stringify({ file: req.file.filename, desc, userInput })
    );
    res.json({ success: true, desc, filename: req.file.filename });
  } catch (e) {
    console.error("Error in /api/chat/image:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/upscale", async (req, res) => {
  try {
    const { file, dbId: providedDbId } = req.body || {};
    console.debug("[Server Debug] /api/upscale called with file =>", file);
    if (!file) {
      console.debug("[Server Debug] /api/upscale => missing 'file' in request body");
      return res.status(400).json({ error: "Missing file" });
    }

    const sessionId = getSessionIdFromRequest(req);
    const account = sessionId ? await db.getAccountBySession(sessionId) : null;
    if (!account) {
      return res.status(401).json({ error: "not logged in" });
    }
    if (account.id !== 1) {
      return res.status(403).json({ error: "upscale restricted" });
    }

    const scriptPath = path.join(__dirname, "../scripts/upscale.js");
    console.debug(
      "[Server Debug] /api/upscale => using scriptPath =>",
      scriptPath
    );
    const scriptCwd = path.dirname(scriptPath);
    console.debug(
      "[Server Debug] /api/upscale => using scriptCwd =>",
      scriptCwd
    );
    const filePath = path.isAbsolute(file)
      ? file
      : path.join(uploadsDir, file);
    console.debug("[Server Debug] /api/upscale => resolved filePath =>", filePath);

    if (!fs.existsSync(filePath)) {
      console.debug("[Server Debug] /api/upscale => file does not exist:", filePath);
      return res.status(400).json({ error: "File not found" });
    }

    if (!fs.existsSync(scriptPath)) {
      console.debug(
        "[Server Debug] /api/upscale => script not found:",
        scriptPath,
      );
      return res
        .status(500)
        .json({ error: `Upscale script missing at ${scriptPath}` });
    }

    console.debug('[Server Debug] launching upscale job with script =>', scriptPath);
    const job = jobManager.createJob(scriptPath, [filePath], { cwd: scriptCwd, file });
    jobManager.addDoneListener(job, () => {
      const matches = [...job.log.matchAll(/Final output saved to:\s*(.+)/gi)];
      const m = matches[matches.length - 1];
      if (m) {
        job.resultPath = m[1].trim();
        console.debug("[Server Debug] Recorded resultPath =>", job.resultPath);
        const originalUrl = `/uploads/${file}`;
        db.setUpscaledImage(originalUrl, job.resultPath);
        db.setImageStatus(originalUrl, 'Upscaled');

        const dbId = providedDbId || db.getImageIdForUrl(originalUrl);

        // RIBT step
        const ribtScript =
          process.env.RIBT_SCRIPT_PATH ||
          '/home/admin/git/LogisticaRIBT/run.sh';
        const ribtCwd = path.dirname(ribtScript);
        const ribtOutput = path.join(ribtCwd, 'output.png');
        try {
          console.debug(
            '[Server Debug] Running RIBT script =>',
            ribtScript,
            job.resultPath
          );
          child_process.execFileSync(ribtScript, [job.resultPath], { cwd: ribtCwd });
          if (fs.existsSync(ribtOutput)) {
            const ext = path.extname(job.resultPath);
            const base = path.basename(job.resultPath, ext);
            const nobgName = `${dbId || base}_nobg${ext}`;
            const dest = path.join(uploadsDir, nobgName);
            fs.copyFileSync(ribtOutput, dest);
            job.nobgPath = dest;
            console.debug('[Server Debug] Copied RIBT output to =>', dest);
            db.setUpscaledImage(`${originalUrl}-nobg`, dest);

            // Copy final
            const upscaleName = `${dbId || base}_upscale${ext}`;
            const upscaleDest = path.join(uploadsDir, upscaleName);
            const originalUpscaledSrc = job.resultPath;
            if (fs.existsSync(originalUpscaledSrc)) {
              fs.copyFileSync(originalUpscaledSrc, upscaleDest);
              job.resultPath = upscaleDest;
              console.debug('[Server Debug] Copied final upscale to =>', upscaleDest);
              db.setUpscaledImage(originalUrl, upscaleDest);
            } else {
              console.debug('[Server Debug] Expected upscale output not found at', originalUpscaledSrc);
            }
          } else {
            console.debug('[Server Debug] RIBT output not found at', ribtOutput);
          }
        } catch (err) {
          console.error('[Server Debug] RIBT step failed =>', err);
        }
      }
    });
    console.debug("[Server Debug] /api/upscale => job started", job.id);
    res.json({ jobId: job.id });
  } catch (err) {
    console.error("Error in /api/upscale:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/printify", async (req, res) => {
  try {
    const { file, productId, variants } = req.body || {};
    console.debug("[Server Debug] /api/printify called with file =>", file);
    if (!file) {
      console.debug("[Server Debug] /api/printify => missing 'file' in request body");
      return res.status(400).json({ error: "Missing file" });
    }

    const scriptPath =
      process.env.PRINTIFY_SCRIPT_PATH ||
      "/home/admin/Puppets/PrintifyPuppet/run.sh";
    console.debug(
      "[Server Debug] /api/printify => using scriptPath =>",
      scriptPath
    );
    const scriptCwd = path.dirname(scriptPath);
    console.debug(
      "[Server Debug] /api/printify => using scriptCwd =>",
      scriptCwd
    );
    const filePath = path.isAbsolute(file)
      ? file
      : path.join(uploadsDir, file);
    console.debug("[Server Debug] /api/printify => resolved filePath =>", filePath);

    if (!fs.existsSync(filePath)) {
      console.debug("[Server Debug] /api/printify => file does not exist:", filePath);
      return res.status(400).json({ error: "File not found" });
    }

    if (!fs.existsSync(scriptPath)) {
      console.debug(
        "[Server Debug] /api/printify => script not found:",
        scriptPath
      );
      return res
        .status(500)
        .json({ error: `Printify script missing at ${scriptPath}` });
    }

    const colors = detectProminentColors(filePath);
    // PrintifyPuppet expects: <designPath> "<description>" [color1] [color2] [color3]
    // We currently do not capture a description from the request, so pass an
    // empty string placeholder to ensure the colour arguments are parsed
    // correctly by the external script.
    const jobArgs = [filePath, "", ...colors];
    const job = jobManager.createJob(scriptPath, jobArgs, { cwd: scriptCwd, file });
    console.debug("[Server Debug] /api/printify => job started", job.id);

    const doneRegex = /All steps completed/i;
    let killTimer = null;
    const logListener = (chunk) => {
      if (doneRegex.test(chunk) && job.child && !killTimer) {
        killTimer = setTimeout(() => {
          if (job.child) {
            try {
              job.child.kill();
              setTimeout(() => {
                if (job.child && !job.child.killed) {
                  try {
                    job.child.kill('SIGKILL');
                  } catch (err) {
                    console.error('[Server Debug] SIGKILL failed =>', err);
                  }
                }
                setTimeout(() => {
                  if (job.status === 'running') {
                    jobManager.forceFinishJob(job.id);
                  }
                }, 2000);
              }, 5000);
            } catch (e) {
              console.error('[Server Debug] Error killing printify job =>', e);
            }
          }
        }, 15000);
      }
    };
    jobManager.addListener(job, logListener);

    jobManager.addDoneListener(job, async () => {
      jobManager.removeListener(job, logListener);
      if (killTimer) {
        clearTimeout(killTimer);
      }
      try {
        const url = `/uploads/${file}`;
        if (productId && Array.isArray(variants)) {
          await updatePrintifyProduct(productId, variants);
        }
        const productUrl =
          extractProductUrl(job.log) || extractPrintifyUrl(job.log);
        if (productUrl) {
          db.setProductUrl(url, productUrl);
          job.productUrl = productUrl;
        }
        db.setImageStatus(url, 'Printify Price Puppet');
      } catch (e) {
        console.error('[Server Debug] Failed to run Printify API update =>', e);
      }
    });

    res.json({ jobId: job.id });
  } catch (err) {
    console.error("Error in /api/printify:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/printifyPrice", async (req, res) => {
  try {
    const { file, url } = req.body || {};
    console.debug(
      "[Server Debug] /api/printifyPrice called with file =>",
      file,
      "url =>",
      url
    );
    if (!file && !url) {
      console.debug(
        "[Server Debug] /api/printifyPrice => missing url and file"
      );
      return res.status(400).json({ error: "Missing Printify URL" });
    }

    const scriptPath =
      process.env.PRINTIFY_PRICE_SCRIPT_PATH ||
      "/home/admin/Puppets/PrintifyPricePuppet/run.sh";
    console.debug(
      "[Server Debug] /api/printifyPrice => using scriptPath =>",
      scriptPath
    );
    const scriptCwd = path.dirname(scriptPath);
    console.debug(
      "[Server Debug] /api/printifyPrice => using scriptCwd =>",
      scriptCwd
    );
    let filePath = null;
    if (file) {
      filePath = path.isAbsolute(file)
        ? file
        : path.join(uploadsDir, file);
      console.debug(
        "[Server Debug] /api/printifyPrice => resolved filePath =>",
        filePath
      );

      if (!fs.existsSync(filePath)) {
        console.debug(
          "[Server Debug] /api/printifyPrice => file does not exist:",
          filePath
        );
        return res.status(400).json({ error: "File not found" });
      }
    }

    if (!fs.existsSync(scriptPath)) {
      console.debug(
        "[Server Debug] /api/printifyPrice => script not found:",
        scriptPath
      );
      return res
        .status(500)
        .json({ error: `Printify script missing at ${scriptPath}` });
    }

    let productUrl = url || null;
    if (!productUrl && file) {
      productUrl = db.getProductUrlForImage(`/uploads/${file}`);
      if (!productUrl) {
        const status = db.getImageStatusForUrl(`/uploads/${file}`);
        productUrl = extractPrintifyUrl(status || "");
      }
    }
    if (!productUrl) {
      console.debug(
        "[Server Debug] /api/printifyPrice => missing product URL for:",
        file
      );
      return res.status(400).json({ error: "Missing Printify URL" });
    }
    const args = [productUrl];

    const job = jobManager.createJob(scriptPath, args, {
      cwd: scriptCwd,
      file,
    });
    job.productUrl = productUrl;
    console.debug("[Server Debug] /api/printifyPrice => job started", job.id);

    jobManager.addDoneListener(job, async () => {
      if (file) {
        try {
          const url = `/uploads/${file}`;
          db.setImageStatus(url, "Printify API Updates");
        } catch (e) {
          console.error(
            '[Server Debug] Failed to set status after price puppet =>',
            e
          );
        }
      }
    });

    res.json({ jobId: job.id });
  } catch (err) {
    console.error("Error in /api/printifyPrice:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/printifyTitleFix", async (req, res) => {
  try {
    const { file } = req.body || {};
    console.debug(
      "[Server Debug] /api/printifyTitleFix called with file =>",
      file
    );
    if (!file) {
      return res.status(400).json({ error: "Missing file" });
    }

    let productUrl = db.getProductUrlForImage(`/uploads/${file}`);
    if (!productUrl) {
      const status = db.getImageStatusForUrl(`/uploads/${file}`);
      productUrl = extractPrintifyUrl(status || "");
    }
    if (!productUrl) {
      return res.status(400).json({ error: "Missing Printify URL" });
    }
    const productId = (() => {
      try {
        return new URL(productUrl).pathname.split("/").pop();
      } catch {
        return productUrl.split("/").pop().split("?")[0];
      }
    })();

    const scriptPath =
      process.env.PRINTIFY_TITLE_FIX_SCRIPT_PATH ||
      path.join(__dirname, "../scripts/printifyTitleFix.js");
    const scriptCwd = path.dirname(scriptPath);
    if (!fs.existsSync(scriptPath)) {
      return res
        .status(500)
        .json({ error: `Printify script missing at ${scriptPath}` });
    }

    const filePath = path.isAbsolute(file)
      ? file
      : path.join(uploadsDir, file);
    const initialTitle = db.getImageTitleForUrl(`/uploads/${file}`) || '';

    const job = jobManager.createJob(
      "node",
      [scriptPath, productId, filePath, initialTitle],
      {
        cwd: scriptCwd,
        file,
      }
    );
    console.debug("[Server Debug] /api/printifyTitleFix => job started", job.id);

    jobManager.addDoneListener(job, () => {
      try {
        const url = `/uploads/${file}`;
        const title = extractUpdatedTitle(job.log);
        if (title) {
          db.setImageTitle(url, title);
          job.resultPath = title;
        }
        db.setImageStatus(url, "Printify API Title Fix");
      } catch (e) {
        console.error(
          "[Server Debug] Failed to set status after title fix =>",
          e
        );
      }
    });

    res.json({ jobId: job.id });
  } catch (err) {
    console.error("Error in /api/printifyTitleFix:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/printifyFixMockups", async (req, res) => {
  try {
    const { file } = req.body || {};
    if (!file) return res.status(400).json({ error: "Missing file" });

    console.debug("[Server Debug] /api/printifyFixMockups called with file =>", file);

    let productUrl = db.getProductUrlForImage(`/uploads/${file}`);
    if (!productUrl) {
      const status = db.getImageStatusForUrl(`/uploads/${file}`);
      productUrl = extractPrintifyUrl(status || "");
    }
    console.debug(
      "[Server Debug] /api/printifyFixMockups resolved productUrl =>",
      productUrl
    );
    if (!productUrl) return res.status(400).json({ error: "Missing Printify URL" });

    const scriptPath = path.join(__dirname, "../scripts/runPuppet.js");
    const scriptCwd = path.dirname(scriptPath);
    if (!fs.existsSync(scriptPath)) {
      return res.status(500).json({ error: `Puppet script missing at ${scriptPath}` });
    }

    console.debug("[Server Debug] /api/printifyFixMockups running script =>", scriptPath);

    const job = jobManager.createJob(scriptPath, ["PrintifyFixMockups", productUrl], { cwd: scriptCwd, file });
    jobManager.addDoneListener(job, () => {
      try {
        const url = `/uploads/${file}`;
        db.setImageStatus(url, "Printify Fix Mockups");
      } catch (e) {
        console.error("[Server Debug] Failed to set status after fix mockups =>", e);
      }
    });

    res.json({ jobId: job.id });
  } catch (err) {
    console.error("Error in /api/printifyFixMockups:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/printifyFinalize", async (req, res) => {
  try {
    const { file } = req.body || {};
    if (!file) return res.status(400).json({ error: "Missing file" });

    let productUrl = db.getProductUrlForImage(`/uploads/${file}`);
    if (!productUrl) {
      const status = db.getImageStatusForUrl(`/uploads/${file}`);
      productUrl = extractPrintifyUrl(status || "");
    }
    if (!productUrl) return res.status(400).json({ error: "Missing Printify URL" });

    const scriptPath = path.join(__dirname, "../scripts/runPuppet.js");
    const scriptCwd = path.dirname(scriptPath);
    if (!fs.existsSync(scriptPath)) {
      return res.status(500).json({ error: `Puppet script missing at ${scriptPath}` });
    }

    const job = jobManager.createJob(scriptPath, ["PrintifyFinalize", productUrl], { cwd: scriptCwd, file });
    jobManager.addDoneListener(job, () => {
      try {
        const url = `/uploads/${file}`;
        db.setImageStatus(url, "Printify Finalize");
      } catch (e) {
        console.error("[Server Debug] Failed to set status after finalize =>", e);
      }
    });

    res.json({ jobId: job.id });
  } catch (err) {
    console.error("Error in /api/printifyFinalize:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/printify/updateProduct", async (req, res) => {
  try {
    const { productId, variants, file } = req.body || {};
    if (!productId) {
      return res.status(400).json({ error: "Missing productId" });
    }
    if (variants && !Array.isArray(variants)) {
      return res.status(400).json({ error: "Variants must be an array" });
    }
    if (Array.isArray(variants)) {
      await updatePrintifyProduct(productId, variants);
    }
    if (file) {
      try {
        const url = path.isAbsolute(file) ? `/uploads/${path.basename(file)}` : `/uploads/${file}`;
        db.setImageStatus(url, "Printify API Updates");
      } catch (e) {
        console.error("[Server Debug] Failed to set status after printify API update =>", e);
      }
    }
    res.json({ updated: true });
  } catch (err) {
    console.error("Error in /api/printify/updateProduct:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/jobs", (req, res) => {
  res.json(jobManager.listJobs());
});

app.get("/api/jobHistory", (req, res) => {
  res.json(jobManager.listHistory());
});

app.get("/api/jobHistory/:id/log", (req, res) => {
  const rec = jobManager.getHistory(req.params.id);
  if (!rec) return res.status(404).json({ error: "Job not found" });
  res.type("text/plain").send(rec.log || "");
});

app.get("/api/jobs/:id/log", (req, res) => {
  const job = jobManager.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found" });
  res.type("text/plain").send(job.log);
});

app.get("/api/jobs/:id/stream", (req, res) => {
  const job = jobManager.getJob(req.params.id);
  if (!job) return res.status(404).end();
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.flushHeaders();
  res.write(`event: log\ndata:${JSON.stringify(job.log)}\n\n`);
  const logListener = (chunk) => {
    res.write(`event: log\ndata:${JSON.stringify(chunk)}\n\n`);
  };
  const doneListener = () => {
    res.write(`event: done\ndata:done\n\n`);
  };
  jobManager.addListener(job, logListener);
  jobManager.addDoneListener(job, doneListener);
  req.on("close", () => {
    jobManager.removeListener(job, logListener);
    jobManager.removeDoneListener(job, doneListener);
  });
});

app.post("/api/jobs/:id/stop", (req, res) => {
  const ok = jobManager.stopJob(req.params.id);
  if (!ok) return res.status(404).json({ error: "Job not found" });
  res.json({ stopped: true });
});

// ---------------------------------------------------------------------------
// Printify pipeline job queue endpoints
// ---------------------------------------------------------------------------
app.get("/api/pipelineQueue", (req, res) => {
  console.debug("[Server Debug] GET /api/pipelineQueue", req.query);
  const limit = parseInt(req.query.limit) || 0;
  const offset = parseInt(req.query.offset) || 0;
  const queue = limit || offset
    ? printifyQueue.listPaginatedByDbId(limit, offset)
    : printifyQueue.list();
  console.debug(
    "[Server Debug] Current queue =>",
    JSON.stringify(queue, null, 2)
  );
  res.json(queue);
});

app.post("/api/pipelineQueue", (req, res) => {
  console.debug("[Server Debug] POST /api/pipelineQueue =>", req.body);
  const { file, type, dbId, variant, toTop } = req.body || {};
  if (!file || !type) {
    return res.status(400).json({ error: "Missing file or type" });
  }
  let parsedDbId = null;
  if (dbId !== undefined && dbId !== null && dbId !== "") {
    const n = parseInt(dbId, 10);
    if (!Number.isNaN(n)) parsedDbId = n;
  }
  const job = printifyQueue.enqueue(file, type, parsedDbId, variant || null, !!toTop);
  console.debug(
    "[Server Debug] Enqueued job =>",
    JSON.stringify(job, null, 2)
  );
  res.json({ jobId: job.id });
});

// Remove all finished or failed jobs
app.delete("/api/pipelineQueue/finished", (req, res) => {
  console.debug("[Server Debug] DELETE /api/pipelineQueue/finished");
  const count = printifyQueue.removeFinished();
  console.debug(
    "[Server Debug] removeFinished called. Count =>",
    count,
    "Queue =>",
    JSON.stringify(printifyQueue.list(), null, 2)
  );
  res.json({ removed: count });
});

app.delete("/api/pipelineQueue/:id", (req, res) => {
  console.debug("[Server Debug] DELETE /api/pipelineQueue/:id =>", req.params.id);
  const ok = printifyQueue.remove(req.params.id);
  if (!ok) return res.status(404).json({ error: "Job not found" });
  console.debug("[Server Debug] Job removed. Queue =>", JSON.stringify(printifyQueue.list(), null, 2));
  res.json({ removed: true });
});

app.delete("/api/pipelineQueue/db/:dbId", (req, res) => {
  console.debug(
    "[Server Debug] DELETE /api/pipelineQueue/db/:dbId =>",
    req.params.dbId
  );
  let parsedDbId = null;
  if (req.params.dbId !== undefined && req.params.dbId !== null && req.params.dbId !== "") {
    const n = parseInt(req.params.dbId, 10);
    if (!Number.isNaN(n)) parsedDbId = n;
  }
  const ok = printifyQueue.removeByDbId(parsedDbId);
  if (!ok) return res.status(404).json({ error: "Jobs not found" });
  console.debug(
    "[Server Debug] Jobs removed for DB =>",
    parsedDbId,
    JSON.stringify(printifyQueue.list(), null, 2)
  );
  res.json({ removed: true });
});

app.post("/api/pipelineQueue/stopAll", (req, res) => {
  console.debug("[Server Debug] POST /api/pipelineQueue/stopAll");
  printifyQueue.stopAll();
  console.debug(
    "[Server Debug] stopAll called. Queue =>",
    JSON.stringify(printifyQueue.list(), null, 2)
  );
  res.json({ stopped: true });
});

app.post("/api/pipelineQueue/retryFailed", (req, res) => {
  console.debug("[Server Debug] POST /api/pipelineQueue/retryFailed");
  const count = printifyQueue.retryFailed();
  console.debug(
    "[Server Debug] retryFailed called. Count =>",
    count,
    "Queue =>",
    JSON.stringify(printifyQueue.list(), null, 2)
  );
  res.json({ retried: count });
});

app.post("/api/pipelineQueue/reorder", (req, res) => {
  console.debug("[Server Debug] POST /api/pipelineQueue/reorder =>", req.body);
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  const ok = printifyQueue.reorder(ids);
  console.debug(
    "[Server Debug] reorder result =>",
    ok,
    JSON.stringify(printifyQueue.list(), null, 2)
  );
  if (!ok) return res.status(400).json({ error: "Invalid ids" });
  res.json({ reordered: true });
});

app.get("/api/pipelineQueue/state", (req, res) => {
  console.debug("[Server Debug] GET /api/pipelineQueue/state");
  const paused = printifyQueue.isPaused();
  console.debug("[Server Debug] Queue paused?", paused);
  res.json({ paused });
});

app.post("/api/pipelineQueue/pause", (req, res) => {
  console.debug("[Server Debug] POST /api/pipelineQueue/pause");
  printifyQueue.pause();
  console.debug("[Server Debug] Queue paused");
  res.json({ paused: true });
});

app.post("/api/pipelineQueue/resume", (req, res) => {
  console.debug("[Server Debug] POST /api/pipelineQueue/resume");
  printifyQueue.resume();
  console.debug("[Server Debug] Queue resumed");
  res.json({ paused: false });
});

app.get("/api/upscale/result", (req, res) => {
  try {
    const file = req.query.file;
    if (!file) return res.status(400).json({ error: "Missing file" });

    const ext = path.extname(file);
    const base = path.basename(file, ext);
    const candidates = [
      ...(function() {
        const id = db.getImageIdForUrl(`/uploads/${file}`);
        return id ? [path.join(uploadsDir, `${id}_upscale${ext}`)] : [];
      })(),
      path.join(uploadsDir, `${base}_4096${ext}`),
      path.join(uploadsDir, `${base}-4096${ext}`),
      path.join(uploadsDir, `${base}_upscaled${ext}`),
      path.join(uploadsDir, `${base}-upscaled${ext}`),
    ];
    const nobgCandidates = [
      ...(function() {
        const id = db.getImageIdForUrl(`/uploads/${file}`);
        return id ? [path.join(uploadsDir, `${id}_nobg${ext}`)] : [];
      })(),
      path.join(uploadsDir, `${base}_4096_nobg${ext}`),
      path.join(uploadsDir, `${base}-4096-nobg${ext}`),
      path.join(uploadsDir, `${base}_upscaled_nobg${ext}`),
      path.join(uploadsDir, `${base}-upscaled-nobg${ext}`),
      path.join(uploadsDir, `${base}_4096_no_bg${ext}`),
      path.join(uploadsDir, `${base}-4096-no_bg${ext}`),
      path.join(uploadsDir, `${base}_4096-no-bg${ext}`),
      path.join(uploadsDir, `${base}-4096-no-bg${ext}`),
      path.join(uploadsDir, `${base}_upscaled_no_bg${ext}`),
      path.join(uploadsDir, `${base}-upscaled-no_bg${ext}`),
      path.join(uploadsDir, `${base}_upscaled-no-bg${ext}`),
      path.join(uploadsDir, `${base}-upscaled-no-bg${ext}`),
    ];
    let found = null;
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        found = p;
        break;
      }
    }
    let nobgFound = null;
    for (const p of nobgCandidates) {
      if (fs.existsSync(p)) {
        nobgFound = p;
        break;
      }
    }
    const toUrl = (p) => {
      if (!p) return null;
      if (p.startsWith(uploadsDir)) {
        return "/uploads/" + path.relative(uploadsDir, p).replace(/\\/g, "/");
      }
      return p;
    };
    if (found || nobgFound) {
      return res.json({ url: toUrl(found), nobgUrl: toUrl(nobgFound) });
    }

    const fromDb = db.getUpscaledImage(`/uploads/${file}`);
    const fromDbNoBg = db.getUpscaledImage(`/uploads/${file}-nobg`);
    if ((fromDb && fs.existsSync(fromDb)) || (fromDbNoBg && fs.existsSync(fromDbNoBg))) {
      return res.json({ url: toUrl(fromDb) || null, nobgUrl: toUrl(fromDbNoBg) || null });
    }

    const jobs = jobManager.listJobs();
    for (const j of jobs) {
      if (j.file === file && j.resultPath && fs.existsSync(j.resultPath)) {
        return res.json({ url: toUrl(j.resultPath), nobgUrl: toUrl(j.nobgPath) || null });
      }
    }

    res.json({ url: null, nobgUrl: null });
  } catch (err) {
    console.error("/api/upscale/result error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/image/generate", async (req, res) => {
  try {
    const { prompt, n, size, model, provider, tabId, sessionId } = req.body || {};
    const finalPrompt = (prompt || "").trim();
    const ipAddress = (req.headers["x-forwarded-for"] || req.ip || "").split(",")[0].trim();
    console.debug(
      "[Server Debug] /api/image/generate =>",
      JSON.stringify({ prompt, n, size, model, provider, tabId, sessionId })
    );
    if (!prompt) {
      return res.status(400).json({ error: "Missing prompt" });
    }

    let tabRecord = null;
    let isDesignTab = false;
    if (tabId) {
      tabRecord = await db.getChatTab(parseInt(tabId, 10), sessionId || null);
      if (!tabRecord) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      if (tabRecord.tab_type !== 'design') {
        return res.status(400).json({ error: 'Image generation only allowed for design tabs' });
      }
      isDesignTab = true;
    }

    let service = (provider || db.getSetting("image_gen_service") || "openai").toLowerCase();
    if (isDesignTab) {
      service = 'openai';
    }

    const allowedSizes = ["1024x1024", "1024x1792", "1792x1024"];
    const imgSize = allowedSizes.includes(size) ? size : "1024x1024";

    let countParsed = parseInt(n, 10);
    if (isNaN(countParsed) || countParsed < 1) countParsed = 1;

    if (sessionId) {
      db.ensureImageSession(sessionId);
    }

    if (sessionId) {
      const current = db.countImagesForSession(sessionId);
      const limit = db.imageLimitForSession(sessionId, FREE_IMAGE_LIMIT);
      if (limit >= 0 && current >= limit) {
        return res.status(429).json({
          error: 'Image generation limit reached for this session',
          type: 'image_session_limit',
          counts: { sessionCount: current, sessionLimit: limit }
        });
      }
    }

    if (ipAddress) {
      const ipCount = db.countImagesForIp(ipAddress);
      if (ipCount >= FREE_IMAGE_LIMIT) {
        return res.status(429).json({
          error: 'Image generation limit reached for this IP',
          type: 'image_ip_limit',
          counts: { ipCount, ipLimit: FREE_IMAGE_LIMIT }
        });
      }
    }

    if (service === "stable-diffusion") {
      const sdBase = process.env.STABLE_DIFFUSION_URL;
      if (!sdBase) {
        return res.status(500).json({ error: "STABLE_DIFFUSION_URL not configured" });
      }
      const [w, h] = imgSize.split("x").map(v => parseInt(v, 10));
      const sdEndpoint = sdBase.replace(/\/$/, "") + "/sdapi/v1/txt2img";
      const payload = { prompt: finalPrompt, width: w, height: h, steps: 20, batch_size: countParsed };
      if (model) payload.model = model;
      console.debug("[Server Debug] Calling Stable Diffusion =>", sdEndpoint, JSON.stringify(payload));
      const resp = await axios.post(sdEndpoint, payload);
      const b64 = resp.data?.images?.[0];
      if (!b64) {
        return res.status(502).json({ error: "Received empty response from Stable Diffusion" });
      }
      const buffer = Buffer.from(b64, "base64");
      const filename = `sd-${Date.now()}-${Math.round(Math.random() * 1e9)}.png`;
      const filePath = path.join(uploadsDir, filename);
      fs.writeFileSync(filePath, buffer);
      await removeColorSwatches(filePath);
      console.debug("[Server Debug] Saved Stable Diffusion image =>", filePath);
      const localUrl = `/uploads/${filename}`;
      db.logActivity(
        "Image generate",
        JSON.stringify({ prompt, url: localUrl, model: model || "", n: countParsed, provider: service })
      );
      const tab = tabRecord ? tabRecord.id : parseInt(tabId, 10) || 1;
      const imageTitle = await deriveImageTitle(prompt);
      const modelId = model ? `stable-diffusion/${model}` : 'stable-diffusion';
      db.createImagePair(localUrl, prompt || '', tab, imageTitle, 'Generated', sessionId, ipAddress, modelId, 1);
      return res.json({ success: true, url: localUrl, title: imageTitle });
    }

    const openAiKey = process.env.OPENAI_API_KEY;
    if (!openAiKey) {
      console.warn("[Server Debug] /api/image/generate missing OPENAI_API_KEY");
      return res.status(500).json({
        error:
          "Image generation is not configured. Please ask an administrator to set the OpenAI API key."
      });
    }

    const openaiClient = new OpenAI({ apiKey: openAiKey });

    let modelName = (model || db.getSetting("image_gen_model") || "gptimage1").toLowerCase();
    if (modelName === "gptimage1") modelName = "gpt-image-1";
    if (modelName === "dalle2") modelName = "dall-e-2";
    if (modelName === "dalle3") modelName = "dall-e-3";
    if (isDesignTab) {
      modelName = "gpt-image-1";
    }
    const allowedModels = ["dall-e-2", "dall-e-3", "gpt-image-1"];
    if (!allowedModels.includes(modelName)) {
      return res.status(400).json({ error: "Invalid model" });
    }

    if (modelName === "dall-e-3" || modelName === "gpt-image-1") {
      countParsed = 1;
    } else {
      countParsed = Math.min(countParsed, 4);
    }

    console.debug(
      "[Server Debug] Calling OpenAI image API =>",
      JSON.stringify({ model: modelName, n: countParsed, size: imgSize })
    );

    let result;
    try {
      const params = {
        model: modelName,
        prompt: finalPrompt.slice(0, 1000),
        n: countParsed,
        size: imgSize
      };
      if (modelName !== "gpt-image-1") {
        params.response_format = "url";
      }
      result = await openaiClient.images.generate(params);
    } catch (err) {
      if (
        (modelName === "dall-e-3" || modelName === "gpt-image-1") &&
        err?.type === "image_generation_user_error"
      ) {
        try {
          result = await openaiClient.images.generate({
            model: "dall-e-2",
            prompt: finalPrompt.slice(0, 1000),
            n: Math.min(countParsed, 4),
            size: "1024x1024",
            response_format: "url"
          });
          modelName = "dall-e-2";
        } catch (err2) {
          throw err2;
        }
      } else {
        throw err;
      }
    }

    let first = null;
    let b64 = null;
    if (result && Array.isArray(result.data) && result.data[0]) {
      first = result.data[0].url || result.data[0].image_url || null;
      if (first && typeof first === 'object' && first.url) {
        first = first.url;
      }
      b64 = result.data[0].b64_json || null;
    }
    console.debug("[Server Debug] OpenAI response url =>", first);
    if (!first && !b64) {
      return res.status(502).json({ error: "Received empty response from AI service" });
    }

    let localUrl = first;
    try {
      if (first) {
        const resp = await axios.get(first, { responseType: "arraybuffer" });
        const ext = path.extname(new URL(first).pathname) || ".png";
        const filename = `generated-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
        const filePath = path.join(uploadsDir, filename);
        fs.writeFileSync(filePath, resp.data);
        await removeColorSwatches(filePath);
        console.debug("[Server Debug] Saved OpenAI image =>", filePath);
        localUrl = `/uploads/${filename}`;
      } else if (b64) {
        const buffer = Buffer.from(b64, "base64");
        const filename = `generated-${Date.now()}-${Math.round(Math.random() * 1e9)}.png`;
        const filePath = path.join(uploadsDir, filename);
        fs.writeFileSync(filePath, buffer);
        await removeColorSwatches(filePath);
        console.debug("[Server Debug] Saved OpenAI b64 image =>", filePath);
        localUrl = `/uploads/${filename}`;
      }
    } catch(downloadErr) {
      console.error("[Server Debug] Failed to download generated image:", downloadErr);
    }

    db.logActivity(
      "Image generate",
      JSON.stringify({ prompt, url: localUrl, model: modelName, n: countParsed, provider: service })
    );

    const tab = tabRecord ? tabRecord.id : parseInt(tabId, 10) || 1;
    const imageTitle = await deriveImageTitle(prompt, openaiClient);
    const modelId = `openai/${modelName}`;
    db.createImagePair(localUrl, prompt || '', tab, imageTitle, 'Generated', sessionId, ipAddress, modelId, 1);

    res.json({ success: true, url: localUrl, title: imageTitle });
  } catch (err) {
    console.error("[Server Debug] /api/image/generate error:", err);
    const status = err?.status || err?.response?.status || 500;
    let message = err?.response?.data?.error?.message ?? err?.message;
    if (!message) {
      if (err?.type === "image_generation_user_error") {
        message = "Image generation failed: invalid prompt or policy violation.";
      } else {
        message = "Image generation failed";
      }
    }
    res.status(status).json({ error: message, code: err.code, type: err.type });
  }
});

app.get("/Image.html", (req, res) => {
  console.debug("[Server Debug] GET /Image.html =>", JSON.stringify(req.query));
  res.sendFile(path.join(__dirname, "../public/Image.html"));
});

// Default landing page
app.all("/index.html", (req, res) => {
  console.debug(
    `[Server Debug] ${req.method} /index.html => Redirecting to alfe.sh`
  );
  return res.redirect("https://alfe.sh");
});

app.get("/", async (req, res) => {
  let sessionId = getSessionIdFromRequest(req);
  if (req.hostname === "dev.alfe.sh") {
    try {
      const { uuid } = await db.createChatTab(
        "Untitled",
        0,
        "",
        "",
        '',
        0,
        "chat",
        sessionId,
        0
      );
      return res.redirect(`/chat/${uuid}`);
    } catch (err) {
      console.error("[Server Debug] Auto new tab error:", err);
    }
  }

  if (["mvp2.alfe.sh", "chat.alfe.sh"].includes(req.hostname)) {
    try {
      const { sessionId } = ensureSessionIdCookie(req, res);
      const { uuid } = await db.createChatTab(
        "Untitled",
        0,
        "",
        "",
        '',
        0,
        "chat",
        sessionId,
        0
      );
      return res.redirect(`/chat/${uuid}`);
    } catch (err) {
      console.error("[Server Debug] Auto new tab error:", err);
    }
  }
  try {
    if (!sessionId) {
      const ensured = ensureSessionIdCookie(req, res);
      sessionId = ensured.sessionId;
      const { id: tabId, uuid } = await db.createChatTab(
        "Untitled",
        0,
        "",
        "",
        "",
        0,
        "chat",
        sessionId,
        0
      );
      writeSessionAwareSetting(sessionId, "last_chat_tab", tabId);
      console.debug("[Server Debug] GET / => Created new chat tab");
      return res.redirect(`/chat/${uuid}`);
    }

    const tabs = await db.listChatTabs(null, false, sessionId);
    if (tabs.length === 0) {
      const { id: tabId, uuid } = await db.createChatTab(
        "Untitled",
        0,
        "",
        "",
        "",
        0,
        "chat",
        sessionId,
        0
      );
      writeSessionAwareSetting(sessionId, "last_chat_tab", tabId);
      console.debug("[Server Debug] GET / => Created new chat tab");
      return res.redirect(`/chat/${uuid}`);
    }

    const lastTabId = readSessionAwareSetting(sessionId, "last_chat_tab");
    let target = null;
    if (typeof lastTabId !== "undefined") {
      target = await db.getChatTab(lastTabId, sessionId);
    }
    if (!target) {
      target = tabs[0];
    }
    const path = resolveTabPath(target);
    if (path) {
      console.debug(
        `[Server Debug] GET / => Redirecting to last tab ${target.tab_uuid || path}`
      );
      return res.redirect(path);
    }
  } catch (err) {
    console.error("[Server Debug] Error checking chat tabs:", err);
  }
  console.debug("[Server Debug] GET / => Serving aurora.html");
  res.sendFile(path.join(__dirname, "../public/aurora.html"));
});

app.get("/search", async (req, res) => {
  try {
    const q = String(req.query.q || "");
    const sessionId = getSessionIdFromRequest(req);
    const { id: tabId, uuid } = await db.createChatTab(
      "Search",
      0,
      "",
      "",
      "",
      0,
      "chat",
      sessionId,
      0
    );
    const searchModel =
      db.getSetting("ai_search_model") || DEFAULT_SEARCH_MODEL;
    db.setChatTabModel(tabId, searchModel);
    const query = q ? `?search=1&q=${encodeURIComponent(q)}` : "?search=1";
    return res.redirect(`/chat/${uuid}${query}`);
  } catch (err) {
    console.error("[Server Debug] GET /search error:", err);
    res.redirect("https://alfe.sh");
  }
});

app.get("/new", async (req, res) => {
  try {
    const { sessionId, created } = ensureSessionIdCookie(req, res);

    let name = "Untitled";
    const autoNaming = db.getSetting("chat_tab_auto_naming");
    const projectName = db.getSetting("sterling_project") || "";
    if (autoNaming && projectName) {
      name = `${projectName}: ${name}`;
    }

    const { id: tabId, uuid } = await db.createChatTab(
      name,
      0,
      "",
      "",
      "",
      0,
      "chat",
      sessionId,
      0,
      ""
    );

    writeSessionAwareSetting(sessionId, "last_chat_tab", tabId);
    if (created) {
      console.debug(
        `[Server Debug] GET /new => Created chat tab ${tabId} (${uuid}) for new session ${sessionId.slice(0, 8)}…`
      );
    } else {
      console.debug(
        `[Server Debug] GET /new => Created chat tab ${tabId} (${uuid}) for existing session ${sessionId.slice(0, 8)}…`
      );
    }
    console.debug(`[Server Debug] GET /new => Redirecting to /chat/${uuid}`);
    res.redirect(`/chat/${uuid}`);
  } catch (err) {
    console.error("[Server Debug] GET /new error:", err);
    res.redirect("https://alfe.sh");
  }
});


const projectViewPublicDir = path.join(
  __dirname,
  "../public/ProjectView"
);

const projectViewRouter = express.Router();

projectViewRouter.get("/api/projects", async (req, res) => {
  const { sessionId } = ensureSessionIdCookie(req, res);
  try {
    const projects = await readProjectViewProjects(sessionId);
    res.json(projects);
  } catch (err) {
    console.error("[ProjectView] Failed to load projects:", err);
    res.status(500).json({ message: "Unable to load projects." });
  }
});

projectViewRouter.post("/api/projects", async (req, res) => {
  const { sessionId } = ensureSessionIdCookie(req, res);
  const projects = req.body;
  if (!Array.isArray(projects)) {
    return res
      .status(400)
      .json({ message: "Request body must be an array of projects." });
  }

  try {
    await writeProjectViewProjects(projects, sessionId);
    res.status(200).json({ message: "Projects saved successfully." });
  } catch (err) {
    console.error("[ProjectView] Failed to save projects:", err);
    res.status(500).json({ message: "Unable to save projects." });
  }
});

projectViewRouter.get("/api/queue", async (req, res) => {
  const { sessionId } = ensureSessionIdCookie(req, res);
  try {
    const queue = await readProjectViewQueue(sessionId);
    res.json(queue);
  } catch (err) {
    console.error("[ProjectView] Failed to load queue:", err);
    res.status(500).json({ message: "Unable to load queue." });
  }
});

projectViewRouter.post("/api/queue", async (req, res) => {
  const { sessionId } = ensureSessionIdCookie(req, res);
  const task = req.body;
  if (!task || typeof task !== "object" || !task.title) {
    return res
      .status(400)
      .json({ message: "Task must be an object with a title." });
  }

  try {
    const queue = await readProjectViewQueue(sessionId);
    const newTask = {
      id: randomUUID(),
      title: String(task.title || "").trim(),
      description: String(task.description || "").trim(),
      createdAt: new Date().toISOString(),
    };
    queue.push(newTask);
    await writeProjectViewQueue(queue, sessionId);
    res.status(200).json({ message: "Task enqueued.", task: newTask });
  } catch (err) {
    console.error("[ProjectView] Failed to save queue:", err);
    res.status(500).json({ message: "Unable to save queue." });
  }
});

projectViewRouter.post("/api/queue/send", async (req, res) => {
  const { sessionId } = ensureSessionIdCookie(req, res);
  const { taskId, projectId } = req.body || {};
  if (!taskId || !projectId) {
    return res
      .status(400)
      .json({ message: "taskId and projectId are required." });
  }

  try {
    const queue = await readProjectViewQueue(sessionId);
    const idx = queue.findIndex((t) => t && t.id === taskId);
    if (idx === -1) {
      return res.status(404).json({ message: "Task not found in queue." });
    }
    const [task] = queue.splice(idx, 1);

    const projects = await readProjectViewProjects(sessionId);
    const project = Array.isArray(projects)
      ? projects.find((p) => p && p.id === projectId)
      : null;
    if (!project) {
      return res.status(404).json({ message: "Project not found." });
    }
    if (!Array.isArray(project.tasks)) {
      project.tasks = [];
    }
    project.tasks.push({
      id: task.id,
      title: task.title,
      description: task.description || "",
      completed: false,
    });

    await writeProjectViewProjects(projects, sessionId);
    await writeProjectViewQueue(queue, sessionId);

    res.status(200).json({ message: "Task sent to project." });
  } catch (err) {
    console.error("[ProjectView] Failed to send task:", err);
    res.status(500).json({ message: "Unable to send task." });
  }
});

projectViewRouter.get("/queue", (_req, res) => {
  res.sendFile(path.join(projectViewPublicDir, "queue.html"));
});

projectViewRouter.use(express.static(projectViewPublicDir));

projectViewRouter.get("*", (_req, res) => {
  res.sendFile(path.join(projectViewPublicDir, "index.html"));
});

const projectViewEnabled = parseBooleanEnv(
  process.env.AURORA_PROJECTVIEW_ENABLED,
  true
);

if (projectViewEnabled) {
  app.use("/ProjectView", projectViewRouter);
} else {
  console.debug(
    "[Server Debug] ProjectView disabled by AURORA_PROJECTVIEW_ENABLED; /ProjectView routes not mounted."
  );
}

app.get("/aurora-config.js", (_req, res) => {
  const flags = {
    codeRedirect: {
      enabled: codeAlfeRedirectEnabled,
      target: CODE_ALFE_REDIRECT_TARGET,
    },
    printifyQueue: {
      enabled: parseBooleanEnv(process.env.AURORA_PRINTIFY_QUEUE_ENABLED, false),
    },
    imageUpload: {
      enabled: IMAGE_UPLOAD_ENABLED,
    },
    searchEnabled2026: SEARCH_ENABLED_2026,
    imagesEnabled2026: IMAGES_ENABLED_2026,
    twoFactorEnabled2026: TWO_FACTOR_ENABLED_2026,
    hideThemeOption: hideThemeOption,
    collapseReasoningByDefaultVisible: collapseReasoningByDefaultVisible,
  };
  const script = `window.AURORA_FLAGS = Object.assign({}, window.AURORA_FLAGS || {}, ${JSON.stringify(
    flags
  )});`;
  res
    .type("application/javascript")
    .set("Cache-Control", "no-store")
    .send(`${script}\n`);
});

app.get("/code/how-it-works.html", (_req, res) => {
  res.sendFile(
    path.join(__dirname, "..", "..", "AlfeCode", "public", "how-it-works.html")
  );
});

const staticCacheSeconds = parseInt(process.env.STATIC_CACHE_SECONDS || "900", 10);
app.use(
  express.static(path.join(__dirname, "../public"), {
    etag: false,
    maxAge: staticCacheSeconds * 1000,
    setHeaders: (res) => {
      res.set("Cache-Control", `public, max-age=${staticCacheSeconds}`);
    },
  })
);

app.all(["/beta", "/beta/*"], (req, res) => {
  console.debug(
    `[Server Debug] ${req.method} ${req.originalUrl} => Redirecting to home page`
  );
  res.redirect(302, "/");
});

app.get("/chat", (req, res) => {
  console.debug("[Server Debug] GET /chat => Redirecting to home page logic");
  res.redirect("/");
});

app.get("/chat/:tabUuid", (req, res) => {
  console.debug(`[Server Debug] GET /chat/${req.params.tabUuid} => Serving aurora.html`);
  res.sendFile(path.join(__dirname, "../public/aurora.html"));
});

app.get("/code", (req, res) => {
  if (codeAlfeRedirectEnabled) {
    console.debug(
      `[Server Debug] GET /code => Redirecting to ${CODE_ALFE_REDIRECT_TARGET}`
    );
    return res.redirect(302, CODE_ALFE_REDIRECT_TARGET);
  }
  console.debug("[Server Debug] GET /code => Serving aurora.html");
  res.sendFile(path.join(__dirname, "../public/aurora.html"));
});

app.get("/code/:tabUuid", (req, res) => {
  if (codeAlfeRedirectEnabled) {
    console.debug(
      `[Server Debug] GET /code/${req.params.tabUuid} => Redirecting to ${CODE_ALFE_REDIRECT_TARGET}`
    );
    return res.redirect(302, CODE_ALFE_REDIRECT_TARGET);
  }
  console.debug(`[Server Debug] GET /code/${req.params.tabUuid} => Serving aurora.html`);
  res.sendFile(path.join(__dirname, "../public/aurora.html"));
});

app.get("/test_projects", (req, res) => {
  console.debug("[Server Debug] GET /test_projects => Serving test_projects.html");
  res.sendFile(path.join(__dirname, "../public/test_projects.html"));
});

app.get("/activity", (req, res) => {
  console.debug("[Server Debug] GET /activity => Serving activity.html");
  res.sendFile(path.join(__dirname, "../public/activity.html"));
});

app.get("/db", (req, res) => {
  if (!isIpAllowed(getRequestIp(req), configIpWhitelist)) {
    console.warn("[Server Debug] GET /db blocked by CONFIG_IP_WHITELIST");
    return res.status(403).send("Forbidden");
  }
  console.debug("[Server Debug] GET /db => Serving db.html");
  res.sendFile(path.join(__dirname, "../public/db.html"));
});

app.get("/ai_models", (req, res) => {
  console.debug("[Server Debug] GET /ai_models => Serving ai_models.html");
  res.sendFile(path.join(__dirname, "../public/ai_models.html"));
});

app.get("/image_generator", (req, res) => {
  console.debug("[Server Debug] GET /image_generator => Serving image_generator.html");
  res.sendFile(path.join(__dirname, "../public/image_generator.html"));
});

app.get("/images", (req, res) => {
  console.debug("[Server Debug] GET /images => Serving generated_images.html");
  res.sendFile(path.join(__dirname, "../public/generated_images.html"));
});

app.get("/splash", (req, res) => {
  console.debug("[Server Debug] GET /splash => Serving splash.html");
  res.sendFile(path.join(__dirname, "../public/splash.html"));
});

app.get("/pm_agi", (req, res) => {
  console.debug("[Server Debug] GET /pm_agi => Serving pm_agi.html");
  res.sendFile(path.join(__dirname, "../public/pm_agi.html"));
});

app.delete("/api/chat/pair/:id", (req, res) => {
  console.debug("[Server Debug] DELETE /api/chat/pair =>", req.params.id);
  try {
    const pairId = parseInt(req.params.id, 10);
    if (Number.isNaN(pairId)) {
      return res.status(400).json({ error: "Invalid pair ID" });
    }
    db.deleteChatPair(pairId);
    res.json({ success: true });
  } catch (err) {
    console.error("[AlfeChat] DELETE /api/chat/pair/:id error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.delete("/api/chat/pair/:id/ai", (req, res) => {
  console.debug("[Server Debug] DELETE /api/chat/pair/:id/ai =>", req.params.id);
  try {
    const pairId = parseInt(req.params.id, 10);
    if (Number.isNaN(pairId)) {
      return res.status(400).json({ error: "Invalid pair ID" });
    }
    db.deleteAiPart(pairId);
    res.json({ success: true });
  } catch (err) {
    console.error("[AlfeChat] DELETE /api/chat/pair/:id/ai error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.delete("/api/chat/pair/:id/user", (req, res) => {
  console.debug("[Server Debug] DELETE /api/chat/pair/:id/user =>", req.params.id);
  try {
    const pairId = parseInt(req.params.id, 10);
    if (Number.isNaN(pairId)) {
      return res.status(400).json({ error: "Invalid pair ID" });
    }
    db.deleteUserPart(pairId);
    res.json({ success: true });
  } catch (err) {
    console.error("[AlfeChat] DELETE /api/chat/pair/:id/user error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/chat/pair/:id/user", (req, res) => {
  console.debug("[Server Debug] POST /api/chat/pair/:id/user =>", req.params.id);
  try {
    const pairId = parseInt(req.params.id, 10);
    const { text = "" } = req.body || {};
    if (Number.isNaN(pairId)) {
      return res.status(400).json({ error: "Invalid pair ID" });
    }
    db.updateUserText(pairId, text);
    res.json({ success: true });
  } catch (err) {
    console.error("[AlfeChat] POST /api/chat/pair/:id/user error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/chat/pair/:id/ai", (req, res) => {
  console.debug("[Server Debug] POST /api/chat/pair/:id/ai =>", req.params.id);
  try {
    const pairId = parseInt(req.params.id, 10);
    const { text = "" } = req.body || {};
    if (Number.isNaN(pairId)) {
      return res.status(400).json({ error: "Invalid pair ID" });
    }
    db.updateAiText(pairId, text);
    res.json({ success: true });
  } catch (err) {
    console.error("[AlfeChat] POST /api/chat/pair/:id/ai error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/projectSearch", async (req, res) => {
  try {
    const { project = "", query = "" } = req.body || {};
    if (!project || !query) {
      return res.status(400).json({ error: "Missing project or query" });
    }
    const pairs = db.getChatPairsByProject(project);
    const history = pairs
      .map(p => {
        const parts = [];
        if (p.user_text) parts.push(`User: ${p.user_text}`);
        if (p.ai_text) parts.push(`Assistant: ${p.ai_text}`);
        return parts.join('\n');
      })
      .join('\n');
    const searchModel = db.getSetting("ai_chatsearch_model") || "openai/gpt-4o";
    const openaiClient = getOpenAiClient(searchModel);
    function stripModelPrefix(m) {
      if (!m) return "gpt-4o";
      if (m.startsWith("openai/")) return m.substring("openai/".length);
      if (m.startsWith("openrouter/")) return m.substring("openrouter/".length);
      if (m.startsWith("deepseek/")) return m.substring("deepseek/".length);
      return m;
    }
    const modelForOpenAI = stripModelPrefix(searchModel);
    const prompt = `Search the following project chat history for "${query}" and provide a concise bullet list of results.\n\n${history}`;
    const completion = await callOpenAiModel(openaiClient, modelForOpenAI, {
      messages: [{ role: "user", content: prompt }],
      max_tokens: 256,
      temperature: 0.2
    });
    const text =
      completion.choices?.[0]?.message?.content?.trim() ||
      completion.choices?.[0]?.text?.trim() || "";
    res.json({ result: text });
  } catch (err) {
    console.error("[AlfeChat] /api/projectSearch error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/createSterlingChat", async (req, res) => {
  db.logActivity("Create Sterling Chat", "User triggered createSterlingChat endpoint.");

  try {
    if (!sterlingApiBaseUrl || !sterlingBaseUrl) {
      console.error("[Sterling] STERLING_BASE_URL is not configured; cannot create Sterling chat.");
      return res.status(500).json({
        success: false,
        error: "STERLING_BASE_URL is not configured."
      });
    }
    const project = db.getSetting("sterling_project") || "alfe-dev_test_repo";
    const projectName = "aurora_working-" + project;

    console.log('=== Testing createChat endpoint ===');
    const createChatResponse = await axios.post(`${sterlingApiBaseUrl}/createChat`, {
      repoName: projectName
    });
    console.log('Response from /createChat:', createChatResponse.data);

    const allBranches = db.listProjectBranches();
    const foundBranchObj = allBranches.find(x => x.project === project);
    let sterlingBranch = foundBranchObj ? foundBranchObj.base_branch : "";
    if (!sterlingBranch) {
      sterlingBranch = "main";
    }
    console.log(`[Sterling Branch Fix] Setting branch to: ${sterlingBranch}`);

    try {
      const changeBranchResp = await axios.post(
        `${sterlingApiBaseUrl}/changeBranchOfChat/${encodeURIComponent(projectName)}/${createChatResponse.data.newChatNumber}`,
        {
          createNew: false,
          branchName: sterlingBranch
        }
      );
      console.log('Response from /changeBranchOfChat:', changeBranchResp.data);
    } catch (branchErr) {
      console.error("[Sterling Branch Fix] Error calling /changeBranchOfChat =>", branchErr.message);
    }

    console.log('=== Test run completed. ===');

    const sterlingUrl = `${sterlingBaseUrl}/${encodeURIComponent(projectName)}/chat/${createChatResponse.data.newChatNumber}`;
    db.setSetting("sterling_chat_url", sterlingUrl);

    res.json({
      success: true,
      message: "Sterling chat created.",
      repoName: projectName,
      newChatNumber: createChatResponse.data.newChatNumber,
      sterlingUrl
    });
  } catch (error) {
    console.error('Error during API tests:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/projects/rename", (req, res) => {
  console.debug("[Server Debug] POST /api/projects/rename =>", req.body);
  try {
    const { oldProject, newProject } = req.body;
    if (!oldProject || !newProject) {
      return res.status(400).json({ error: "Missing oldProject or newProject" });
    }
    db.renameProject(oldProject, newProject);
    db.logActivity("Rename project", JSON.stringify({ oldProject, newProject }));
    res.json({ success: true });
  } catch (err) {
    console.error("[AlfeChat] /api/projects/rename error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/projects/archive", (req, res) => {
  console.debug("[Server Debug] POST /api/projects/archive =>", req.body);
  try {
    const { project, archived = true } = req.body;
    if (!project) {
      return res.status(400).json({ error: "Missing project" });
    }
    db.setProjectArchived(project, archived ? 1 : 0);
    db.setProjectHidden(project, archived ? 1 : 0);
    db.logActivity("Archive project", JSON.stringify({ project, archived }));
    res.json({ success: true });
  } catch (err) {
    console.error("[AlfeChat] /api/projects/archive error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/ai/favorites", async (req, res) => {
  try {
    const sessionId = getSessionIdFromRequest(req);
    const account = sessionId ? await db.getAccountBySession(sessionId) : null;
    if (!account) {
      return res.status(401).json({ error: "not logged in" });
    }

    const { modelId, favorite } = req.body;
    if (!modelId || typeof favorite !== "boolean") {
      return res.status(400).json({ error: "Missing modelId or favorite boolean" });
    }
    const favoritesSetting = db.getSetting("favorite_ai_models");
    let favList = Array.isArray(favoritesSetting)
      ? favoritesSetting
      : favoritesSetting
          ? [favoritesSetting]
          : [];
    const index = favList.indexOf(modelId);

    if (favorite) {
      if (index < 0) {
        favList.push(modelId);
      }
    } else {
      if (index >= 0) {
        favList.splice(index, 1);
      }
    }

    db.setSetting("favorite_ai_models", favList);
    // Invalidate cached AI model list so favorites refresh immediately
    aiModelsCache = null;
    aiModelsCacheTs = 0;
    res.json({ success: true, favorites: favList });
  } catch (err) {
    console.error("Error in /api/ai/favorites:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

const mdFilePath = path.join(__dirname, "../markdown_global.txt");

function ensureTaskListRepoCloned(gitUrl) {
  if (!gitUrl) return null;
  const homeDir = os.homedir();
  const alfeDir = path.join(homeDir, ".alfeai");
  if (!fs.existsSync(alfeDir)) {
    fs.mkdirSync(alfeDir, { recursive: true });
  }
  const repoDir = path.join(alfeDir, "tasklistRepo");

  try {
    if (!fs.existsSync(repoDir)) {
      console.log("[Git Debug] Cloning new repo =>", gitUrl, "into =>", repoDir);
      child_process.execSync(`git clone "${gitUrl}" "${repoDir}"`, {
        stdio: "inherit"
      });
    } else {
      console.log("[Git Debug] Pulling latest in =>", repoDir);
      child_process.execSync(`git pull`, {
        cwd: repoDir,
        stdio: "inherit"
      });
    }
    return repoDir;
  } catch (err) {
    console.error("[Git Error] Could not clone/pull repo =>", err);
    return null;
  }
}

function commitAndPushMarkdown(repoDir) {
  try {
    const mgPath = path.join(repoDir, "markdown_global.txt");
    child_process.execSync(`git add markdown_global.txt`, {
      cwd: repoDir
    });
    child_process.execSync(`git commit -m "Update markdown_global.txt"`, {
      cwd: repoDir
    });
    child_process.execSync(`git push`, {
      cwd: repoDir,
      stdio: "inherit"
    });
  } catch (err) {
    const msg = String(err.message || "");
    if (msg.includes("nothing to commit, working tree clean")) {
      console.log("[Git Debug] Nothing to commit. Working tree is clean.");
    } else {
      console.error("[Git Error] commitAndPushMarkdown =>", err);
    }
  }
}

app.get("/api/version", (req, res) => {
  try {
    const version = "beta-3.0.2";
    res.json({ version });
  } catch (err) {
    console.error("[Server Debug] GET /api/version =>", err);
    res.status(500).json({ error: "Unable to determine version" });
  }
});

app.get("/api/git-sha", (req, res) => {
  try {
    const sha = child_process
      .execSync("git rev-parse HEAD", {
        cwd: path.join(__dirname, ".."),
      })
      .toString()
      .trim();
    const timestamp = child_process
      .execSync("git log -1 --format=%cI HEAD", {
        cwd: path.join(__dirname, ".."),
      })
      .toString()
      .trim();
    res.json({ sha, timestamp });
  } catch (err) {
    console.error("[Server Debug] GET /api/git-sha =>", err);
    res.status(500).json({ error: "Unable to determine git SHA" });
  }
});

app.get("/api/tasklist/repo-path", (req, res) => {
  try {
    const gitUrl = db.getSetting("taskList_git_ssh_url");
    if (!gitUrl) {
      return res.json({ path: null });
    }
    const repoDir = ensureTaskListRepoCloned(gitUrl);
    res.json({ path: repoDir });
  } catch (err) {
    console.error("Error in /api/tasklist/repo-path:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/markdown", (req, res) => {
  try {
    if (fs.existsSync(mdFilePath)) {
      const data = fs.readFileSync(mdFilePath, "utf-8");
      res.json({ content: data });
    } else {
      res.json({ content: "" });
    }
  } catch (err) {
    console.error("Error reading markdown_global.txt:", err);
    res.status(500).json({ error: "Unable to read markdown file." });
  }
});

app.post("/api/markdown", (req, res) => {
  try {
    const { content } = req.body;
    fs.writeFileSync(mdFilePath, content || "", "utf-8");

    const gitUrl = db.getSetting("taskList_git_ssh_url");
    if (gitUrl) {
      const repoDir = ensureTaskListRepoCloned(gitUrl);
      if (repoDir) {
        const targetPath = path.join(repoDir, "markdown_global.txt");
        fs.copyFileSync(mdFilePath, targetPath);
        commitAndPushMarkdown(repoDir);
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Error writing markdown_global.txt:", err);
    res.status(500).json({ error: "Unable to write markdown file." });
  }
});

// Simple placeholder endpoint for virtual file cabinet
app.get('/api/cabinet', (req, res) => {
  try {
    const data = db.getSetting('file_cabinet_items');
    const items = Array.isArray(data) ? data : [];
    res.json({ items });
  } catch (err) {
    console.error('Error in /api/cabinet:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/mosaic/save', (req, res) => {
  try {
    const { filename, content } = req.body || {};
    if (!filename) {
      return res.status(400).json({ error: 'Missing filename' });
    }
    const safe = filename.replace(/[^\w./-]/g, '').replace(/^\//, '');
    if (safe.startsWith('.git/')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    const full = path.join(mosaicDir, safe);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content || '', 'utf-8');
    res.json({ success: true });
  } catch (err) {
    console.error('Error in /api/mosaic/save:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/mosaic/list', (req, res) => {
  try {
    function walk(dir, base = '') {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      let files = [];
      for (const ent of entries) {
        const rel = path.join(base, ent.name);
        if (rel.startsWith('.git')) {
          continue;
        }
        if (ent.isDirectory()) {
          files = files.concat(walk(path.join(dir, ent.name), rel));
        } else {
          files.push(rel);
        }
      }
      return files;
    }
    const files = fs.existsSync(mosaicDir) ? walk(mosaicDir) : [];
    res.json({ files });
  } catch (err) {
    console.error('Error in /api/mosaic/list:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/mosaic/get', (req, res) => {
  try {
    const file = (req.query.file || '').replace(/[^\w./-]/g, '').replace(/^\//, '');
    if (!file) {
      return res.status(400).json({ error: 'Missing file' });
    }
    if (file.startsWith('.git/')) {
      return res.status(404).json({ error: 'Not found' });
    }
    const full = path.join(mosaicDir, file);
    if (!fs.existsSync(full)) {
      return res.status(404).json({ error: 'Not found' });
    }
    const content = fs.readFileSync(full, 'utf-8');
    res.json({ content });
  } catch (err) {
    console.error('Error in /api/mosaic/get:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/mosaic/git-init', (req, res) => {
  try {
    fs.mkdirSync(mosaicDir, { recursive: true });
    const gitDir = path.join(mosaicDir, '.git');
    if (fs.existsSync(gitDir)) {
      return res.json({ success: true, already: true });
    }
    child_process.execSync('git init', { cwd: mosaicDir });
    res.json({ success: true, already: false });
  } catch (err) {
    console.error('Error in /api/mosaic/git-init:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/mosaic/path', (req, res) => {
  try {
    res.json({ path: mosaicDir });
  } catch (err) {
    console.error('Error in /api/mosaic/path:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ------------------------------------------------------------------
// Amazon Shipping API demo endpoint
// ------------------------------------------------------------------
let SellingPartner = null;
try {
  const mod = await import('amazon-sp-api');
  SellingPartner = mod.default || mod;
} catch (err) {
  console.warn('[Server Debug] amazon-sp-api not installed =>', err.message);
}

app.post('/api/amazon/createShipment', async (req, res) => {
  const { shipmentRequest } = req.body || {};
  if (!shipmentRequest) {
    return res.status(400).json({ error: 'Missing shipmentRequest' });
  }

  if (!SellingPartner) {
    console.debug(
      '[Server Debug] Received createShipment request =>',
      JSON.stringify(shipmentRequest)
    );
    return res.json({
      success: true,
      message: 'amazon-sp-api not installed; request logged only'
    });
  }

  try {
    const spOptions = {
      region: process.env.AMAZON_REGION || 'na',
      credentials: {
        SELLING_PARTNER_APP_CLIENT_ID: process.env.AMAZON_CLIENT_ID,
        SELLING_PARTNER_APP_CLIENT_SECRET: process.env.AMAZON_CLIENT_SECRET,
        AWS_ACCESS_KEY_ID: process.env.AMAZON_AWS_ACCESS_KEY_ID,
        AWS_SECRET_ACCESS_KEY: process.env.AMAZON_AWS_SECRET_ACCESS_KEY,
        AWS_SELLING_PARTNER_ROLE: process.env.AMAZON_SELLING_PARTNER_ROLE
      }
    };
    if (process.env.AMAZON_REFRESH_TOKEN) {
      spOptions.refresh_token = process.env.AMAZON_REFRESH_TOKEN;
    } else {
      spOptions.only_grantless_operations = true;
    }
    const sp = new SellingPartner(spOptions);
    const data = await sp.callAPI({
      operation: 'createShipment',
      endpoint: 'shipping',
      body: shipmentRequest
    });
    res.json({ success: true, data });
  } catch (err) {
    console.error('Error in /api/amazon/createShipment:', err);
    res.status(500).json({ error: 'Failed to create shipment' });
  }
});

app.get('/api/amazon/skus', async (req, res) => {
  const { sellerId, marketplaceId } = req.query || {};
  if (!sellerId || !marketplaceId) {
    return res.status(400).json({ error: 'Missing sellerId or marketplaceId' });
  }

  if (!SellingPartner) {
    console.debug(
      `[Server Debug] Received get SKUs request => sellerId=${sellerId}, marketplaceId=${marketplaceId}`
    );
    return res
      .status(500)
      .json({ error: 'amazon-sp-api not installed on server' });
  }

  try {
    const spOptions = {
      region: process.env.AMAZON_REGION || 'na',
      credentials: {
        SELLING_PARTNER_APP_CLIENT_ID: process.env.AMAZON_CLIENT_ID,
        SELLING_PARTNER_APP_CLIENT_SECRET: process.env.AMAZON_CLIENT_SECRET,
        AWS_ACCESS_KEY_ID: process.env.AMAZON_AWS_ACCESS_KEY_ID,
        AWS_SECRET_ACCESS_KEY: process.env.AMAZON_AWS_SECRET_ACCESS_KEY,
        AWS_SELLING_PARTNER_ROLE: process.env.AMAZON_SELLING_PARTNER_ROLE
      }
    };
    if (process.env.AMAZON_REFRESH_TOKEN) {
      spOptions.refresh_token = process.env.AMAZON_REFRESH_TOKEN;
    } else {
      spOptions.only_grantless_operations = true;
    }
    const sp = new SellingPartner(spOptions);
    console.debug('[Server Debug] Using marketplaceIds =>', [marketplaceId]);
    const result = await sp.callAPI({
      operation: 'listCatalogItems',
      endpoint: 'catalogItems',
      query: {
        MarketplaceId: marketplaceId,
        SellerId: sellerId
      }
    });
    const skus = Array.isArray(result?.Items)
      ? result.Items.map(i =>
          i.SKU || i.sku || i.SellerSKU || i.sellerSku
        ).filter(Boolean)
      : [];
    res.json({ success: true, skus, raw: result });
  } catch (err) {
    console.error('Error in /api/amazon/skus:', err);
    res.status(500).json({ error: 'Failed to fetch SKUs' });
  }
});

app.post('/api/amazon/updatePrepInfo', async (req, res) => {
  const { sellerId, marketplaceId, sku } = req.body || {};
  if (!sellerId || !marketplaceId || !sku) {
    return res
      .status(400)
      .json({ error: 'Missing sellerId, marketplaceId or sku' });
  }

  if (!SellingPartner) {
    console.debug(
      `[Server Debug] Received updatePrepInfo request => sellerId=${sellerId}, marketplaceId=${marketplaceId}, sku=${sku}`
    );
    return res.json({
      success: true,
      message: 'amazon-sp-api not installed; request logged only'
    });
  }

  try {
    const spOptions = {
      region: process.env.AMAZON_REGION || 'na',
      credentials: {
        SELLING_PARTNER_APP_CLIENT_ID: process.env.AMAZON_CLIENT_ID,
        SELLING_PARTNER_APP_CLIENT_SECRET: process.env.AMAZON_CLIENT_SECRET,
        AWS_ACCESS_KEY_ID: process.env.AMAZON_AWS_ACCESS_KEY_ID,
        AWS_SECRET_ACCESS_KEY: process.env.AMAZON_AWS_SECRET_ACCESS_KEY,
        AWS_SELLING_PARTNER_ROLE: process.env.AMAZON_SELLING_PARTNER_ROLE
      }
    };
    if (process.env.AMAZON_REFRESH_TOKEN) {
      spOptions.refresh_token = process.env.AMAZON_REFRESH_TOKEN;
    } else {
      spOptions.only_grantless_operations = true;
    }
    const sp = new SellingPartner(spOptions);
    const result = await sp.callAPI({
      operation: 'setPrepDetails',
      endpoint: 'fulfillmentInbound',
      apiVersion: '2024-03-20',
      path: { sellerId },
      body: {
        marketplaceId,
        mskuPrepDetails: [
          {
            msku: sku,
            prepCategory: 'NONE',
            prepDetails: [
              {
                prepInstruction: 'NoPrep',
                prepOwner: 'SELLER'
              }
            ]
          }
        ]
      }
    });
    res.json({
      success: true,
      message: 'Prep info updated successfully',
      result
    });
  } catch (err) {
    console.error('Error in /api/amazon/updatePrepInfo:', err);
    res.status(500).json({ error: 'Failed to update prep info' });
  }
});

function parseAmazonSkuText(text = '') {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const items = [];
  let current = {};
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^product image$/i.test(line)) {
      current.title = lines[i + 1] || '';
      i++;
    } else if (/^ASIN$/i.test(line)) {
      current.asin = lines[i + 1] || '';
      i++;
    } else if (/^SKU$/i.test(line)) {
      current.sku = lines[i + 1] || '';
      i++;
      if (current.asin && current.sku) {
        items.push({ ...current });
        current = {};
      }
    }
  }
  return items;
}

app.post('/api/local_skus/import', (req, res) => {
  try {
    const { text = '' } = req.body || {};
    const items = parseAmazonSkuText(text);
    db.insertAmazonSkus(items);
    res.json({ success: true, count: items.length });
  } catch (err) {
    console.error('Error in /api/local_skus/import:', err);
    res.status(500).json({ error: 'Failed to import SKUs' });
  }
});

app.get('/api/local_skus', (req, res) => {
  try {
    const skus = db.listAmazonSkus();
    res.json({ success: true, skus });
  } catch (err) {
    console.error('Error in /api/local_skus:', err);
    res.status(500).json({ error: 'Failed to load SKUs' });
  }
});

const DEFAULT_PORT = Math.floor(Math.random() * (65535 - 49152 + 1)) + 49152;
const PORT =
  process.env.AURORA_PORT ||
  process.env.PORT ||
  DEFAULT_PORT;
// Ensure other modules can read the chosen port
process.env.AURORA_PORT = String(PORT);
const keyPath = process.env.HTTPS_KEY_PATH;
const certPath = process.env.HTTPS_CERT_PATH;

console.log('keyPath: ', keyPath);
console.log('certPath: ', certPath);

if (keyPath && certPath && fs.existsSync(keyPath) && fs.existsSync(certPath)) {
  const options = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath)
  };
  https.createServer(options, app).listen(PORT, () => {
    console.log(`[AlfeChat] HTTPS server running on port ${PORT} (url=https://localhost:${PORT})`);
  });
} else {
  app.listen(PORT, () => {
    console.log(`[AlfeChat] Web server is running on port ${PORT} (verbose='true', url=http://localhost:${PORT})`);
  });
}
