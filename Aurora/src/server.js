import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import https from "https";
import GitHubClient from "./githubClient.js";
import TaskQueue from "./taskQueue.js";
import TaskDBLocal from "./taskDb.js";
import TaskDBAws from "./taskDbAws.js";

const useRds = process.env.AWS_DB_URL || process.env.AWS_DB_HOST;
const TaskDB = useRds ? TaskDBAws : TaskDBLocal;
import { pbkdf2Sync, randomBytes } from "crypto";
import speakeasy from "speakeasy";

dotenv.config();

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

/**
 * Create a timestamped backup of issues.sqlite (if it exists).
 */
function backupDb() {
  if (useRds) return; // RDS is managed separately
  const dbPath = path.resolve("issues.sqlite");
  if (!fs.existsSync(dbPath)) {
    console.log("[TaskQueue] No existing DB to backup (first run).");
    return;
  }

  const backupsDir = path.resolve("backups");
  fs.mkdirSync(backupsDir, { recursive: true });

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupsDir, `issues-${ts}.sqlite`);

  fs.copyFileSync(dbPath, backupPath);
  console.log(`[TaskQueue] Backup created: ${backupPath}`);
}

async function main() {
  try {
    // ------------------------------------------------------------------
    // 0. Safety first – create backup
    // ------------------------------------------------------------------
    backupDb();

    const client = new GitHubClient({
      token: process.env.GITHUB_TOKEN,
      owner: process.env.GITHUB_OWNER,
      repo: process.env.GITHUB_REPO
    });

    const db = new TaskDB(); // uses AWS RDS when AWS_DB_URL or AWS_DB_HOST is set
    const queue = new TaskQueue();

    const label = process.env.GITHUB_LABEL;
    console.log(
      `[TaskQueue] Fetching tasks from GitHub ${
        label ? `(label='${label}')` : "(all open issues)"
      } …`
    );

    //const issues = client.fetchOpenIssues(label?.trim() || undefined);
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

    console.log(`[TaskQueue] ${queue.size()} task(s) in queue.`);
    // Intentionally omit printing the full issue list to keep logs concise

    // Debug: show DB snapshot (can be removed)
    // console.debug("[TaskQueue] Current DB state:", db.dump());
  } catch (err) {
    console.error("Fatal:", err.message);
    process.exit(1);
  }
}

main();

import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import multer from "multer";
import { fileURLToPath } from "url";
import OpenAI from "openai";
import { encoding_for_model } from "tiktoken";
import axios from "axios";
import os from "os";
import child_process from "child_process";
import JobManager from "./jobManager.js";
import PrintifyJobQueue from "./printifyJobQueue.js";
import { extractProductUrl, extractPrintifyUrl, extractUpdatedTitle } from "./printifyUtils.js";

const db = new TaskDB();
console.debug("[Server Debug] Checking or setting default 'ai_model' in DB...");
const currentModel = db.getSetting("ai_model");
if (!currentModel) {
  console.debug("[Server Debug] 'ai_model' is missing in DB, setting default to 'deepseek/deepseek-chat'.");
  db.setSetting("ai_model", "deepseek/deepseek-chat");
} else {
  console.debug("[Server Debug] 'ai_model' found =>", currentModel);
}

console.debug("[Server Debug] Checking or setting default 'ai_service' in DB...");
if (!db.getSetting("ai_service")) {
  db.setSetting("ai_service", "openrouter");
}

// Theme setting for Nexum UI
console.debug("[Server Debug] Checking or setting default theme settings in DB...");
let themeColor = db.getSetting("nexum_theme_color");
let themeMode = db.getSetting("nexum_theme_mode");
const legacyTheme = db.getSetting("nexum_theme");
if (!themeColor) {
  console.debug("[Server Debug] 'nexum_theme_color' is missing in DB, setting default to", legacyTheme || 'purple');
  db.setSetting("nexum_theme_color", legacyTheme || "purple");
  themeColor = legacyTheme || "purple";
}
if (!themeMode) {
  console.debug("[Server Debug] 'nexum_theme_mode' is missing in DB, setting default to 'dark'.");
  db.setSetting("nexum_theme_mode", "dark");
  themeMode = "dark";
}
console.debug("[Server Debug] theme_color =>", themeColor, "mode =>", themeMode);

console.debug("[Server Debug] Checking or setting default 'image_gen_service' in DB...");
if (!db.getSetting("image_gen_service")) {
  db.setSetting("image_gen_service", "openai");
}

console.debug("[Server Debug] Checking or setting default 'image_upload_enabled' in DB...");
if (db.getSetting("image_upload_enabled") === undefined) {
  db.setSetting("image_upload_enabled", true);
}

console.debug("[Server Debug] Checking or setting default 'show_session_id' in DB...");
if (db.getSetting("show_session_id") === undefined) {
  db.setSetting("show_session_id", false);
}

const app = express();
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
function getOpenAiClient() {
  let service = db.getSetting("ai_service") || "openrouter";
  const currentModel = db.getSetting("ai_model") || "";
  const { provider } = parseProviderModel(currentModel);

  if (provider === "openrouter") {
    service = "openrouter";
  }

  const openAiKey = process.env.OPENAI_API_KEY || "";
  const openRouterKey = process.env.OPENROUTER_API_KEY || "";

  console.debug("[Server Debug] Creating OpenAI client with service =", service);

  if (service === "openrouter") {
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
        "HTTP-Referer": "https://my-awesome-app.example.com"
      }
    });
  } else {
    if (!openAiKey) {
      throw new Error(
        "Missing OPENAI_API_KEY environment variable, please set it before using OpenAI."
      );
    }
    // Default to openai
    console.debug("[Server Debug] Using openai with provided OPENAI_API_KEY.");
    return new OpenAI({
      apiKey: openAiKey
    });
  }
}

function parseProviderModel(model) {
  if (!model) return { provider: "Unknown", shortModel: "Unknown" };
  if (model.startsWith("openai/")) {
    return { provider: "openai", shortModel: model.replace(/^openai\//, "") };
  } else if (model.startsWith("openrouter/")) {
    return { provider: "openrouter", shortModel: model.replace(/^openrouter\//, "") };
  } else if (model.startsWith("deepseek/")) {
    return { provider: "openrouter", shortModel: model.replace(/^deepseek\//, "") };
  }
  return { provider: "Unknown", shortModel: model };
}

function getEncoding(modelName) {
  console.debug("[Server Debug] Attempting to load tokenizer for model =>", modelName);
  try {
    return encoding_for_model(modelName);
  } catch (e) {
    console.debug("[Server Debug] Tokenizer load failed, falling back to gpt-4.1-mini =>", e.message);
    return encoding_for_model("gpt-4.1-mini");
  }
}

function countTokens(encoder, text) {
  return encoder.encode(text || "").length;
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
  const limit = parseInt(req.query.limit || '10', 10);
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

  const openAiClient = client || getOpenAiClient();
  const storedModel = db.getSetting('ai_model') || 'deepseek/deepseek-chat';
  function stripModelPrefix(m) {
    if (!m) return 'deepseek/deepseek-chat';
    if (m.startsWith('openai/')) return m.substring('openai/'.length);
    if (m.startsWith('openrouter/')) return m.substring('openrouter/'.length);
    if (m.startsWith('deepseek/')) return m.substring('deepseek/'.length);
    return m;
  }
  const modelForOpenAI = stripModelPrefix(storedModel);

  if (openAiClient) {
    try {
      const completion = await openAiClient.chat.completions.create({
        model: modelForOpenAI,
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
      const title = completion.choices?.[0]?.message?.content?.trim();
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

  const openAiClient = client || getOpenAiClient();
  const storedModel = db.getSetting('ai_model') || 'deepseek/deepseek-chat';
  function stripModelPrefix(m) {
    if (!m) return 'deepseek/deepseek-chat';
    if (m.startsWith('openai/')) return m.substring('openai/'.length);
    if (m.startsWith('openrouter/')) return m.substring('openrouter/'.length);
    if (m.startsWith('deepseek/')) return m.substring('deepseek/'.length);
    return m;
  }
  const modelForOpenAI = stripModelPrefix(storedModel);

  if (openAiClient) {
    try {
      const completion = await openAiClient.chat.completions.create({
        model: modelForOpenAI,
        messages: [
          { role: 'system', content: 'Create a short 3-6 word title summarizing the user message.' },
          { role: 'user', content: message }
        ],
        max_tokens: 16,
        temperature: 0.5
      });
      const title = completion.choices?.[0]?.message?.content?.trim();
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

async function generateInitialGreeting(type, client = null) {
  const openAiClient = getOpenAiClient();
  const storedModel = db.getSetting("ai_model") || 'deepseek/deepseek-chat';
  function stripModelPrefix(m) {
    if (!m) return 'deepseek/deepseek-chat';
    if (m.startsWith('openai/')) return m.substring('openai/'.length);
    if (m.startsWith('openrouter/')) return m.substring('openrouter/'.length);
    if (m.startsWith('deepseek/')) return m.substring('deepseek/'.length);
    return m;
  }
  const modelForOpenAI = stripModelPrefix(storedModel);

  let prompt = 'Write a brief friendly greeting as an AI assistant named Alfe. ';
  if (type === 'design') {
    prompt += 'Invite the user to share what they would like to create.';
  } else {
    prompt += 'Invite the user to share what they would like to talk about.';
  }

  if (openAiClient) {
    try {
      const completion = await openAiClient.chat.completions.create({
        model: modelForOpenAI,
        messages: [
          { role: 'user', content: prompt }
        ],
        max_tokens: 60,
        temperature: 0.7
      });
      const text = completion.choices?.[0]?.message?.content?.trim();
      if (text) return text;
    } catch (e) {
      console.debug('[Server Debug] Initial greeting generation failed =>', e.message);
    }
  }

  return type === 'design'
    ? 'Hello! I am Alfe, your AI assistant. What would you like to design today?'
    : 'Hello! I am Alfe, your AI assistant. What would you like to talk about?';
}

async function createInitialTabMessage(tabId, type, sessionId = '') {
  const greeting = await generateInitialGreeting(type);
  const pairId = db.createChatPair('', tabId, '', sessionId);
  const defaultModel = db.getSetting("ai_model") || 'deepseek/deepseek-chat';
  db.finalizeChatPair(pairId, greeting, defaultModel, new Date().toISOString(), null);
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
const whitelistIp = process.env.whitelist_ip || process.env.WHITELIST_IP;
if (whitelistIp) {
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

    const allowed =
      localIps.has(requestIp) ||
      requestIp === whitelistIp ||
      requestIp === `::ffff:${whitelistIp}`;
    if (allowed) {
      return next();
    }

    if (req.path === "/" || req.path === "/index.html") {
      return res.redirect("https://alfe.sh");
    }

    res.status(403).send("Forbidden");
  });
}

// Determine uploads directory
const __dirname = path.dirname(fileURLToPath(import.meta.url));
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

// Database calls and API routes

app.get("/api/tasks", (req, res) => {
  console.debug("[Server Debug] GET /api/tasks called.");
  try {
    const includeHidden =
      req.query.includeHidden === "1" ||
      req.query.includeHidden === "true";
    console.debug("[Server Debug] includeHidden =", includeHidden);
    const tasks = db.listTasks(includeHidden);
    console.debug("[Server Debug] Found tasks =>", tasks.length);
    res.json(tasks);
  } catch (err) {
    console.error("[TaskQueue] /api/tasks failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/projects", (req, res) => {
  console.debug("[Server Debug] GET /api/projects called.");
  try {
    const projects = db.listProjects();
    console.debug("[Server Debug] Found projects =>", projects.length);
    res.json(projects);
  } catch (err) {
    console.error("[TaskQueue] /api/projects failed:", err);
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
    console.error("[TaskQueue] /api/sprints failed:", err);
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
    console.error("[TaskQueue] GET /api/projectBranches error:", err);
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
    console.error("[TaskQueue] POST /api/projectBranches error:", err);
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
    console.error("[TaskQueue] DELETE /api/projectBranches/:project error:", err);
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
    console.error("[TaskQueue] /api/tasks/hidden failed:", err);
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
    console.error("[TaskQueue] /api/tasks/reorder failed:", err);
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
    console.error("[TaskQueue] /api/tasks/reorderAll failed:", err);
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
    console.error("[TaskQueue] /api/tasks/points failed:", err);
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
    console.error("[TaskQueue] /api/tasks/project failed:", err);
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
    console.error("[TaskQueue] /api/tasks/sprint failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/tasks/priority", (req, res) => {
  console.debug("[Server Debug] POST /api/tasks/priority => body:", req.body);
  try {
    const { id, priority } = req.body;
    const oldTask = db.getTaskById(id);
    const oldPriority = oldTask?.priority || null;

    db.setPriority(id, priority);

    db.logActivity(
      "Set priority",
      JSON.stringify({ id, from: oldPriority, to: priority })
    );

    res.json({ success: true });
  } catch (err) {
    console.error("[TaskQueue] /api/tasks/priority failed:", err);
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
    console.error("[TaskQueue] /api/tasks/status failed:", err);
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
    console.error("[TaskQueue] /api/tasks/dependencies failed:", err);
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
    console.error("[TaskQueue] /api/tasks/blocking failed:", err);
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

    const gh = new GitHubClient({
      token: process.env.GITHUB_TOKEN,
      owner: process.env.GITHUB_OWNER,
      repo: process.env.GITHUB_REPO
    });

    if (!gh.octokit) {
      console.debug(
        "[Server Debug] GitHub credentials missing; skipping issue creation."
      );
      return res
        .status(200)
        .json({ success: false, message: "GitHub not configured" });
    }

    const newIssue = await gh.createIssue(title, body || "");
    db.upsertIssue(newIssue, `${gh.owner}/${gh.repo}`);
    db.logActivity(
      "New task",
      JSON.stringify({ title, body, project: project || null })
    );

    const defaultProject = db.getSetting("default_project");
    const defaultSprint = db.getSetting("default_sprint");
    if (defaultProject) db.setProjectByGithubId(newIssue.id, defaultProject);
    if (defaultSprint) db.setSprintByGithubId(newIssue.id, defaultSprint);
    if (project) db.setProjectByGithubId(newIssue.id, project);

    res.json({ success: true, id: newIssue.id });
  } catch (err) {
    console.error("POST /api/tasks/new error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/settings", (req, res) => {
  console.debug("[Server Debug] GET /api/settings =>", req.query.keys);
  try {
    const keysParam = req.query.keys;
    let settings;
    if (keysParam) {
      const keys = Array.isArray(keysParam)
        ? keysParam
        : String(keysParam)
            .split(",")
            .map((k) => k.trim())
            .filter((k) => k);
      settings = keys.map((k) => ({ key: k, value: db.getSetting(k) }));
    } else {
      settings = db.allSettings();
    }
    res.json({ settings });
  } catch (err) {
    console.error("[TaskQueue] GET /api/settings failed", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/settings/:key", (req, res) => {
  console.debug("[Server Debug] GET /api/settings/:key =>", req.params.key);
  try {
    const val = db.getSetting(req.params.key);
    res.json({ key: req.params.key, value: val });
  } catch (err) {
    console.error("[TaskQueue] GET /api/settings/:key failed", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/settings", (req, res) => {
  console.debug("[Server Debug] POST /api/settings => body:", req.body);
  try {
    const { key, value } = req.body;
    db.setSetting(key, value);
    res.json({ success: true });
  } catch (err) {
    console.error("[TaskQueue] POST /api/settings failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/settings/batch", (req, res) => {
  console.debug("[Server Debug] POST /api/settings/batch => body:", req.body);
  try {
    const { settings } = req.body;
    if (!Array.isArray(settings)) {
      return res.status(400).json({ error: "settings array required" });
    }
    settings.forEach(({ key, value }) => {
      if (typeof key !== "undefined") {
        db.setSetting(key, value);
      }
    });
    res.json({ success: true });
  } catch (err) {
    console.error("[TaskQueue] POST /api/settings/batch failed:", err);
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
    console.error("[TaskQueue] GET /api/nodes failed:", err);
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
    console.error("[TaskQueue] POST /api/nodes failed:", err);
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
    console.error("[TaskQueue] POST /api/feedback failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/register", (req, res) => {
  console.debug("[Server Debug] POST /api/register =>", req.body);
  try {
    const { email, password } = req.body;
    const sessionId = req.body.sessionId || getSessionIdFromRequest(req);
    if (!email || !password) {
      return res.status(400).json({ error: "email and password required" });
    }
    if (db.getAccountByEmail(email)) {
      return res.status(400).json({ error: "account exists" });
    }
    const hash = hashPassword(password);
    const id = db.createAccount(email, hash, sessionId);
    res.json({ success: true, id });
  } catch (err) {
    console.error("[TaskQueue] POST /api/register failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/login", (req, res) => {
  console.debug("[Server Debug] POST /api/login =>", req.body);
  try {
    const { email, password, token } = req.body;
    let sessionId = req.body.sessionId || getSessionIdFromRequest(req);
    if (!email || !password) {
      return res.status(400).json({ error: "email and password required" });
    }
    const account = db.getAccountByEmail(email);
    if (!account || !verifyPassword(password, account.password_hash)) {
      return res.status(400).json({ error: "invalid credentials" });
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
      db.mergeSessions(account.session_id, sessionId);
      sessionId = account.session_id;
    }

    db.setAccountSession(account.id, sessionId);
    res.json({ success: true, id: account.id, email: account.email, sessionId });
  } catch (err) {
    console.error("[TaskQueue] POST /api/login failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/totp/generate", (req, res) => {
  const sessionId = getSessionIdFromRequest(req);
  const account = sessionId ? db.getAccountBySession(sessionId) : null;
  if (!account) return res.status(401).json({ error: "not logged in" });
  const secret = speakeasy.generateSecret({ name: "Aurora" });
  res.json({ secret: secret.base32, otpauth_url: secret.otpauth_url });
});

app.post("/api/totp/enable", (req, res) => {
  const sessionId = getSessionIdFromRequest(req);
  const account = sessionId ? db.getAccountBySession(sessionId) : null;
  if (!account) return res.status(401).json({ error: "not logged in" });
  const { secret, token } = req.body || {};
  if (!secret || !token) {
    return res.status(400).json({ error: "missing secret or token" });
  }
  const ok = speakeasy.totp.verify({ secret, encoding: 'base32', token, window: 1 });
  if (!ok) {
    return res.status(400).json({ error: "invalid token" });
  }
  db.setAccountTotpSecret(account.id, secret);
  res.json({ success: true });
});

app.get("/api/account", (req, res) => {
  console.debug("[Server Debug] GET /api/account");
  try {
    const sessionId = getSessionIdFromRequest(req);
    const account = sessionId ? db.getAccountBySession(sessionId) : null;
    if (!account) return res.json({ exists: false });
    res.json({
      exists: true,
      id: account.id,
      email: account.email,
      totpEnabled: !!account.totp_secret,
      timezone: account.timezone || ''
    });
  } catch(err) {
    console.error("[TaskQueue] GET /api/account failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/account/timezone", (req, res) => {
  const sessionId = getSessionIdFromRequest(req);
  const account = sessionId ? db.getAccountBySession(sessionId) : null;
  if (!account) return res.status(401).json({ error: "not logged in" });
  const { timezone } = req.body || {};
  if (typeof timezone !== 'string') {
    return res.status(400).json({ error: "timezone required" });
  }
  db.setAccountTimezone(account.id, timezone);
  res.json({ success: true });
});

app.post("/api/account/password", (req, res) => {
  const sessionId = getSessionIdFromRequest(req);
  const account = sessionId ? db.getAccountBySession(sessionId) : null;
  if (!account) return res.status(401).json({ error: "not logged in" });
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "current and new password required" });
  }
  if (!verifyPassword(currentPassword, account.password_hash)) {
    return res.status(400).json({ error: "incorrect password" });
  }
  const hash = hashPassword(newPassword);
  db.setAccountPassword(account.id, hash);
  res.json({ success: true });
});

app.post("/api/logout", (req, res) => {
  console.debug("[Server Debug] POST /api/logout");
  try {
    const sessionId = getSessionIdFromRequest(req);
    if (sessionId) {
      const account = db.getAccountBySession(sessionId);
      if (account) console.debug("[Server Debug] Keeping session", sessionId, "for account", account.id);
    }
    res.json({ success: true });
  } catch(err) {
    console.error("[TaskQueue] POST /api/logout failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/tasks/:id", (req, res) => {
  console.debug("[Server Debug] GET /api/tasks/:id =>", req.params.id);
  try {
    const taskId = parseInt(req.params.id, 10);
    if (Number.isNaN(taskId)) {
      return res.status(400).json({ error: "Invalid task ID" });
    }
    const t = db.getTaskById(taskId);
    if (!t) {
      return res.status(404).json({ error: "Task not found" });
    }
    res.json(t);
  } catch (err) {
    console.error("[TaskQueue] /api/tasks/:id failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/projects/:project", (req, res) => {
  console.debug("[Server Debug] GET /api/projects/:project =>", req.params.project);
  try {
    const tasks = db.listTasksByProject(req.params.project);
    res.json(tasks);
  } catch (err) {
    console.error("[TaskQueue] /api/projects/:project failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/sprints/:sprint", (req, res) => {
  console.debug("[Server Debug] GET /api/sprints/:sprint =>", req.params.sprint);
  try {
    const tasks = db.listTasksBySprint(req.params.sprint);
    res.json(tasks);
  } catch (err) {
    console.error("[TaskQueue] /api/sprints/:sprint failed:", err);
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
    const task = db.getTaskById(id);
    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    const gh = new GitHubClient({
      token: process.env.GITHUB_TOKEN,
      owner: process.env.GITHUB_OWNER,
      repo: process.env.GITHUB_REPO
    });
    await gh.updateIssueTitle(task.number, newTitle);

    db.setTitle(id, newTitle);
    db.logActivity("Rename task", JSON.stringify({ id, newTitle }));

    res.json({ success: true });
  } catch (err) {
    console.error("[TaskQueue] /api/tasks/rename error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/activity", (req, res) => {
  console.debug("[Server Debug] GET /api/activity called.");
  try {
    const activity = db.getActivity();
    res.json(activity);
  } catch (err) {
    console.error("[TaskQueue] /api/activity failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/ai/models", async (req, res) => {
  console.debug("[Server Debug] GET /api/ai/models called.");

  const knownTokenLimits = {
    "openai/gpt-4o-mini": 128000,
    "openai/gpt-4.1": 1047576,
    "openai/gpt-4.1-mini": 1047576,
    "openai/gpt-4.1-nano": 1047576,
    "openai/o4-mini": 200000,
    "openai/gpt-4o": 128000,
    "openai/gpt-4o-2024-11-20": 128000,
    "openai/o4-mini-high": 200000,
    "openai/gpt-4o-mini-2024-07-18": 128000,
    "openai/o3-mini": 200000,
    "openai/chatgpt-4o-latest": 128000,
    "openai/gpt-4o-2024-08-06": 128000,
    "openai/o3": 200000,
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

  const knownCosts = {
    "openai/gpt-4o-mini": { input: "$0.15", output: "$0.60" },
    "openai/gpt-4.1": { input: "$2", output: "$8" },
    "openai/gpt-4.1-mini": { input: "$0.40", output: "$1.60" },
    "openai/gpt-4.1-nano": { input: "$0.10", output: "$0.40" },
    "openai/o4-mini": { input: "$1.10", output: "$4.40" },
    "openai/gpt-4o": { input: "$2.50", output: "$10" },
    "openai/gpt-4o-2024-11-20": { input: "$2.50", output: "$10" },
    "openai/o4-mini-high": { input: "$1.10", output: "$4.40" },
    "openai/gpt-4o-mini-2024-07-18": { input: "$0.15", output: "$0.60" },
    "openai/o3-mini": { input: "$1.10", output: "$4.40" },
    "openai/chatgpt-4o-latest": { input: "$5", output: "$15" },
    "openai/gpt-4o-2024-08-06": { input: "$2.50", output: "$10" },
    "openai/o3": { input: "$10", output: "$40" },
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
        console.error("[TaskQueue] Error listing OpenAI models:", err);
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
          return {
            id: combinedId,
            provider: "openrouter",
            tokenLimit: "N/A",
            inputCost: "N/A",
            outputCost: "N/A"
          };
        });
      } catch (err) {
        console.error("[TaskQueue] Error fetching OpenRouter models:", err);
      }
    }
  } catch (err) {
    console.error("[TaskQueue] /api/ai/models error:", err);
  }

  const deepseekModelData = [
    {
      id: "deepseek/deepseek-chat-v3-0324:free",
      provider: "deepseek",
      tokenLimit: 163840,
      inputCost: "$0",
      outputCost: "$0"
    },
    {
      id: "deepseek/deepseek-chat-v3-0324",
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

  const favorites = db.getSetting("favorite_ai_models") || [];
  for (const m of combinedModels) {
    m.favorite = favorites.includes(m.id);
  }

  res.json({ models: combinedModels });
});

app.post("/api/chat", async (req, res) => {
  console.debug("[Server Debug] POST /api/chat => body:", req.body);
  try {
    const userMessage = req.body.message || "";
    const chatTabId = req.body.tabId || 1;
    const sessionId = req.body.sessionId || "";
    const tabInfo = db.getChatTab(chatTabId, sessionId || null);
    if (!tabInfo) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const userTime = req.body.userTime || new Date().toISOString();

    if (!userMessage) {
      return res.status(400).send("Missing message");
    }

    const priorPairsAll = db.getAllChatPairs(chatTabId);
    const isFirstMessage = !db.hasUserMessages(chatTabId);
    let model = db.getSetting("ai_model");
    const savedInstructions = db.getSetting("agent_instructions") || "";

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

    const { provider } = parseProviderModel(model || "deepseek/deepseek-chat");
    const systemContext = `System Context:\n${savedInstructions}\n\nModel: ${model} (provider: ${provider})\nUserTime: ${userTime}\nTimeZone: Central`;

    const conversation = [{ role: "system", content: systemContext }];

    for (const p of priorPairsAll) {
      conversation.push({ role: "user", content: p.user_text });
      if (p.ai_text) {
        conversation.push({ role: "assistant", content: p.ai_text });
      }
    }

    const chatPairId = db.createChatPair(userMessage, chatTabId, systemContext, sessionId);
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

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");

    console.debug("[Server Debug] Chat conversation assembled with length =>", conversation.length);

    const openaiClient = getOpenAiClient();
    if (!model) {
      model = "unknown";
    }

    function stripModelPrefix(m) {
      if (!m) return "deepseek/deepseek-chat";
      if (m.startsWith("openai/")) return m.substring("openai/".length);
      if (m.startsWith("openrouter/")) return m.substring("openrouter/".length);
      return m;
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

    if (useStreaming) {
      const stream = await openaiClient.chat.completions.create({
        model: modelForOpenAI,
        messages: truncatedConversation,
        stream: true
      });

      console.debug("[Server Debug] AI streaming started...");

      for await (const part of stream) {
        const chunk = part.choices?.[0]?.delta?.content || "";
        if (chunk.includes("[DONE]")) {
          break;
        }
        assistantMessage += chunk;
        res.write(chunk);
      }
      res.end();
      console.debug("[Server Debug] AI streaming finished, total length =>", assistantMessage.length);

    } else {
      const completion = await openaiClient.chat.completions.create({
        model: modelForOpenAI,
        messages: truncatedConversation
      });
      assistantMessage = completion.choices?.[0]?.message?.content || "";
      res.write(assistantMessage);
      res.end();
      console.debug("[Server Debug] AI non-streaming completed, length =>", assistantMessage.length);
    }

    let requestEndTime = Date.now();
    let diffMs = requestEndTime - requestStartTime;
    let responseTime = Math.ceil(diffMs * 0.01) / 100;

    const systemTokens = countTokens(encoder, systemContext);
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
      historyTokens,
      inputTokens,
      assistantTokens: prevAssistantTokens,
      finalAssistantTokens,
      total,
      responseTime
    };

    db.finalizeChatPair(chatPairId, assistantMessage, model, new Date().toISOString(), JSON.stringify(tokenInfo));
    db.logActivity("AI chat", JSON.stringify({ tabId: chatTabId, response: assistantMessage, tokenInfo }));
  } catch (err) {
    console.error("[Server Debug] /api/chat error:", err);
    if (!res.headersSent) {
      res.status(500).send("Internal server error");
    }
  }
});

app.get("/api/chat/history", (req, res) => {
  console.debug("[Server Debug] GET /api/chat/history =>", req.query);
  try {
    const tabId = parseInt(req.query.tabId || "1", 10);
    const sessionId = req.query.sessionId || "";
    const limit = parseInt(req.query.limit || "10", 10);
    const offset = parseInt(req.query.offset || "0", 10);

    const tabInfo = db.getChatTab(tabId, sessionId || null);
    if (!tabInfo) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const pairsDesc = db.getChatPairsPage(tabId, limit, offset);
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
    console.error("[TaskQueue] /api/chat/history error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/model", (req, res) => {
  console.debug("[Server Debug] GET /api/model called.");
  let m = db.getSetting("ai_model");
  console.debug(`[Server Debug] DB returned ai_model => ${m}`);
  res.json({ model: m });
});

app.get("/api/chat/tabs", (req, res) => {
  const nexumParam = req.query.nexum;
  const showArchivedParam = req.query.showArchived;
  const sessionId = req.query.sessionId || "";
  console.debug(
    `[Server Debug] GET /api/chat/tabs => listing tabs (nexum=${nexumParam}, showArchived=${showArchivedParam}, sessionId=${sessionId})`
  );
  try {
    let tabs;
    const includeArchived = showArchivedParam === "1" || showArchivedParam === "true";
    if (nexumParam === undefined) {
      tabs = db.listChatTabs(null, includeArchived, sessionId);
    } else {
      const flag = parseInt(nexumParam, 10);
      tabs = db.listChatTabs(flag ? 1 : 0, includeArchived, sessionId);
    }
    res.json(tabs);
  } catch (err) {
    console.error("[TaskQueue] GET /api/chat/tabs error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/chat/tabs/new", (req, res) => {
  console.debug("[Server Debug] POST /api/chat/tabs/new =>", req.body);
  try {
    let name = req.body.name || "Untitled";
    const nexum = req.body.nexum ? 1 : 0;
    const project = req.body.project || '';
    const repo = req.body.repo || '';
    const type = req.body.type || 'chat';
    const sessionId = req.body.sessionId || '';

    const autoNaming = db.getSetting("chat_tab_auto_naming");
    const projectName = db.getSetting("sterling_project") || "";
    if (autoNaming && projectName) {
      name = `${projectName}: ${name}`;
    }

    const { id: tabId, uuid } = db.createChatTab(name, nexum, project, repo, type, sessionId);
    res.json({ success: true, id: tabId, uuid });
    createInitialTabMessage(tabId, type, sessionId).catch(e =>
      console.error('[Server Debug] Initial message error:', e.message));
  } catch (err) {
    console.error("[TaskQueue] POST /api/chat/tabs/new error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/chat/tabs/rename", (req, res) => {
  console.debug("[Server Debug] POST /api/chat/tabs/rename =>", req.body);
  try {
    const { tabId, newName, sessionId = '' } = req.body;
    if (!tabId || !newName) {
      return res.status(400).json({ error: "Missing tabId or newName" });
    }
    const tab = db.getChatTab(tabId, sessionId || null);
    if (!tab) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    db.renameChatTab(tabId, newName);
    res.json({ success: true });
  } catch (err) {
    console.error("[TaskQueue] POST /api/chat/tabs/rename error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/chat/tabs/duplicate", (req, res) => {
  console.debug("[Server Debug] POST /api/chat/tabs/duplicate =>", req.body);
  try {
    const { tabId, name = null, sessionId = '' } = req.body;
    if (!tabId) {
      return res.status(400).json({ error: "Missing tabId" });
    }
    const tab = db.getChatTab(tabId, sessionId || null);
    if (!tab) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const { id: newId, uuid } = db.duplicateChatTab(tabId, name);
    res.json({ success: true, id: newId, uuid });
  } catch (err) {
    console.error("[TaskQueue] POST /api/chat/tabs/duplicate error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/chat/tabs/archive", (req, res) => {
  console.debug("[Server Debug] POST /api/chat/tabs/archive =>", req.body);
  try {
    const { tabId, archived = true, sessionId = '' } = req.body;
    if (!tabId) {
      return res.status(400).json({ error: "Missing tabId" });
    }
    const tab = db.getChatTab(tabId, sessionId || null);
    if (!tab) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    db.setChatTabArchived(tabId, archived ? 1 : 0);
    res.json({ success: true });
  } catch (err) {
    console.error("[TaskQueue] POST /api/chat/tabs/archive error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/chat/tabs/generate_images", (req, res) => {
  console.debug("[Server Debug] POST /api/chat/tabs/generate_images =>", req.body);
  try {
    const { tabId, enabled = true, sessionId = '' } = req.body;
    if (!tabId) {
      return res.status(400).json({ error: "Missing tabId" });
    }
    const tab = db.getChatTab(tabId, sessionId || null);
    if (!tab) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    db.setChatTabGenerateImages(tabId, enabled ? 1 : 0);
    res.json({ success: true });
  } catch (err) {
    console.error("[TaskQueue] POST /api/chat/tabs/generate_images error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/chat/tabs/config", (req, res) => {
  console.debug("[Server Debug] POST /api/chat/tabs/config =>", req.body);
  try {
    const { tabId, project = '', repo = '', type = 'chat', sessionId = '' } = req.body;
    if (!tabId) {
      return res.status(400).json({ error: "Missing tabId" });
    }
    const tab = db.getChatTab(tabId, sessionId || null);
    if (!tab) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    db.setChatTabConfig(tabId, project, repo, type);
    res.json({ success: true });
  } catch (err) {
    console.error("[TaskQueue] POST /api/chat/tabs/config error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/chat/subroutines", (req, res) => {
  console.debug("[Server Debug] GET /api/chat/subroutines");
  try {
    const subs = db.listChatSubroutines();
    res.json(subs);
  } catch (err) {
    console.error("[TaskQueue] GET /api/chat/subroutines error:", err);
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
    console.error("[TaskQueue] POST /api/chat/subroutines/new error:", err);
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
    console.error("[TaskQueue] POST /api/chat/subroutines/rename error:", err);
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
    console.error("[TaskQueue] POST /api/chat/subroutines/update error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.delete("/api/chat/tabs/:id", (req, res) => {
  console.debug("[Server Debug] DELETE /api/chat/tabs =>", req.params.id);
  try {
    const tabId = parseInt(req.params.id, 10);
    const sessionId = req.query.sessionId || '';
    if (!tabId) {
      return res.status(400).json({ error: "Invalid tabId" });
    }
    const tab = db.getChatTab(tabId, sessionId || null);
    if (!tab) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    db.deleteChatTab(tabId);
    db.prepare("DELETE FROM chat_pairs WHERE chat_tab_id=?").run(tabId);
    res.json({ success: true });
  } catch (err) {
    console.error("[TaskQueue] DELETE /api/chat/tabs/:id error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/pair/:id", (req, res) => {
  console.debug("[Server Debug] GET /pair/:id =>", req.params.id);
  const pairId = parseInt(req.params.id, 10);
  if (Number.isNaN(pairId)) return res.status(400).send("Invalid pair ID");
  const pair = db.getPairById(pairId);
  if (!pair) return res.status(404).send("Pair not found");
  const allPairs = db.getAllChatPairs(pair.chat_tab_id);
  res.json({
    pair,
    conversation: allPairs
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

app.get("/api/upload/list", (req, res) => {
  console.debug("[Server Debug] GET /api/upload/list => listing files.", req.query);
  try {
    const sessionId = req.query.sessionId || "";
    const showHidden = req.query.showHidden === '1';
    const limit = parseInt(req.query.limit) || 0;
    const offset = parseInt(req.query.offset) || 0;
    const fileNames = fs.readdirSync(uploadsDir);
    const files = [];
    for (const name of fileNames) {
      const imgSession = db.getImageSessionForUrl(`/uploads/${name}`);
      if (sessionId && imgSession !== sessionId) continue;
      const hidden = db.getImageHiddenForUrl(`/uploads/${name}`) ? 1 : 0;
      if(!showHidden && hidden) continue;
      const { size, mtime } = fs.statSync(path.join(uploadsDir, name));
      const title = db.getImageTitleForUrl(`/uploads/${name}`);
      const id = db.getImageIdForUrl(`/uploads/${name}`);
      const uuid = db.getImageUuidForUrl(`/uploads/${name}`);
      const source = db.isGeneratedImage(`/uploads/${name}`) ? 'Generated' : 'Uploaded';
      const status = db.getImageStatusForUrl(`/uploads/${name}`) || (source === 'Generated' ? 'Generated' : 'Uploaded');
      const portfolio = db.getImagePortfolioForUrl(`/uploads/${name}`) ? 1 : 0;
      const productUrl = db.getProductUrlForImage(`/uploads/${name}`);
      const ebayUrl = db.getEbayUrlForImage(`/uploads/${name}`);
      files.push({ id, uuid, name, size, mtime, title, source, status, portfolio, hidden, productUrl, ebayUrl });
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
    const account = sessionId ? db.getAccountBySession(sessionId) : null;
    const sessionCount = sessionId ? db.countImagesForSession(sessionId) : 0;
    const ipCount = ipAddress ? db.countImagesForIp(ipAddress) : 0;

    let sessionLimit = sessionId ? db.imageLimitForSession(sessionId, 50) : 50;
    let ipLimit = 50;
    if (account) {
      sessionLimit = Infinity;
      ipLimit = Infinity;
    }

    const nextReduction = sessionId ? db.nextImageLimitReductionTime(sessionId) : null;
    res.json({ sessionCount, sessionLimit, ipCount, ipLimit, nextReduction });
  } catch (err) {
    console.error("[Server Debug] /api/image/counts error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/upload/byId", (req, res) => {
  try {
    const id = parseInt(req.query.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const pair = db.getPairById(id);
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

app.post("/api/chat/image", upload.single("imageFile"), async (req, res) => {
  try {
    if(!req.file){
      return res.status(400).json({ error: "No image file received." });
    }

    const scriptPath = `${process.env.HOME}/git/imgs_db/imagedesc.sh`;
    const filePath = path.join(uploadsDir, req.file.filename);

    let desc = "";
    try {
      const cmd = `${scriptPath} "${filePath}"`;
      console.log("[Server Debug] Running command =>", cmd);
      desc = child_process.execSync(cmd).toString().trim();
    } catch(e){
      console.error("[Server Debug] Error calling imagedesc.sh =>", e);
      desc = "(Could not generate description.)";
    }

    db.logActivity("Image upload", JSON.stringify({ file: req.file.filename, desc }));
    res.json({ success: true, desc, filename: req.file.filename });
  } catch(e){
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
    const account = sessionId ? db.getAccountBySession(sessionId) : null;
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

    const job = jobManager.createJob(scriptPath, [filePath], { cwd: scriptCwd, file });
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

    const job = jobManager.createJob(
      "node",
      [scriptPath, productId, filePath],
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
  console.debug("[Server Debug] GET /api/pipelineQueue");
  const queue = printifyQueue.list();
  console.debug(
    "[Server Debug] Current queue =>",
    JSON.stringify(queue, null, 2)
  );
  res.json(queue);
});

app.post("/api/pipelineQueue", (req, res) => {
  console.debug("[Server Debug] POST /api/pipelineQueue =>", req.body);
  const { file, type, dbId, variant } = req.body || {};
  if (!file || !type) {
    return res.status(400).json({ error: "Missing file or type" });
  }
  let parsedDbId = null;
  if (dbId !== undefined && dbId !== null && dbId !== "") {
    const n = parseInt(dbId, 10);
    if (!Number.isNaN(n)) parsedDbId = n;
  }
  const job = printifyQueue.enqueue(file, type, parsedDbId, variant || null);
  console.debug(
    "[Server Debug] Enqueued job =>",
    JSON.stringify(job, null, 2)
  );
  res.json({ jobId: job.id });
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
    const ipAddress = (req.headers["x-forwarded-for"] || req.ip || "").split(",")[0].trim();
    console.debug(
      "[Server Debug] /api/image/generate =>",
      JSON.stringify({ prompt, n, size, model, provider, tabId, sessionId })
    );
    const account = sessionId ? db.getAccountBySession(sessionId) : null;
    if (!prompt) {
      return res.status(400).json({ error: "Missing prompt" });
    }

    if (tabId) {
      const tab = db.getChatTab(parseInt(tabId, 10), sessionId || null);
      if (!tab) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      if (tab.tab_type !== 'design') {
        return res.status(400).json({ error: 'Image generation only allowed for design tabs' });
      }
    }

    const service = (provider || db.getSetting("image_gen_service") || "openai").toLowerCase();

    const allowedSizes = ["1024x1024", "1024x1792", "1792x1024"];
    const imgSize = allowedSizes.includes(size) ? size : "1024x1024";

    let countParsed = parseInt(n, 10);
    if (isNaN(countParsed) || countParsed < 1) countParsed = 1;

    if (sessionId) {
      db.ensureImageSession(sessionId);
    }

    if (!account) {
      if (sessionId) {
        const current = db.countImagesForSession(sessionId);
        const limit = db.imageLimitForSession(sessionId, 50);
        if (current >= limit) {
          return res.status(400).json({ error: 'Image generation limit reached for this session' });
        }
      }

      if (ipAddress) {
        const ipCount = db.countImagesForIp(ipAddress);
        if (ipCount >= 50) {
          return res.status(400).json({ error: 'Image generation limit reached for this IP' });
        }
      }
    }

    if (service === "stable-diffusion") {
      const sdBase = process.env.STABLE_DIFFUSION_URL;
      if (!sdBase) {
        return res.status(500).json({ error: "STABLE_DIFFUSION_URL not configured" });
      }
      const [w, h] = imgSize.split("x").map(v => parseInt(v, 10));
      const sdEndpoint = sdBase.replace(/\/$/, "") + "/sdapi/v1/txt2img";
      const payload = { prompt, width: w, height: h, steps: 20, batch_size: countParsed };
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
      console.debug("[Server Debug] Saved Stable Diffusion image =>", filePath);
      const localUrl = `/uploads/${filename}`;
      db.logActivity(
        "Image generate",
        JSON.stringify({ prompt, url: localUrl, model: model || "", n: countParsed, provider: service })
      );
      const tab = parseInt(tabId, 10) || 1;
      const imageTitle = await deriveImageTitle(prompt);
      const modelId = model ? `stable-diffusion/${model}` : 'stable-diffusion';
      db.createImagePair(localUrl, prompt || '', tab, imageTitle, 'Generated', sessionId, ipAddress, modelId, 1);
      return res.json({ success: true, url: localUrl, title: imageTitle });
    }

    const openAiKey = process.env.OPENAI_API_KEY;
    if (!openAiKey) {
      return res
        .status(500)
        .json({ error: "OPENAI_API_KEY environment variable not configured" });
    }

    const openaiClient = new OpenAI({ apiKey: openAiKey });

    let modelName = (model || "dall-e-3").toLowerCase();
    const allowedModels = ["dall-e-2", "dall-e-3"];
    if (!allowedModels.includes(modelName)) {
      return res.status(400).json({ error: "Invalid model" });
    }

    if (modelName === "dall-e-3") {
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
      result = await openaiClient.images.generate({
        model: modelName,
        prompt: prompt.slice(0, 1000),
        n: countParsed,
        size: imgSize,
        response_format: "url"
      });
    } catch (err) {
      if (
        modelName === "dall-e-3" &&
        err?.type === "image_generation_user_error"
      ) {
        try {
          result = await openaiClient.images.generate({
            model: "dall-e-2",
            prompt: prompt.slice(0, 1000),
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

    const first = result.data?.[0]?.url || null;
    console.debug("[Server Debug] OpenAI response url =>", first);
    if (!first) {
      return res.status(502).json({ error: "Received empty response from AI service" });
    }

    let localUrl = first;
    try {
      const resp = await axios.get(first, { responseType: "arraybuffer" });
      const ext = path.extname(new URL(first).pathname) || ".png";
      const filename = `generated-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
      const filePath = path.join(uploadsDir, filename);
      fs.writeFileSync(filePath, resp.data);
      console.debug("[Server Debug] Saved OpenAI image =>", filePath);
      localUrl = `/uploads/${filename}`;
    } catch(downloadErr) {
      console.error("[Server Debug] Failed to download generated image:", downloadErr);
    }

    db.logActivity(
      "Image generate",
      JSON.stringify({ prompt, url: localUrl, model: modelName, n: countParsed, provider: service })
    );

    const tab = parseInt(tabId, 10) || 1;
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
app.get("/", (req, res) => {
  const sessionId = getSessionIdFromRequest(req);
  try {
    if (!sessionId) {
      console.debug("[Server Debug] GET / => Redirecting to nexum.html");
      return res.redirect("/nexum.html");
    }

    const tabs = db.listChatTabs(null, false, sessionId);
    if (tabs.length === 0) {
      console.debug("[Server Debug] GET / => Redirecting to nexum.html");
      return res.redirect("/nexum.html");
    }

    const lastTabId = db.getSetting("last_chat_tab");
    let target = null;
    if (typeof lastTabId !== "undefined") {
      target = db.getChatTab(lastTabId, sessionId);
    }
    if (!target) {
      target = tabs[0];
    }
    if (target && target.tab_uuid) {
      console.debug(
        `[Server Debug] GET / => Redirecting to last tab ${target.tab_uuid}`
      );
      return res.redirect(`/chat/${target.tab_uuid}`);
    }
  } catch (err) {
    console.error("[Server Debug] Error checking chat tabs:", err);
  }
  console.debug("[Server Debug] GET / => Serving aurora.html");
  res.sendFile(path.join(__dirname, "../public/aurora.html"));
});

app.use(express.static(path.join(__dirname, "../public")));

app.get("/beta", (req, res) => {
  console.debug("[Server Debug] GET /beta => Redirecting to home page");
  res.redirect("/");
});

app.get("/chat/:tabUuid", (req, res) => {
  console.debug(`[Server Debug] GET /chat/${req.params.tabUuid} => Serving aurora.html`);
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
    console.error("[TaskQueue] DELETE /api/chat/pair/:id error:", err);
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
    console.error("[TaskQueue] DELETE /api/chat/pair/:id/ai error:", err);
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
    console.error("[TaskQueue] DELETE /api/chat/pair/:id/user error:", err);
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
    console.error("[TaskQueue] POST /api/chat/pair/:id/user error:", err);
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
    console.error("[TaskQueue] POST /api/chat/pair/:id/ai error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/createSterlingChat", async (req, res) => {
  db.logActivity("Create Sterling Chat", "User triggered createSterlingChat endpoint.");

  try {
    const baseURL = 'http://localhost:3444/api';
    const project = db.getSetting("sterling_project") || "alfe-dev_test_repo";
    const projectName = "aurora_working-" + project;

    console.log('=== Testing createChat endpoint ===');
    const createChatResponse = await axios.post(`${baseURL}/createChat`, {
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
        `${baseURL}/changeBranchOfChat/${encodeURIComponent(projectName)}/${createChatResponse.data.newChatNumber}`,
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

    const sterlingUrl = `http://localhost:3444/${encodeURIComponent(projectName)}/chat/${createChatResponse.data.newChatNumber}`;
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
    console.error("[TaskQueue] /api/projects/rename error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/ai/favorites", (req, res) => {
  try {
    const sessionId = getSessionIdFromRequest(req);
    const account = sessionId ? db.getAccountBySession(sessionId) : null;
    if (!account) {
      return res.status(401).json({ error: "not logged in" });
    }

    const { modelId, favorite } = req.body;
    if (!modelId || typeof favorite !== "boolean") {
      return res.status(400).json({ error: "Missing modelId or favorite boolean" });
    }
    let favList = db.getSetting("favorite_ai_models") || [];
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
    const latestTag = child_process
      .execSync("git tag --sort=-creatordate | head -n 1", {
        cwd: path.join(__dirname, ".."),
      })
      .toString()
      .trim();
    res.json({ version: `beta-${latestTag}` });
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

const PORT =
  process.env.AURORA_PORT ||
  process.env.PORT ||
  3000;
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
    console.log(`[TaskQueue] HTTPS server running on port ${PORT}`);
  });
} else {
  app.listen(PORT, () => {
    console.log(`[TaskQueue] Web server is running on port ${PORT} (verbose='true')`);
  });
}
