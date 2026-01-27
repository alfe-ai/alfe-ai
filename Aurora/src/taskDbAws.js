import pg from 'pg';
import TaskDBLocal from './taskDb.js';

export default class TaskDBAws {
  constructor() {
    const {
      AWS_DB_URL,
      AWS_DB_HOST,
      AWS_DB_USER,
      AWS_DB_PASSWORD,
      AWS_DB_NAME,
      AWS_DB_PORT
    } = process.env;

    // Configure connection options with sensible defaults and SSL support.
    // Prefer a full connection string if provided, otherwise build from components.
    const poolConfig = {};
    if (AWS_DB_URL) {
      poolConfig.connectionString = AWS_DB_URL;
    } else {
      // Prefer IPv4 for localhost to avoid ::1/IPv6 connect-refused issues.
      const host = AWS_DB_HOST === '::1' ? '127.0.0.1' : AWS_DB_HOST;
      if (host) poolConfig.host = host;
      if (AWS_DB_USER) poolConfig.user = AWS_DB_USER;
      if (AWS_DB_PASSWORD) poolConfig.password = AWS_DB_PASSWORD;
      if (AWS_DB_NAME) poolConfig.database = AWS_DB_NAME;
      if (AWS_DB_PORT) poolConfig.port = parseInt(AWS_DB_PORT, 10);
    }

    // Optional SSL: set AWS_DB_SSL=true to enable default SSL, or set AWS_DB_SSL_MODE to 'require'.
    if (process.env.AWS_DB_SSL === 'true' || process.env.AWS_DB_SSL_MODE) {
      poolConfig.ssl = {
        rejectUnauthorized: process.env.AWS_DB_SSL_REJECT_UNAUTHORIZED !== 'false'
      };
      // If a custom CA bundle is provided via AWS_DB_SSL_CA, use it.
      if (process.env.AWS_DB_SSL_CA) {
        poolConfig.ssl.ca = process.env.AWS_DB_SSL_CA;
      }
    }

    this.pool = new pg.Pool(poolConfig);
    // Create a local sqlite-backed DB to provide the synchronous TaskDB API
    // expected elsewhere in the server. We only use it as a compatibility
    // fallback for synchronous methods not implemented by the AWS backend.
    this.local = new TaskDBLocal();
    // Proxy synchronous methods from the local DB onto this instance when not already present
    const proto = Object.getPrototypeOf(this.local);
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (name === 'constructor') continue;
      if (typeof this.local[name] === 'function' && !(name in this)) {
        this[name] = this.local[name].bind(this.local);
      }
    }
    this._initPromise = this._init().catch((err) => {
      console.error(
        '[TaskDBAws] Initialization failed, continuing without DB:',
        err && err.message ? err.message : err
      );
    });
  }

  async _init() {
    let client;
    try {
      client = await this.pool.connect();
    } catch (err) {
      console.error('[TaskDBAws] Failed to connect to DB:', err && err.message ? err.message : err);
      console.error('[TaskDBAws] Connection config:', JSON.stringify(this.pool.options || {}));
      return;
    }
    try {
      await client.query(`CREATE TABLE IF NOT EXISTS issues (
        id SERIAL PRIMARY KEY,
        github_id BIGINT UNIQUE,
        repository TEXT,
        number INTEGER,
        title TEXT,
        html_url TEXT,
        codex_url TEXT,
        task_id_slug TEXT,
        priority_number REAL,
        priority TEXT DEFAULT 'Medium',
        hidden INTEGER DEFAULT 0,
        project TEXT DEFAULT '',
        sprint TEXT DEFAULT '',
        fib_points INTEGER,
        assignee TEXT,
        created_at TEXT,
        closed INTEGER DEFAULT 0,
        status TEXT DEFAULT 'Not Started',
        dependencies TEXT DEFAULT '',
        blocking TEXT DEFAULT ''
      );`);

      await client.query(`CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );`);

      await client.query(`CREATE TABLE IF NOT EXISTS session_settings (
        session_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        PRIMARY KEY (session_id, key)
      );`);

      await client.query(`CREATE TABLE IF NOT EXISTS accounts (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        session_id TEXT DEFAULT '',
        created_at TEXT NOT NULL,
        totp_secret TEXT DEFAULT '',
        timezone TEXT DEFAULT '',
        plan TEXT DEFAULT 'Free'
      );`);

    } finally {
      client.release();
    }
  }

  async upsertIssue(issue, repositorySlug) {
    const { rows } = await this.pool.query(
      'SELECT priority_number, priority, project, sprint, status, dependencies, blocking, codex_url FROM issues WHERE github_id = $1',
      [issue.id]
    );
    const existing = rows[0];
    let priorityNum = existing?.priority_number;
    if (!priorityNum) {
      const res = await this.pool.query('SELECT MAX(priority_number) AS m FROM issues');
      const max = res.rows[0].m || 0;
      priorityNum = max + 1;
    }
    const row = {
      github_id: issue.id,
      repository: repositorySlug,
      number: issue.number,
      title: issue.title,
      html_url: issue.html_url,
      codex_url: existing?.codex_url ?? null,
      task_id_slug: `${repositorySlug}#${issue.number}`,
      priority_number: priorityNum,
      priority: existing?.priority ?? 'Medium',
      hidden: 0,
      project: existing?.project ?? null,
      sprint: existing?.sprint ?? null,
      fib_points: null,
      assignee: issue.assignee?.login || null,
      created_at: issue.created_at,
      closed: 0,
      status: existing?.status ?? 'Not Started',
      dependencies: existing?.dependencies ?? '',
      blocking: existing?.blocking ?? ''
    };
    await this.pool.query(
      `INSERT INTO issues (
        github_id, repository, number, title, html_url, codex_url,
        task_id_slug, priority_number, priority, hidden,
        project, sprint, fib_points, assignee, created_at, closed, status,
        dependencies, blocking
      ) VALUES (
        $1,$2,$3,$4,$5,$6,
        $7,$8,$9,$10,
        $11,$12,$13,$14,$15,$16,$17,
        $18,$19
      )
      ON CONFLICT(github_id) DO UPDATE SET
        repository      = excluded.repository,
        number          = excluded.number,
        title           = excluded.title,
        html_url        = excluded.html_url,
        task_id_slug    = excluded.task_id_slug,
        priority_number = excluded.priority_number,
        priority        = excluded.priority,
        assignee        = excluded.assignee,
        created_at      = excluded.created_at,
        closed          = 0,
        status          = issues.status,
        dependencies    = issues.dependencies,
        blocking        = issues.blocking`,
      [
        row.github_id,
        row.repository,
        row.number,
        row.title,
        row.html_url,
        row.codex_url,
        row.task_id_slug,
        row.priority_number,
        row.priority,
        row.hidden,
        row.project,
        row.sprint,
        row.fib_points,
        row.assignee,
        row.created_at,
        row.closed,
        row.status,
        row.dependencies,
        row.blocking
      ]
    );
  }

  async markClosedExcept(openGithubIds) {
    let client;
    try {
      client = await this.pool.connect();
    } catch (err) {
      console.error('[TaskDBAws] Failed to connect to DB:', err && err.message ? err.message : err);
      console.error('[TaskDBAws] Connection config:', JSON.stringify(this.pool.options || {}));
      throw err;
    }
    try {
      // Only auto-close tasks that originated from GitHub.
      // Locally created tasks have a NULL github_id and should not be affected.
      if (!openGithubIds.length) {
        await client.query('UPDATE issues SET closed = 1 WHERE github_id IS NOT NULL AND closed = 0');
      } else {
        const placeholders = openGithubIds.map((_, i) => `$${i + 1}`).join(',');
        await client.query(
          `UPDATE issues SET closed = 1 WHERE github_id IS NOT NULL AND github_id NOT IN (${placeholders})`,
          openGithubIds
        );
      }
    } finally {
      client.release();
    }
  }

  getSetting(key) {
    const localValue = this.local.getSetting(key);
    if (typeof localValue !== 'undefined') {
      return localValue;
    }
    void this.getSettingAsync(key)
        .then((value) => {
          if (typeof value !== 'undefined') {
            this.local.setSetting(key, value);
          }
        })
        .catch((err) => {
          console.warn('[TaskDBAws] Failed to refresh setting from RDS:', err);
        });
    return undefined;
  }

  setSetting(key, value) {
    this.local.setSetting(key, value);
    void this.setSettingAsync(key, value).catch((err) => {
      console.warn('[TaskDBAws] Failed to persist setting to RDS:', err);
    });
  }

  getSessionSetting(sessionId, key) {
    if (!sessionId) {
      return this.getSetting(key);
    }
    const localValue = this.local.getSessionSetting(sessionId, key);
    if (typeof localValue !== 'undefined') {
      return localValue;
    }
    void this.getSessionSettingAsync(sessionId, key)
        .then((value) => {
          if (typeof value !== 'undefined') {
            this.local.setSessionSetting(sessionId, key, value);
          }
        })
        .catch((err) => {
          console.warn('[TaskDBAws] Failed to refresh session setting from RDS:', err);
        });
    return undefined;
  }

  setSessionSetting(sessionId, key, value) {
    if (!sessionId) {
      this.setSetting(key, value);
      return;
    }
    this.local.setSessionSetting(sessionId, key, value);
    void this.setSessionSettingAsync(sessionId, key, value).catch((err) => {
      console.warn('[TaskDBAws] Failed to persist session setting to RDS:', err);
    });
  }

  async getSettingAsync(key) {
    const { rows } = await this.pool.query('SELECT value FROM settings WHERE key = $1', [key]);
    if (!rows.length) return undefined;
    try {
      return JSON.parse(rows[0].value);
    } catch {
      return rows[0].value;
    }
  }

  async setSettingAsync(key, value) {
    const val = JSON.stringify(value);
    await this.pool.query(
      'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
      [key, val]
    );
  }

  async getSessionSettingAsync(sessionId, key) {
    if (!sessionId) {
      return this.getSettingAsync(key);
    }
    const { rows } = await this.pool.query(
      'SELECT value FROM session_settings WHERE session_id = $1 AND key = $2',
      [sessionId, key]
    );
    if (!rows.length) return undefined;
    try {
      return JSON.parse(rows[0].value);
    } catch {
      return rows[0].value;
    }
  }

  async setSessionSettingAsync(sessionId, key, value) {
    if (!sessionId) {
      await this.setSettingAsync(key, value);
      return;
    }
    const val = JSON.stringify(value);
    await this.pool.query(
      `INSERT INTO session_settings (session_id, key, value)
       VALUES ($1, $2, $3)
       ON CONFLICT (session_id, key) DO UPDATE SET value = EXCLUDED.value`,
      [sessionId, key, val]
    );
  }

  async createAccount(email, passwordHash, sessionId = '', timezone = '', plan = 'Free') {
    const ts = new Date().toISOString();
    const { rows } = await this.pool.query(
      `INSERT INTO accounts (email, password_hash, session_id, created_at, timezone, plan)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [email, passwordHash, sessionId, ts, timezone, plan]
    );
    return rows[0]?.id;
  }

  async getAccountByEmail(email) {
    const { rows } = await this.pool.query('SELECT * FROM accounts WHERE email = $1', [email]);
    return rows[0] || null;
  }

  async setAccountSession(id, sessionId) {
    await this.pool.query('UPDATE accounts SET session_id = $1 WHERE id = $2', [sessionId, id]);
  }

  async setAccountTotpSecret(id, secret) {
    await this.pool.query('UPDATE accounts SET totp_secret = $1 WHERE id = $2', [secret, id]);
  }

  async setAccountTimezone(id, timezone) {
    await this.pool.query('UPDATE accounts SET timezone = $1 WHERE id = $2', [timezone, id]);
  }

  async setAccountPlan(id, plan) {
    await this.pool.query('UPDATE accounts SET plan = $1 WHERE id = $2', [plan, id]);
  }

  async setAccountPassword(id, passwordHash) {
    await this.pool.query('UPDATE accounts SET password_hash = $1 WHERE id = $2', [passwordHash, id]);
  }

  async getAccountBySession(sessionId) {
    if (!sessionId) return null;
    const { rows } = await this.pool.query('SELECT * FROM accounts WHERE session_id = $1', [sessionId]);
    return rows[0] || null;
  }

  async createTask(title, project = '', sprint = '') {
    let client;
    try {
      client = await this.pool.connect();
    } catch (err) {
      console.error('[TaskDBAws] Failed to connect to DB:', err && err.message ? err.message : err);
      console.error('[TaskDBAws] Connection config:', JSON.stringify(this.pool.options || {}));
      throw err;
    }
    try {
      const { rows } = await client.query('SELECT MAX(priority_number) AS m FROM issues');
      const priority_number = (rows[0].m || 0) + 1;
      const numRes = await client.query('SELECT MAX(number) AS m FROM issues');
      const number = (numRes.rows[0].m || 0) + 1;
      const created_at = new Date().toISOString();
      const { rows: inserted } = await client.query(
        `INSERT INTO issues (
           github_id, repository, number, title, html_url, codex_url,
           task_id_slug, priority_number, priority, hidden,
           project, sprint, fib_points, assignee, created_at, closed, status,
           dependencies, blocking
         ) VALUES (
           NULL, 'local', $1, $2, '#', '',
           $3, $4, 'Medium', 0,
           $5, $6, NULL, NULL, $7, 0, 'Not Started',
           '', ''
         ) RETURNING id`,
        [number, title, `local#${number}`, priority_number, project, sprint, created_at]
      );
      return inserted[0].id;
    } finally {
      client.release();
    }
  }

  async setTitle(id, newTitle) {
    await this.pool.query('UPDATE issues SET title=$1 WHERE id=$2', [newTitle, id]);
  }

  async setCodexUrl(id, url) {
    await this.pool.query('UPDATE issues SET codex_url=$1 WHERE id=$2', [url, id]);
  }

  ensureDesignChatTab() {
    throw new Error('Design chat tab is not supported for the AWS task DB backend.');
  }

  // Placeholder methods for the rest of the TaskDB API used by server.js
  // Not fully implemented in this initial AWS port.
}
