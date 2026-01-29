let pg = null;

const REQUIRE_RDS = process.env.ALFECODE_REQUIRE_RDS !== "false";

const SETTINGS_TABLE = "settings";
const SESSION_SETTINGS_TABLE = "session_settings";
const ACCOUNTS_TABLE = "accounts";
const SUPPORT_REQUESTS_TABLE = "support_requests";
const SUPPORT_REQUEST_REPLIES_TABLE = "support_request_replies";
const SUPPORT_REQUEST_DEFAULT_STATUS = "Awaiting Support Reply";
const SUPPORT_REQUEST_REPLIED_STATUS = "Support Replied";

function normalizeHost(host) {
  if (host === "::1") return "127.0.0.1";
  return host;
}

function buildPoolConfig() {
  const {
    AWS_DB_URL,
    AWS_DB_HOST,
    AWS_DB_USER,
    AWS_DB_PASSWORD,
    AWS_DB_NAME,
    AWS_DB_PORT,
  } = process.env;

  const poolConfig = {};
  if (AWS_DB_URL) {
    poolConfig.connectionString = AWS_DB_URL;
  } else {
    const host = normalizeHost(AWS_DB_HOST);
    if (host) poolConfig.host = host;
    if (AWS_DB_USER) poolConfig.user = AWS_DB_USER;
    if (AWS_DB_PASSWORD) poolConfig.password = AWS_DB_PASSWORD;
    if (AWS_DB_NAME) poolConfig.database = AWS_DB_NAME;
    if (AWS_DB_PORT) poolConfig.port = Number.parseInt(AWS_DB_PORT, 10);
  }

  if (process.env.AWS_DB_SSL === "true" || process.env.AWS_DB_SSL_MODE) {
    poolConfig.ssl = {
      rejectUnauthorized: process.env.AWS_DB_SSL_REJECT_UNAUTHORIZED !== "false",
    };
    if (process.env.AWS_DB_SSL_CA) {
      poolConfig.ssl.ca = process.env.AWS_DB_SSL_CA;
    }
  }

  return poolConfig;
}

function isRdsConfigured() {
  return Boolean(process.env.AWS_DB_URL || process.env.AWS_DB_HOST);
}

class RdsStore {
  constructor() {
    this.enabled = isRdsConfigured();
    this.settings = new Map();
    this.sessionSettings = new Map();
    this.ready = false;
    this.initPromise = null;

    if (REQUIRE_RDS && !this.enabled) {
      throw new Error(
        "[RdsStore] AWS RDS configuration is required. Set AWS_DB_URL or AWS_DB_HOST (or set ALFECODE_REQUIRE_RDS=false to allow local storage)."
      );
    }

    if (this.enabled) {
      pg = require("pg");
      this.pool = new pg.Pool(buildPoolConfig());
      this.initPromise = this.init();
    }
  }

  async init() {
    try {
      await this.pool.query(`CREATE TABLE IF NOT EXISTS ${SETTINGS_TABLE} (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );`);
      await this.pool.query(`CREATE TABLE IF NOT EXISTS ${SESSION_SETTINGS_TABLE} (
        session_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        PRIMARY KEY (session_id, key)
      );`);
      await this.pool.query(`CREATE TABLE IF NOT EXISTS ${ACCOUNTS_TABLE} (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        session_id TEXT DEFAULT '',
        created_at TEXT NOT NULL,
        totp_secret TEXT DEFAULT '',
        timezone TEXT DEFAULT '',
        plan TEXT DEFAULT 'Free',
        ever_subscribed BOOLEAN DEFAULT false
      );`);
      await this.pool.query(
        `ALTER TABLE ${ACCOUNTS_TABLE}
         ADD COLUMN IF NOT EXISTS ever_subscribed BOOLEAN DEFAULT false`
      );
      await this.pool.query(
        `UPDATE ${ACCOUNTS_TABLE}
         SET ever_subscribed = false
         WHERE ever_subscribed IS NULL`
      );
      await this.pool.query(`CREATE TABLE IF NOT EXISTS ${SUPPORT_REQUESTS_TABLE} (
        id SERIAL PRIMARY KEY,
        created_at TEXT NOT NULL,
        session_id TEXT DEFAULT '',
        account_id INTEGER,
        email TEXT DEFAULT '',
        category TEXT NOT NULL,
        message TEXT NOT NULL,
        user_agent TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT '${SUPPORT_REQUEST_DEFAULT_STATUS}'
      );`);
      await this.pool.query(`CREATE TABLE IF NOT EXISTS ${SUPPORT_REQUEST_REPLIES_TABLE} (
        id SERIAL PRIMARY KEY,
        support_request_id INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        message TEXT NOT NULL
      );`);
      await this.pool.query(
        `ALTER TABLE ${SUPPORT_REQUESTS_TABLE}
         ADD COLUMN IF NOT EXISTS status TEXT DEFAULT '${SUPPORT_REQUEST_DEFAULT_STATUS}'`
      );
      await this.pool.query(
        `UPDATE ${SUPPORT_REQUESTS_TABLE}
         SET status = $1
         WHERE status IS NULL OR status = ''`,
        [SUPPORT_REQUEST_DEFAULT_STATUS]
      );
      await this.loadAllSettings();
      this.ready = true;
    } catch (error) {
      console.error("[RdsStore] Initialization failed:", error?.message || error);
    }
  }

  async ensureReady() {
    if (this.initPromise) {
      await this.initPromise;
    }
  }

  async loadAllSettings() {
    const result = await this.pool.query(`SELECT key, value FROM ${SETTINGS_TABLE}`);
    result.rows.forEach((row) => {
      this.settings.set(row.key, row.value);
    });
  }

  getSetting(key) {
    return this.settings.get(key);
  }

  getSessionSetting(sessionId, key) {
    const sessionMap = this.sessionSettings.get(sessionId);
    return sessionMap ? sessionMap.get(key) : undefined;
  }

  setSetting(key, value) {
    if (!this.enabled) return;
    this.settings.set(key, value);
    this.queueSettingUpsert(key, value);
  }

  setSessionSetting(sessionId, key, value) {
    if (!this.enabled) return;
    let sessionMap = this.sessionSettings.get(sessionId);
    if (!sessionMap) {
      sessionMap = new Map();
      this.sessionSettings.set(sessionId, sessionMap);
    }
    sessionMap.set(key, value);
    this.queueSessionSettingUpsert(sessionId, key, value);
  }

  prefetchSessionSetting(sessionId, key) {
    if (!this.enabled) return;
    const existing = this.getSessionSetting(sessionId, key);
    if (existing !== undefined) return;
    this.loadSessionSetting(sessionId, key);
  }

  async loadSessionSetting(sessionId, key) {
    try {
      const result = await this.pool.query(
        `SELECT value FROM ${SESSION_SETTINGS_TABLE} WHERE session_id = $1 AND key = $2`,
        [sessionId, key]
      );
      if (!result.rows.length) return;
      const value = result.rows[0].value;
      this.setSessionSetting(sessionId, key, value);
    } catch (error) {
      console.error("[RdsStore] Failed to load session setting:", error?.message || error);
    }
  }

  async queueSettingUpsert(key, value) {
    try {
      await this.pool.query(
        `INSERT INTO ${SETTINGS_TABLE} (key, value)
         VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [key, value]
      );
    } catch (error) {
      console.error("[RdsStore] Failed to upsert setting:", error?.message || error);
    }
  }

  async queueSessionSettingUpsert(sessionId, key, value) {
    try {
      await this.pool.query(
        `INSERT INTO ${SESSION_SETTINGS_TABLE} (session_id, key, value)
         VALUES ($1, $2, $3)
         ON CONFLICT (session_id, key) DO UPDATE SET value = EXCLUDED.value`,
        [sessionId, key, value]
      );
    } catch (error) {
      console.error("[RdsStore] Failed to upsert session setting:", error?.message || error);
    }
  }

  async getAccountByEmail(email) {
    if (!this.enabled) return null;
    await this.ensureReady();
    const normalized = (email || "").toString().trim().toLowerCase();
    if (!normalized) return null;
    try {
      const result = await this.pool.query(
        `SELECT id, email, password_hash, session_id, created_at, totp_secret, timezone, plan, ever_subscribed
         FROM ${ACCOUNTS_TABLE}
         WHERE email = $1
         LIMIT 1`,
        [normalized]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error("[RdsStore] Failed to load account:", error?.message || error);
      return null;
    }
  }

  async createAccount({ email, passwordHash, sessionId }) {
    if (!this.enabled) return null;
    await this.ensureReady();
    const normalized = (email || "").toString().trim().toLowerCase();
    if (!normalized) return null;
    try {
      const result = await this.pool.query(
        `INSERT INTO ${ACCOUNTS_TABLE} (email, password_hash, session_id, created_at, timezone, plan)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, email, session_id, created_at`,
        [normalized, passwordHash, sessionId || '', new Date().toISOString(), '', 'Free']
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error("[RdsStore] Failed to create account:", error?.message || error);
      throw error;
    }
  }

  async setAccountSession(id, sessionId) {
    if (!this.enabled) return;
    await this.ensureReady();
    try {
      await this.pool.query(
        `UPDATE ${ACCOUNTS_TABLE}
         SET session_id = $1
         WHERE id = $2`,
        [sessionId || "", id]
      );
    } catch (error) {
      console.error("[RdsStore] Failed to update account session:", error?.message || error);
    }
  }

  async setAccountPlan(id, plan) {
    if (!this.enabled) return;
    await this.ensureReady();
    try {
      await this.pool.query(
        `UPDATE ${ACCOUNTS_TABLE}
         SET plan = $1
         WHERE id = $2`,
        [plan || "Free", id]
      );
    } catch (error) {
      console.error("[RdsStore] Failed to update account plan:", error?.message || error);
    }
  }

  async setAccountEverSubscribed(id, everSubscribed) {
    if (!this.enabled) return;
    await this.ensureReady();
    try {
      await this.pool.query(
        `UPDATE ${ACCOUNTS_TABLE}
         SET ever_subscribed = $1
         WHERE id = $2`,
        [Boolean(everSubscribed), id]
      );
    } catch (error) {
      console.error("[RdsStore] Failed to update account ever subscribed:", error?.message || error);
    }
  }

  async getAccountBySession(sessionId) {
    if (!this.enabled) return null;
    await this.ensureReady();
    const normalized = (sessionId || "").toString().trim();
    if (!normalized) return null;
    try {
      const result = await this.pool.query(
        `SELECT id, email, password_hash, session_id, created_at, totp_secret, timezone, plan, ever_subscribed
         FROM ${ACCOUNTS_TABLE}
         WHERE session_id = $1
         LIMIT 1`,
        [normalized]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error("[RdsStore] Failed to load account by session:", error?.message || error);
      return null;
    }
  }

  async mergeSessions(targetId, sourceId) {
    if (!this.enabled) return;
    await this.ensureReady();
    if (!targetId || !sourceId || targetId === sourceId) {
      return;
    }
    try {
      await this.pool.query(
        `UPDATE ${SESSION_SETTINGS_TABLE}
         SET session_id = $1
         WHERE session_id = $2`,
        [targetId, sourceId]
      );
    } catch (error) {
      console.error("[RdsStore] Failed to merge sessions:", error?.message || error);
    }
  }

  async createSupportRequest({ sessionId, accountId, email, category, message, userAgent, status }) {
    if (!this.enabled) return null;
    await this.ensureReady();
    const normalizedCategory = (category || "").toString().trim();
    const normalizedMessage = (message || "").toString().trim();
    const normalizedStatus = (status || "").toString().trim() || SUPPORT_REQUEST_DEFAULT_STATUS;
    if (!normalizedCategory || !normalizedMessage) return null;
    try {
      const result = await this.pool.query(
        `INSERT INTO ${SUPPORT_REQUESTS_TABLE}
         (created_at, session_id, account_id, email, category, message, user_agent, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, created_at, status`,
        [
          new Date().toISOString(),
          (sessionId || "").toString().trim(),
          accountId || null,
          (email || "").toString().trim().toLowerCase(),
          normalizedCategory,
          normalizedMessage,
          (userAgent || "").toString().trim(),
          normalizedStatus,
        ]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error("[RdsStore] Failed to create support request:", error?.message || error);
      throw error;
    }
  }

  async listSupportRequests({ sessionId, accountId, limit = 20 }) {
    if (!this.enabled) return [];
    await this.ensureReady();
    const normalizedLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 20;
    const normalizedSessionId = (sessionId || "").toString().trim();
    const normalizedAccountId = accountId ? Number(accountId) : null;
    if (!normalizedAccountId && !normalizedSessionId) return [];

    const params = [];
    let whereClause = "";
    if (normalizedAccountId) {
      params.push(normalizedAccountId);
      whereClause = "account_id = $1";
    } else {
      params.push(normalizedSessionId);
      whereClause = "session_id = $1";
    }
    params.push(normalizedLimit);

    try {
      const result = await this.pool.query(
        `SELECT id, created_at, category, message, status
         FROM ${SUPPORT_REQUESTS_TABLE}
         WHERE ${whereClause}
         ORDER BY created_at DESC
         LIMIT $2`,
        params
      );
      return result.rows || [];
    } catch (error) {
      console.error("[RdsStore] Failed to list support requests:", error?.message || error);
      return [];
    }
  }

  async getSupportRequestById({ requestId, sessionId, accountId }) {
    if (!this.enabled) return null;
    await this.ensureReady();
    const normalizedRequestId = Number(requestId);
    if (!Number.isFinite(normalizedRequestId)) return null;
    const normalizedSessionId = (sessionId || "").toString().trim();
    const normalizedAccountId = accountId ? Number(accountId) : null;
    if (!normalizedAccountId && !normalizedSessionId) return null;

    const params = [normalizedRequestId];
    let whereClause = "id = $1";
    if (normalizedAccountId) {
      params.push(normalizedAccountId);
      whereClause += " AND account_id = $2";
    } else {
      params.push(normalizedSessionId);
      whereClause += " AND session_id = $2";
    }

    try {
      const result = await this.pool.query(
        `SELECT id, created_at, category, message, email, status
         FROM ${SUPPORT_REQUESTS_TABLE}
         WHERE ${whereClause}
         LIMIT 1`,
        params
      );
      const request = result.rows[0] || null;
      if (!request) {
        return null;
      }
      request.replies = await this.listSupportRequestReplies({ requestId: request.id });
      return request;
    } catch (error) {
      console.error("[RdsStore] Failed to load support request:", error?.message || error);
      return null;
    }
  }

  async getSupportRequestByIdForAdmin({ requestId }) {
    if (!this.enabled) return null;
    await this.ensureReady();
    const normalizedRequestId = Number(requestId);
    if (!Number.isFinite(normalizedRequestId)) return null;
    try {
      const result = await this.pool.query(
        `SELECT id, created_at, category, message, email, status
         FROM ${SUPPORT_REQUESTS_TABLE}
         WHERE id = $1
         LIMIT 1`,
        [normalizedRequestId]
      );
      const request = result.rows[0] || null;
      if (!request) {
        return null;
      }
      request.replies = await this.listSupportRequestReplies({ requestId: request.id });
      return request;
    } catch (error) {
      console.error("[RdsStore] Failed to load support request for admin:", error?.message || error);
      return null;
    }
  }

  async listSupportRequestReplies({ requestId }) {
    if (!this.enabled) return [];
    await this.ensureReady();
    const normalizedRequestId = Number(requestId);
    if (!Number.isFinite(normalizedRequestId)) return [];
    try {
      const result = await this.pool.query(
        `SELECT role, message, created_at
         FROM ${SUPPORT_REQUEST_REPLIES_TABLE}
         WHERE support_request_id = $1
         ORDER BY created_at ASC`,
        [normalizedRequestId]
      );
      return result.rows || [];
    } catch (error) {
      console.error("[RdsStore] Failed to list support request replies:", error?.message || error);
      return [];
    }
  }

  async markSupportRequestReplied({ requestId }) {
    if (!this.enabled) return null;
    await this.ensureReady();
    const normalizedRequestId = Number(requestId);
    if (!Number.isFinite(normalizedRequestId)) return null;
    try {
      const result = await this.pool.query(
        `UPDATE ${SUPPORT_REQUESTS_TABLE}
         SET status = $1
         WHERE id = $2 AND status = $3
         RETURNING id, status`,
        [SUPPORT_REQUEST_REPLIED_STATUS, normalizedRequestId, SUPPORT_REQUEST_DEFAULT_STATUS]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error("[RdsStore] Failed to mark support request replied:", error?.message || error);
      return null;
    }
  }

  async createSupportRequestReply({ requestId, role, message }) {
    if (!this.enabled) return null;
    await this.ensureReady();
    const normalizedRequestId = Number(requestId);
    if (!Number.isFinite(normalizedRequestId)) return null;
    const normalizedMessage = (message || "").toString().trim();
    if (!normalizedMessage) return null;
    const normalizedRole = (role || "user").toString().trim().toLowerCase();
    try {
      const result = await this.pool.query(
        `INSERT INTO ${SUPPORT_REQUEST_REPLIES_TABLE}
         (support_request_id, created_at, role, message)
         VALUES ($1, $2, $3, $4)
         RETURNING id, created_at, role, message`,
        [
          normalizedRequestId,
          new Date().toISOString(),
          normalizedRole || "user",
          normalizedMessage,
        ]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error("[RdsStore] Failed to create support request reply:", error?.message || error);
      throw error;
    }
  }
}

module.exports = new RdsStore();
