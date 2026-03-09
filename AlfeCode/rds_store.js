let pg = null;

const REQUIRE_RDS = process.env.ALFECODE_REQUIRE_RDS !== "false";

const SETTINGS_TABLE = "settings";
const SESSION_SETTINGS_TABLE = "session_settings";
const ACCOUNTS_TABLE = "accounts";
const PROJECTVIEW_JSON_TABLE = "projectview_json";
const ALFECODE_RUNS_TABLE = "alfecode_runs";
const SESSION_VIEWS_TABLE = "session_views";
const PAGE_VIEWS_TABLE = "page_views";
const LOG_INS_TABLE = "log_ins";
const SUPPORT_REQUESTS_TABLE = "support_requests";
const SUPPORT_REQUEST_REPLIES_TABLE = "support_request_replies";
const SUPPORT_REQUEST_DEFAULT_STATUS = "Awaiting Support Reply";
const SUPPORT_REQUEST_REPLIED_STATUS = "Support Replied";
const SUPPORT_REQUEST_BUG_SUBMITTED_STATUS = "Bug Report Submitted";
const SUPPORT_REQUEST_FEATURE_SUBMITTED_STATUS = "Feature Request Submitted";

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
    this.sessionRuns = new Map();
    this.sessionRunWriteVersions = new Map();
    this.sessionRunWritePromises = new Map();
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
        password_hash TEXT,
        session_id TEXT DEFAULT '',
        aurora_session_id TEXT DEFAULT '',
        created_at TEXT NOT NULL,
        totp_secret TEXT DEFAULT '',
        timezone TEXT DEFAULT '',
        plan TEXT DEFAULT 'Free',
        ever_subscribed BOOLEAN DEFAULT false,
        openrouter_api_key TEXT DEFAULT '',
        key_hash_id TEXT DEFAULT '',
        disabled BOOLEAN DEFAULT false,
        last_log_in TEXT DEFAULT NULL
      );`);
      await this.pool.query(`CREATE TABLE IF NOT EXISTS ${PROJECTVIEW_JSON_TABLE} (
        session_id TEXT PRIMARY KEY,
        projects_json TEXT NOT NULL DEFAULT '[]',
        updated_at TEXT NOT NULL
      );`);
      await this.pool.query(`CREATE TABLE IF NOT EXISTS ${ALFECODE_RUNS_TABLE} (
        session_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        numeric_id BIGINT,
        followup_parent_id TEXT DEFAULT '',
        status TEXT DEFAULT '',
        script_status TEXT DEFAULT '',
        final_output_message TEXT DEFAULT '',
        created_at TEXT DEFAULT '',
        updated_at TEXT DEFAULT '',
        payload_json TEXT NOT NULL,
        account_id INTEGER,
        branch TEXT DEFAULT '',
        model TEXT DEFAULT '',
        base_revision TEXT DEFAULT '',
        commit_revision TEXT DEFAULT '',
        run_directory TEXT DEFAULT '',
        PRIMARY KEY (session_id, run_id)
      );`);
      await this.pool.query(`CREATE TABLE IF NOT EXISTS ${SESSION_VIEWS_TABLE} (
        session_id TEXT PRIMARY KEY,
        view_count INTEGER NOT NULL DEFAULT 0,
        account_id INTEGER,
        ipv4_address TEXT[] DEFAULT '{}',
        ipv6_address TEXT[] DEFAULT '{}'
      );`);
      await this.pool.query(`CREATE TABLE IF NOT EXISTS ${PAGE_VIEWS_TABLE} (
        id SERIAL PRIMARY KEY,
        session_id TEXT NOT NULL,
        route TEXT NOT NULL DEFAULT '',
        viewed_at TEXT NOT NULL,
        ipv4_address TEXT[] DEFAULT '{}',
        ipv6_address TEXT[] DEFAULT '{}'
      );`);
      await this.pool.query(`CREATE TABLE IF NOT EXISTS ${LOG_INS_TABLE} (
        account_id INTEGER NOT NULL,
        logged_in_at TEXT NOT NULL,
        app TEXT DEFAULT '',
        ipv4_address TEXT DEFAULT '',
        ipv6_address TEXT DEFAULT ''
      );`);
      await this.pool.query(
        `CREATE INDEX IF NOT EXISTS idx_${ALFECODE_RUNS_TABLE}_session_updated
         ON ${ALFECODE_RUNS_TABLE} (session_id, updated_at DESC)`
      );
      await this.pool.query(
        `CREATE INDEX IF NOT EXISTS idx_${ALFECODE_RUNS_TABLE}_session_followup_parent
         ON ${ALFECODE_RUNS_TABLE} (session_id, followup_parent_id, updated_at DESC)`
      );
      await this.pool.query(
        `ALTER TABLE ${SESSION_VIEWS_TABLE}
         ADD COLUMN IF NOT EXISTS account_id INTEGER`
      );
      await this.pool.query(
        `ALTER TABLE ${SESSION_VIEWS_TABLE}
         ADD COLUMN IF NOT EXISTS ipv4_address TEXT[] DEFAULT '{}';`
      );
      await this.pool.query(
        `ALTER TABLE ${SESSION_VIEWS_TABLE}
         ADD COLUMN IF NOT EXISTS ipv6_address TEXT[] DEFAULT '{}';`
      );
      await this.pool.query(
        `ALTER TABLE ${PAGE_VIEWS_TABLE}
         ADD COLUMN IF NOT EXISTS ipv4_address TEXT[] DEFAULT '{}';`
      );
      await this.pool.query(
        `ALTER TABLE ${PAGE_VIEWS_TABLE}
         ADD COLUMN IF NOT EXISTS ipv6_address TEXT[] DEFAULT '{}';`
      );
      await this.pool.query(
        `ALTER TABLE ${LOG_INS_TABLE}
         ADD COLUMN IF NOT EXISTS ipv4_address TEXT DEFAULT '';`
      );
      await this.pool.query(
        `ALTER TABLE ${LOG_INS_TABLE}
         ADD COLUMN IF NOT EXISTS ipv6_address TEXT DEFAULT '';`
      );
      await this.pool.query(
        `ALTER TABLE ${LOG_INS_TABLE}
         ADD COLUMN IF NOT EXISTS app TEXT DEFAULT '';`
      );

      await this.pool.query(
        `DO $$
         BEGIN
           IF EXISTS (
             SELECT 1
             FROM information_schema.columns
             WHERE table_name = '${SESSION_VIEWS_TABLE}'
               AND column_name = 'ipv4_address'
               AND udt_name <> '_text'
           ) THEN
             ALTER TABLE ${SESSION_VIEWS_TABLE}
             ALTER COLUMN ipv4_address DROP DEFAULT;
             ALTER TABLE ${SESSION_VIEWS_TABLE}
             ALTER COLUMN ipv4_address TYPE TEXT[]
             USING CASE
               WHEN ipv4_address IS NULL OR btrim(ipv4_address::text) = '' THEN '{}'::TEXT[]
               ELSE ARRAY[ipv4_address::text]
             END;
             ALTER TABLE ${SESSION_VIEWS_TABLE}
             ALTER COLUMN ipv4_address SET DEFAULT '{}'::TEXT[];
           END IF;
         END
         $$;`
      );
      await this.pool.query(
        `DO $$
         BEGIN
           IF EXISTS (
             SELECT 1
             FROM information_schema.columns
             WHERE table_name = '${PAGE_VIEWS_TABLE}'
               AND column_name = 'ipv4_address'
               AND udt_name <> '_text'
           ) THEN
             ALTER TABLE ${PAGE_VIEWS_TABLE}
             ALTER COLUMN ipv4_address DROP DEFAULT;
             ALTER TABLE ${PAGE_VIEWS_TABLE}
             ALTER COLUMN ipv4_address TYPE TEXT[]
             USING CASE
               WHEN ipv4_address IS NULL OR btrim(ipv4_address::text) = '' THEN '{}'::TEXT[]
               ELSE ARRAY[ipv4_address::text]
             END;
             ALTER TABLE ${PAGE_VIEWS_TABLE}
             ALTER COLUMN ipv4_address SET DEFAULT '{}'::TEXT[];
           END IF;
         END
         $$;`
      );
      await this.pool.query(
        `DO $$
         BEGIN
           IF EXISTS (
             SELECT 1
             FROM information_schema.columns
             WHERE table_name = '${PAGE_VIEWS_TABLE}'
               AND column_name = 'ipv6_address'
               AND udt_name <> '_text'
           ) THEN
             ALTER TABLE ${PAGE_VIEWS_TABLE}
             ALTER COLUMN ipv6_address DROP DEFAULT;
             ALTER TABLE ${PAGE_VIEWS_TABLE}
             ALTER COLUMN ipv6_address TYPE TEXT[]
             USING CASE
               WHEN ipv6_address IS NULL OR btrim(ipv6_address::text) = '' THEN '{}'::TEXT[]
               ELSE ARRAY[ipv6_address::text]
             END;
             ALTER TABLE ${PAGE_VIEWS_TABLE}
             ALTER COLUMN ipv6_address SET DEFAULT '{}'::TEXT[];
           END IF;
         END
         $$;`
      );
      await this.pool.query(
        `DO $$
         BEGIN
           IF EXISTS (
             SELECT 1
             FROM information_schema.columns
             WHERE table_name = '${SESSION_VIEWS_TABLE}'
               AND column_name = 'ipv6_address'
               AND udt_name <> '_text'
           ) THEN
             ALTER TABLE ${SESSION_VIEWS_TABLE}
             ALTER COLUMN ipv6_address DROP DEFAULT;
             ALTER TABLE ${SESSION_VIEWS_TABLE}
             ALTER COLUMN ipv6_address TYPE TEXT[]
             USING CASE
               WHEN ipv6_address IS NULL OR btrim(ipv6_address::text) = '' THEN '{}'::TEXT[]
               ELSE ARRAY[ipv6_address::text]
             END;
             ALTER TABLE ${SESSION_VIEWS_TABLE}
             ALTER COLUMN ipv6_address SET DEFAULT '{}'::TEXT[];
           END IF;
         END
         $$;`
      );
      await this.pool.query(
        `ALTER TABLE ${PROJECTVIEW_JSON_TABLE}
         ADD COLUMN IF NOT EXISTS projects_json TEXT NOT NULL DEFAULT '[]'`
      );
      await this.pool.query(
        `ALTER TABLE ${PROJECTVIEW_JSON_TABLE}
         ADD COLUMN IF NOT EXISTS updated_at TEXT NOT NULL DEFAULT ''`
      );
      await this.pool.query(
        `ALTER TABLE ${ACCOUNTS_TABLE}
         ADD COLUMN IF NOT EXISTS ever_subscribed BOOLEAN DEFAULT false`
      );
      await this.pool.query(
        `ALTER TABLE ${ACCOUNTS_TABLE}
         ADD COLUMN IF NOT EXISTS openrouter_api_key TEXT DEFAULT ''`
      );
      await this.pool.query(
        `ALTER TABLE ${ACCOUNTS_TABLE}
         ADD COLUMN IF NOT EXISTS key_hash_id TEXT DEFAULT ''`
      );
      await this.pool.query(
        `ALTER TABLE ${ACCOUNTS_TABLE}
         ADD COLUMN IF NOT EXISTS disabled BOOLEAN DEFAULT false`
      );
      await this.pool.query(
        `ALTER TABLE ${ACCOUNTS_TABLE}
         ADD COLUMN IF NOT EXISTS aurora_session_id TEXT DEFAULT ''`
      );
      await this.pool.query(
        `ALTER TABLE ${ACCOUNTS_TABLE}
         ADD COLUMN IF NOT EXISTS last_log_in TEXT DEFAULT NULL`
      );
      await this.migrateFollowupParentIdColumn();
      await this.pool.query(
        `ALTER TABLE ${ALFECODE_RUNS_TABLE}
         ADD COLUMN IF NOT EXISTS account_id INTEGER`
      );
      await this.pool.query(
        `ALTER TABLE ${ALFECODE_RUNS_TABLE}
         ADD COLUMN IF NOT EXISTS branch TEXT DEFAULT ''`
      );
      await this.pool.query(
        `ALTER TABLE ${ALFECODE_RUNS_TABLE}
         ADD COLUMN IF NOT EXISTS model TEXT DEFAULT ''`
      );
      await this.pool.query(
        `ALTER TABLE ${ALFECODE_RUNS_TABLE}
         ADD COLUMN IF NOT EXISTS base_revision TEXT DEFAULT ''`
      );
      await this.pool.query(
        `ALTER TABLE ${ALFECODE_RUNS_TABLE}
         ADD COLUMN IF NOT EXISTS commit_revision TEXT DEFAULT ''`
      );
      await this.pool.query(
        `ALTER TABLE ${ALFECODE_RUNS_TABLE}
         ADD COLUMN IF NOT EXISTS run_directory TEXT DEFAULT ''`
      );
      await this.pool.query(
        `ALTER TABLE ${ALFECODE_RUNS_TABLE}
         ADD COLUMN IF NOT EXISTS script_status TEXT DEFAULT ''`
      );
      await this.pool.query(
        `UPDATE ${ACCOUNTS_TABLE}
         SET ever_subscribed = false
         WHERE ever_subscribed IS NULL`
      );
      await this.pool.query(
        `UPDATE ${ACCOUNTS_TABLE}
         SET disabled = false
         WHERE disabled IS NULL`
      );
      await this.pool.query(
        `ALTER TABLE ${ACCOUNTS_TABLE}
         ALTER COLUMN password_hash DROP NOT NULL`
      );
      await this.pool.query(`CREATE TABLE IF NOT EXISTS ${SUPPORT_REQUESTS_TABLE} (
        id SERIAL PRIMARY KEY,
        created_at TEXT NOT NULL,
        session_id TEXT DEFAULT '',
        account_id INTEGER,
        email TEXT DEFAULT '',
        category TEXT NOT NULL,
        message TEXT NOT NULL,
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
      await this.loadAllSessionRuns();
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

  async migrateFollowupParentIdColumn() {
    await this.pool.query(
      `ALTER TABLE ${ALFECODE_RUNS_TABLE}
       ADD COLUMN IF NOT EXISTS followup_parent_id TEXT DEFAULT ''`
    );

    await this.pool.query(
      `UPDATE ${ALFECODE_RUNS_TABLE}
       SET followup_parent_id = NULLIF(payload_json::jsonb ->> 'followupParentId', '')
       WHERE (followup_parent_id IS NULL OR followup_parent_id = '')
         AND payload_json IS NOT NULL
         AND payload_json <> ''
         AND jsonb_typeof(payload_json::jsonb) = 'object'
         AND COALESCE(payload_json::jsonb ->> 'followupParentId', '') <> ''`
    );
  }

  async loadAllSettings() {
    const result = await this.pool.query(`SELECT key, value FROM ${SETTINGS_TABLE}`);
    result.rows.forEach((row) => {
      this.settings.set(row.key, row.value);
    });
  }

  async loadAllSessionRuns() {
    const result = await this.pool.query(
      `SELECT session_id, status, script_status, followup_parent_id, payload_json
       FROM ${ALFECODE_RUNS_TABLE}
       ORDER BY updated_at DESC, numeric_id DESC NULLS LAST`
    );
    this.sessionRuns.clear();
    for (const row of result.rows || []) {
      if (!row || typeof row.session_id !== "string") continue;
      let parsed;
      try {
        parsed = JSON.parse(row.payload_json || "{}");
      } catch (error) {
        console.error("[RdsStore] Failed to parse run payload:", error?.message || error);
        continue;
      }
      if (!parsed || typeof parsed !== "object") continue;
      if (typeof row.status === "string" && row.status.trim()) {
        parsed.status = row.status;
      }
      if (typeof row.script_status === "string" && row.script_status.trim()) {
        parsed.scriptStatus = row.script_status;
      }
      if (typeof row.followup_parent_id === "string" && row.followup_parent_id.trim()) {
        parsed.followupParentId = row.followup_parent_id;
      }
      const existing = this.sessionRuns.get(row.session_id) || [];
      existing.push(parsed);
      this.sessionRuns.set(row.session_id, existing);
    }
  }

  getSetting(key) {
    return this.settings.get(key);
  }

  getSessionSetting(sessionId, key) {
    const sessionMap = this.sessionSettings.get(sessionId);
    return sessionMap ? sessionMap.get(key) : undefined;
  }

  getSessionRuns(sessionId) {
    const cached = this.sessionRuns.get(sessionId);
    if (!Array.isArray(cached)) {
      return undefined;
    }
    return cached.map((entry) => ({ ...entry }));
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

  setSessionRuns(sessionId, runs) {
    if (!this.enabled) return;
    const normalizedRuns = Array.isArray(runs) ? runs : [];
    const clonedRuns = normalizedRuns.map((entry) => ({ ...entry }));
    this.sessionRuns.set(sessionId, clonedRuns);

    const nextVersion = (this.sessionRunWriteVersions.get(sessionId) || 0) + 1;
    this.sessionRunWriteVersions.set(sessionId, nextVersion);

    const previousWrite = this.sessionRunWritePromises.get(sessionId) || Promise.resolve();
    const nextWrite = previousWrite
      .catch(() => {
        // Keep write queue moving even after previous failures.
      })
      .then(() => this.queueReplaceSessionRuns(sessionId, clonedRuns, nextVersion));

    this.sessionRunWritePromises.set(sessionId, nextWrite);

    nextWrite.finally(() => {
      if (this.sessionRunWritePromises.get(sessionId) === nextWrite) {
        this.sessionRunWritePromises.delete(sessionId);
      }
    });
  }

  prefetchSessionSetting(sessionId, key) {
    if (!this.enabled) return;
    const existing = this.getSessionSetting(sessionId, key);
    if (existing !== undefined) return;
    this.loadSessionSetting(sessionId, key);
  }

  prefetchSessionRuns(sessionId) {
    if (!this.enabled) return;
    if (this.sessionRuns.has(sessionId)) return;
    this.loadSessionRuns(sessionId);
  }

  async loadSessionSetting(sessionId, key) {
    await this.ensureReady();
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

  async loadSessionRuns(sessionId) {
    if (!this.enabled) return;
    await this.ensureReady();
    try {
      const result = await this.pool.query(
        `SELECT status, script_status, followup_parent_id, payload_json
         FROM ${ALFECODE_RUNS_TABLE}
         WHERE session_id = $1
         ORDER BY updated_at DESC, numeric_id DESC NULLS LAST`,
        [sessionId]
      );
      const parsedRuns = [];
      for (const row of result.rows || []) {
        try {
          const parsed = JSON.parse(row.payload_json || "{}");
          if (parsed && typeof parsed === "object") {
            if (typeof row.status === "string" && row.status.trim()) {
              parsed.status = row.status;
            }
            if (typeof row.script_status === "string" && row.script_status.trim()) {
              parsed.scriptStatus = row.script_status;
            }
            if (typeof row.followup_parent_id === "string" && row.followup_parent_id.trim()) {
              parsed.followupParentId = row.followup_parent_id;
            }
            parsedRuns.push(parsed);
          }
        } catch (parseError) {
          console.error("[RdsStore] Failed to parse run payload:", parseError?.message || parseError);
        }
      }
      this.sessionRuns.set(sessionId, parsedRuns);
    } catch (error) {
      console.error("[RdsStore] Failed to load session runs:", error?.message || error);
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

  async incrementSessionViewCount(sessionId, ipAddresses = {}, route = "") {
    if (!this.enabled || !sessionId) return;
    const ipv4 = typeof ipAddresses?.ipv4 === "string" ? ipAddresses.ipv4.trim() : "";
    const ipv6 = typeof ipAddresses?.ipv6 === "string" ? ipAddresses.ipv6.trim() : "";
    const pageRoute = typeof route === "string" ? route.trim() : "";
    const viewedAt = new Date().toISOString();
    try {
      // To prevent duplicate IP addresses, we use array_agg with distinct elements
      // This is a workaround for PostgreSQL not having native set operations for arrays
      await this.pool.query(
        `INSERT INTO ${SESSION_VIEWS_TABLE} (session_id, view_count, account_id, ipv4_address, ipv6_address)
         VALUES (
           $1,
           1,
           (SELECT id FROM ${ACCOUNTS_TABLE} WHERE session_id = $1 LIMIT 1),
           CASE WHEN $2 = '' THEN '{}'::TEXT[] ELSE ARRAY[$2] END,
           CASE WHEN $3 = '' THEN '{}'::TEXT[] ELSE ARRAY[$3] END
         )
         ON CONFLICT (session_id)
         DO UPDATE SET
           view_count = ${SESSION_VIEWS_TABLE}.view_count + 1,
           account_id = COALESCE(
             ${SESSION_VIEWS_TABLE}.account_id,
             (SELECT id FROM ${ACCOUNTS_TABLE} WHERE session_id = $1 LIMIT 1)
           ),
           ipv4_address = (
             SELECT array_agg(DISTINCT element)
             FROM unnest(
               array_cat(
                 COALESCE(NULLIF(${SESSION_VIEWS_TABLE}.ipv4_address::TEXT, ''), '{}')::TEXT[],
                 CASE WHEN $2 = '' THEN '{}'::TEXT[] ELSE ARRAY[$2] END
               )
             ) AS element
           ),
           ipv6_address = (
             SELECT array_agg(DISTINCT element)
             FROM unnest(
               array_cat(
                 COALESCE(NULLIF(${SESSION_VIEWS_TABLE}.ipv6_address::TEXT, ''), '{}')::TEXT[],
                 CASE WHEN $3 = '' THEN '{}'::TEXT[] ELSE ARRAY[$3] END
               )
             ) AS element
           )`,
        [sessionId, ipv4, ipv6]
      );
      await this.pool.query(
        `INSERT INTO ${PAGE_VIEWS_TABLE} (session_id, route, viewed_at, ipv4_address, ipv6_address)
         VALUES ($1, $2, $3, $4, $5)`,
        [sessionId, pageRoute, viewedAt, ipv4 ? [ipv4] : [], ipv6 ? [ipv6] : []]
      );
    } catch (error) {
      console.error("[RdsStore] Failed to increment session view count:", error?.message || error);
    }
  }

  async queueReplaceSessionRuns(sessionId, runs, version = null) {
    await this.ensureReady();
    if (Number.isFinite(version)) {
      const latestVersion = this.sessionRunWriteVersions.get(sessionId) || 0;
      if (version < latestVersion) {
        return;
      }
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `DELETE FROM ${ALFECODE_RUNS_TABLE} WHERE session_id = $1`,
        [sessionId]
      );

      // Get account_id from session
      const account = await this.getAccountBySession(sessionId);
      const accountId = account?.id || null;

      for (const run of runs) {
        if (!run || typeof run !== "object") {
          continue;
        }
        const runId = (run.id || run.runId || `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`).toString();
        const numericId = Number.isFinite(Number(run.numericId)) ? Number(run.numericId) : null;
        const status = typeof run.status === "string" ? run.status : "";
        const followupParentId = (
          run.followupParentId
          || run.followupParentRunId
          || run.followup_parent_id
          || run.followup_parent
          || ""
        ).toString().trim();
        const scriptStatus = typeof run.scriptStatus === "string"
          ? run.scriptStatus
          : (Array.isArray(run.statusHistory) && run.statusHistory.length
            ? String(run.statusHistory[run.statusHistory.length - 1] || "")
            : "");
        const finalOutputMessage = typeof run.finalOutputMessage === "string"
          ? run.finalOutputMessage
          : (typeof run.finalOutput === "string" ? run.finalOutput : "");
        const createdAt = typeof run.createdAt === "string" && run.createdAt.trim()
          ? run.createdAt
          : (typeof run.startedAt === "string" && run.startedAt.trim()
            ? run.startedAt
            : (typeof run.updatedAt === "string" && run.updatedAt.trim()
              ? run.updatedAt
              : new Date().toISOString()));
        const updatedAt = typeof run.updatedAt === "string"
          ? run.updatedAt
          : (typeof run.endedAt === "string" ? run.endedAt : (typeof run.createdAt === "string" ? run.createdAt : new Date().toISOString()));

        // Extract branch from run
        const branch = ((run.branchName || run.gitBranch || run.branch || '') ?? '').toString().trim();

        // Extract model from run
        const model = (run.model || run.modelId || '').toString().trim();

        const baseRevision = (run.baseRevision || run.base_revision || '').toString().trim();
        const commitRevision = (run.commitRevision || run.commit_revision || '').toString().trim();
        const runDirectory = (
          run.runDirectory
          || run.run_directory
          || run.effectiveProjectDir
          || run.projectDir
          || ''
        ).toString().trim();

        await client.query(
          `INSERT INTO ${ALFECODE_RUNS_TABLE}
           (session_id, run_id, numeric_id, followup_parent_id, status, script_status, final_output_message, created_at, updated_at, payload_json, account_id, branch, model, base_revision, commit_revision, run_directory)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
          [
            sessionId,
            runId,
            numericId,
            followupParentId,
            status,
            scriptStatus,
            finalOutputMessage,
            createdAt,
            updatedAt,
            JSON.stringify(run),
            accountId,
            branch,
            model,
            baseRevision,
            commitRevision,
            runDirectory,
          ]
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (_) {
        // no-op
      }
      console.error("[RdsStore] Failed to replace session runs:", error?.message || error);
    } finally {
      client.release();
    }
  }

  async getAccountByEmail(email) {
    if (!this.enabled) return null;
    await this.ensureReady();
    const normalized = (email || "").toString().trim().toLowerCase();
    if (!normalized) return null;
    try {
      const result = await this.pool.query(
        `SELECT id, email, password_hash, session_id, created_at, totp_secret, timezone, plan, ever_subscribed, openrouter_api_key, key_hash_id, disabled
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
        [normalized, typeof passwordHash === "string" && passwordHash ? passwordHash : null, sessionId || '', new Date().toISOString(), '', 'Free']
      );
      const created = result.rows[0] || null;
      if (created?.id && created?.session_id) {
        await this.pool.query(
          `INSERT INTO ${SESSION_VIEWS_TABLE} (session_id, view_count, account_id)
           VALUES ($1, 0, $2)
           ON CONFLICT (session_id)
           DO UPDATE SET account_id = EXCLUDED.account_id`,
          [created.session_id, created.id]
        );
      }
      return created;
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
         SET session_id = $1,
             last_log_in = $2
         WHERE id = $3`,
        [sessionId || "", new Date().toISOString(), id]
      );
      if (sessionId) {
        await this.pool.query(
          `INSERT INTO ${SESSION_VIEWS_TABLE} (session_id, view_count, account_id)
           VALUES ($1, 0, $2)
           ON CONFLICT (session_id)
           DO UPDATE SET account_id = EXCLUDED.account_id`,
          [sessionId, id]
        );
      }
    } catch (error) {
      console.error("[RdsStore] Failed to update account session:", error?.message || error);
    }
  }

  async setAccountLastLogin(id) {
    if (!this.enabled) return;
    await this.ensureReady();
    const lastLoginIso = new Date().toISOString();
    console.log("[RdsStore] setAccountLastLogin: updating account", {
      accountId: id,
      lastLoginIso,
    });
    try {
      const updateResult = await this.pool.query(
        `UPDATE ${ACCOUNTS_TABLE}
         SET last_log_in = $1
         WHERE id = $2`,
        [lastLoginIso, id]
      );
      console.log("[RdsStore] setAccountLastLogin: update query finished", {
        accountId: id,
        rowCount: updateResult?.rowCount ?? null,
      });
    } catch (error) {
      console.error("[RdsStore] Failed to update account last login:", {
        accountId: id,
        lastLoginIso,
        error: error?.message || error,
      });
    }
  }

  async createAccountLoginRecord(id, ipAddresses = {}, appName = 'AlfeCode') {
    if (!this.enabled) return;
    await this.ensureReady();
    const loggedInAtIso = new Date().toISOString();
    const ipv4 = typeof ipAddresses?.ipv4 === "string" ? ipAddresses.ipv4.trim() : "";
    const ipv6 = typeof ipAddresses?.ipv6 === "string" ? ipAddresses.ipv6.trim() : "";
    const app = typeof appName === "string" ? appName.trim() : "AlfeCode";
    console.log("[RdsStore] createAccountLoginRecord: writing login row", {
      accountId: id,
      loggedInAtIso,
      app,
      ipv4,
      ipv6,
    });

    try {
      const insertResult = await this.pool.query(
        `INSERT INTO ${LOG_INS_TABLE} (account_id, logged_in_at, app, ipv4_address, ipv6_address)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, loggedInAtIso, app || "AlfeCode", ipv4, ipv6]
      );
      console.log("[RdsStore] createAccountLoginRecord: insert finished", {
        accountId: id,
        rowCount: insertResult?.rowCount ?? null,
      });
    } catch (error) {
      console.error("[RdsStore] Failed to insert account login row:", {
        accountId: id,
        loggedInAtIso,
        error: error?.message || error,
      });
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

  async setAccountOpenrouterApiKey(id, openrouterApiKey, keyHashId = "") {
    if (!this.enabled) return;
    await this.ensureReady();
    try {
      await this.pool.query(
        `UPDATE ${ACCOUNTS_TABLE}
         SET openrouter_api_key = $1,
             key_hash_id = $2
         WHERE id = $3`,
        [
          (openrouterApiKey || "").toString().trim(),
          (keyHashId || "").toString().trim(),
          id,
        ]
      );
    } catch (error) {
      console.error("[RdsStore] Failed to update account OpenRouter API key:", error?.message || error);
    }
  }

  async getAccountBySession(sessionId) {
    if (!this.enabled) return null;
    await this.ensureReady();
    const normalized = (sessionId || "").toString().trim();
    if (!normalized) return null;
    try {
      const result = await this.pool.query(
        `SELECT id, email, password_hash, session_id, created_at, totp_secret, timezone, plan, ever_subscribed, openrouter_api_key, key_hash_id, disabled
         FROM ${ACCOUNTS_TABLE}
         WHERE session_id = $1
         LIMIT 1`,
        [normalized]
      );
      const account = result.rows[0] || null;
      if (account && account.disabled) {
        await this.pool.query(
          `UPDATE ${ACCOUNTS_TABLE}
           SET session_id = ''
           WHERE id = $1`,
          [account.id]
        );
        return null;
      }
      return account;
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
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO ${SESSION_SETTINGS_TABLE} (session_id, key, value)
         SELECT $1, key, value
         FROM ${SESSION_SETTINGS_TABLE}
         WHERE session_id = $2
         ON CONFLICT (session_id, key) DO UPDATE
         SET value = EXCLUDED.value`,
        [targetId, sourceId]
      );
      await client.query(`DELETE FROM ${SESSION_SETTINGS_TABLE} WHERE session_id = $1`, [sourceId]);
      await client.query(
        `WITH resolved_account AS (
           SELECT id
           FROM ${ACCOUNTS_TABLE}
           WHERE session_id = $1
           UNION
           SELECT id
           FROM ${ACCOUNTS_TABLE}
           WHERE session_id = $2
           LIMIT 1
         )
         UPDATE ${SESSION_VIEWS_TABLE}
         SET account_id = COALESCE(${SESSION_VIEWS_TABLE}.account_id, (SELECT id FROM resolved_account))
         WHERE session_id IN ($1, $2)`,
        [targetId, sourceId]
      );
      await client.query("COMMIT");
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("[RdsStore] Failed to rollback session merge:", rollbackError?.message || rollbackError);
      }
      console.error("[RdsStore] Failed to merge sessions:", error?.message || error);
    } finally {
      client.release();
    }
  }

  async createSupportRequest({ sessionId, accountId, email, category, message, status }) {
    if (!this.enabled) return null;
    await this.ensureReady();
    const normalizedCategory = (category || "").toString().trim();
    const normalizedMessage = (message || "").toString().trim();
    const normalizedStatus = (status || "").toString().trim() || SUPPORT_REQUEST_DEFAULT_STATUS;
    if (!normalizedCategory || !normalizedMessage) return null;
    try {
      const result = await this.pool.query(
        `INSERT INTO ${SUPPORT_REQUESTS_TABLE}
         (created_at, session_id, account_id, email, category, message, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, created_at, status`,
        [
          new Date().toISOString(),
          (sessionId || "").toString().trim(),
          accountId || null,
          (email || "").toString().trim().toLowerCase(),
          normalizedCategory,
          normalizedMessage,
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
      const replyableStatuses = [
        SUPPORT_REQUEST_DEFAULT_STATUS,
        SUPPORT_REQUEST_BUG_SUBMITTED_STATUS,
        SUPPORT_REQUEST_FEATURE_SUBMITTED_STATUS,
      ];
      const result = await this.pool.query(
        `UPDATE ${SUPPORT_REQUESTS_TABLE}
         SET status = $1
         WHERE id = $2 AND status = ANY($3)
         RETURNING id, status`,
        [SUPPORT_REQUEST_REPLIED_STATUS, normalizedRequestId, replyableStatuses]
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

  async getProjectViewProjects(sessionId) {
    if (!this.enabled) return null;
    await this.ensureReady();
    const normalizedSessionId = (sessionId || "").toString().trim();
    if (!normalizedSessionId) return null;
    try {
      const result = await this.pool.query(
        `SELECT projects_json FROM ${PROJECTVIEW_JSON_TABLE} WHERE session_id = $1`,
        [normalizedSessionId]
      );
      if (!result.rows.length) return null;
      const payload = result.rows[0].projects_json;
      return JSON.parse(payload || "[]");
    } catch (error) {
      console.error("[RdsStore] Failed to load ProjectView projects:", error?.message || error);
      return null;
    }
  }

  async setProjectViewProjects(sessionId, projects) {
    if (!this.enabled) return;
    await this.ensureReady();
    const normalizedSessionId = (sessionId || "").toString().trim();
    if (!normalizedSessionId) return;
    const payload = JSON.stringify(Array.isArray(projects) ? projects : []);
    const updatedAt = new Date().toISOString();
    try {
      await this.pool.query(
        `INSERT INTO ${PROJECTVIEW_JSON_TABLE} (session_id, projects_json, updated_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (session_id)
         DO UPDATE SET projects_json = EXCLUDED.projects_json, updated_at = EXCLUDED.updated_at`,
        [normalizedSessionId, payload, updatedAt]
      );
    } catch (error) {
      console.error("[RdsStore] Failed to save ProjectView projects:", error?.message || error);
      throw error;
    }
  }

  async getRunById(sessionId, runId) {
    if (!this.enabled) return null;
    await this.ensureReady();
    const normalizedSessionId = (sessionId || "").toString().trim();
    const normalizedRunId = (runId || "").toString().trim();
    if (!normalizedSessionId || !normalizedRunId) return null;
    try {
      const result = await this.pool.query(
        `SELECT * FROM ${ALFECODE_RUNS_TABLE}
         WHERE session_id = $1 AND run_id = $2
         LIMIT 1`,
        [normalizedSessionId, normalizedRunId]
      );
      if (!result.rows.length) return null;
      const row = result.rows[0];
      
      // Parse the payload JSON and add fields from the database
      let parsedRun;
      try {
        parsedRun = JSON.parse(row.payload_json || "{}");
      } catch (parseError) {
        console.error("[RdsStore] Failed to parse run payload:", parseError?.message || parseError);
        parsedRun = {};
      }
      
      // Add fields from the database that might not be in the payload
      if (typeof row.status === "string" && row.status.trim()) {
        parsedRun.status = row.status;
      }
      if (typeof row.script_status === "string" && row.script_status.trim()) {
        parsedRun.scriptStatus = row.script_status;
      }
      if (typeof row.final_output_message === "string" && row.final_output_message.trim()) {
        parsedRun.finalOutputMessage = row.final_output_message;
      }
      if (typeof row.created_at === "string" && row.created_at.trim()) {
        parsedRun.createdAt = row.created_at;
      }
      if (typeof row.updated_at === "string" && row.updated_at.trim()) {
        parsedRun.updatedAt = row.updated_at;
      }
      if (typeof row.model === "string" && row.model.trim()) {
        parsedRun.model = row.model;
      }
      if (typeof row.branch === "string" && row.branch.trim()) {
        parsedRun.branch = row.branch;
      }
      if (typeof row.base_revision === "string" && row.base_revision.trim()) {
        parsedRun.baseRevision = row.base_revision;
      }
      if (typeof row.commit_revision === "string" && row.commit_revision.trim()) {
        parsedRun.commitRevision = row.commit_revision;
      }
      if (typeof row.run_directory === "string" && row.run_directory.trim()) {
        parsedRun.runDirectory = row.run_directory;
      }
      if (typeof row.followup_parent_id === "string" && row.followup_parent_id.trim()) {
        parsedRun.followupParentId = row.followup_parent_id;
      }
      if (Number.isFinite(row.numeric_id)) {
        parsedRun.numericId = row.numeric_id;
      }
      if (Number.isFinite(row.account_id)) {
        parsedRun.accountId = row.account_id;
      }
      
      return parsedRun;
    } catch (error) {
      console.error("[RdsStore] Failed to load run by session and run id:", error?.message || error);
      return null;
    }
  }

  async getFollowupRunsByParent(sessionId, parentRunId) {
    if (!this.enabled) return [];
    await this.ensureReady();
    const normalizedSessionId = (sessionId || "").toString().trim();
    const normalizedParentRunId = (parentRunId || "").toString().trim();
    if (!normalizedSessionId || !normalizedParentRunId) return [];

    try {
      const result = await this.pool.query(
        `SELECT run_id, status, script_status, final_output_message, created_at, updated_at, payload_json, numeric_id, account_id, branch, model, base_revision, commit_revision, run_directory, followup_parent_id
         FROM ${ALFECODE_RUNS_TABLE}
         WHERE session_id = $1 AND followup_parent_id = $2
         ORDER BY updated_at ASC, numeric_id ASC NULLS LAST`,
        [normalizedSessionId, normalizedParentRunId]
      );

      return (result.rows || []).map((row) => {
        let parsedRun;
        try {
          parsedRun = JSON.parse(row.payload_json || "{}");
        } catch (_error) {
          parsedRun = {};
        }
        if (typeof row.run_id === "string" && row.run_id.trim()) parsedRun.id = row.run_id;
        if (typeof row.status === "string" && row.status.trim()) parsedRun.status = row.status;
        if (typeof row.script_status === "string" && row.script_status.trim()) parsedRun.scriptStatus = row.script_status;
        if (typeof row.final_output_message === "string" && row.final_output_message.trim()) parsedRun.finalOutputMessage = row.final_output_message;
        if (typeof row.created_at === "string" && row.created_at.trim()) parsedRun.createdAt = row.created_at;
        if (typeof row.updated_at === "string" && row.updated_at.trim()) parsedRun.updatedAt = row.updated_at;
        if (typeof row.model === "string" && row.model.trim()) parsedRun.model = row.model;
        if (typeof row.branch === "string" && row.branch.trim()) parsedRun.branch = row.branch;
        if (typeof row.base_revision === "string" && row.base_revision.trim()) parsedRun.baseRevision = row.base_revision;
        if (typeof row.commit_revision === "string" && row.commit_revision.trim()) parsedRun.commitRevision = row.commit_revision;
        if (typeof row.run_directory === "string" && row.run_directory.trim()) parsedRun.runDirectory = row.run_directory;
        if (typeof row.followup_parent_id === "string" && row.followup_parent_id.trim()) parsedRun.followupParentId = row.followup_parent_id;
        if (Number.isFinite(row.numeric_id)) parsedRun.numericId = row.numeric_id;
        if (Number.isFinite(row.account_id)) parsedRun.accountId = row.account_id;
        return parsedRun;
      });
    } catch (error) {
      console.error("[RdsStore] Failed to load follow-up runs by parent:", error?.message || error);
      return [];
    }
  }
}

module.exports = new RdsStore();
