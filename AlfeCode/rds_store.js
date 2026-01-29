let pg = null;

const REQUIRE_RDS = process.env.ALFECODE_REQUIRE_RDS !== "false";

const SETTINGS_TABLE = "settings";
const SESSION_SETTINGS_TABLE = "session_settings";
const ACCOUNTS_TABLE = "accounts";
const CODE_RUN_USAGE_TABLE = "code_run_usage";

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
        plan TEXT DEFAULT 'Free'
      );`);
      await this.pool.query(`CREATE TABLE IF NOT EXISTS ${CODE_RUN_USAGE_TABLE} (
        session_id TEXT NOT NULL,
        month_year TEXT NOT NULL,
        run_count INTEGER NOT NULL DEFAULT 0,
        last_run_at TEXT DEFAULT '',
        PRIMARY KEY (session_id, month_year)
      );`);
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
        `SELECT id, email, password_hash, session_id, created_at, totp_secret, timezone, plan
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

  async getAccountBySession(sessionId) {
    if (!this.enabled) return null;
    await this.ensureReady();
    const normalized = (sessionId || "").toString().trim();
    if (!normalized) return null;
    try {
      const result = await this.pool.query(
        `SELECT id, email, password_hash, session_id, created_at, totp_secret, timezone, plan
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
}

module.exports = new RdsStore();
