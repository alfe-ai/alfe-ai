import pg from 'pg';
import { randomUUID } from 'crypto';

class LocalSettingsCache {
  constructor() {
    this.settings = new Map();
    this.sessionSettings = new Map();
  }

  getSetting(key) {
    return this.settings.get(key);
  }

  setSetting(key, value) {
    this.settings.set(key, value);
  }

  getSessionSetting(sessionId, key) {
    if (!sessionId) {
      return this.getSetting(key);
    }
    return this.sessionSettings.get(sessionId)?.get(key);
  }

  setSessionSetting(sessionId, key, value) {
    if (!sessionId) {
      this.setSetting(key, value);
      return;
    }
    let store = this.sessionSettings.get(sessionId);
    if (!store) {
      store = new Map();
      this.sessionSettings.set(sessionId, store);
    }
    store.set(key, value);
  }
}

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

    this._dbPrintsEnabled = process.env.DB_PRINTS === 'true';
    this.pool = new pg.Pool(poolConfig);
    this._enableDbLogging();
    this.local = new LocalSettingsCache();
    this.projectCache = new Map();
    this.activityCache = [];
    this.imageSessionStartCache = new Map();
    this.imageCountCache = new Map();
    this.ipImageCountCache = new Map();
    this.searchCountCache = new Map();
    this.ipSearchCountCache = new Map();
    this.imageTitleCache = new Map();
    this.imageStatusCache = new Map();
    this.imagePortfolioCache = new Map();
    this.imageIdCache = new Map();
    this.imageModelCache = new Map();
    this.imageUuidCache = new Map();
    this.imageGeneratedCache = new Map();
    this.productUrlCache = new Map();
    this.ebayUrlCache = new Map();
    this.sprintCache = null;
    this._initPromise = this._init().catch((err) => {
      console.error(
        '[TaskDBAws] Initialization failed, continuing without DB:',
        err && err.message ? err.message : err
      );
    });
  }

  _enableDbLogging() {
    if (!this._dbPrintsEnabled) return;
    const originalPoolQuery = this.pool.query.bind(this.pool);
    this.pool.query = (...args) => {
      this._logDbQuery('pool.query', args);
      return originalPoolQuery(...args);
    };

    const originalConnect = this.pool.connect.bind(this.pool);
    this.pool.connect = async (...args) => {
      const client = await originalConnect(...args);
      this._wrapClientForLogging(client);
      return client;
    };
  }

  _wrapClientForLogging(client) {
    if (!client || !this._dbPrintsEnabled || client.__dbPrintsWrapped) return;
    const originalClientQuery = client.query.bind(client);
    client.query = (...args) => {
      this._logDbQuery('client.query', args);
      return originalClientQuery(...args);
    };
    client.__dbPrintsWrapped = true;
  }

  _logDbQuery(source, args) {
    if (!this._dbPrintsEnabled) return;
    const [text, params] = args;
    if (typeof text === 'string') {
      console.log(`[TaskDBAws DB_PRINTS] ${source}`, text, Array.isArray(params) ? params : []);
      return;
    }
    if (text && typeof text.text === 'string') {
      console.log(
        `[TaskDBAws DB_PRINTS] ${source}`,
        text.text,
        Array.isArray(text.values) ? text.values : []
      );
    }
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

      await client.query(`CREATE TABLE IF NOT EXISTS activity_timeline (
        id SERIAL PRIMARY KEY,
        timestamp TEXT NOT NULL,
        action TEXT NOT NULL,
        details TEXT
      );`);

      await client.query(`CREATE TABLE IF NOT EXISTS chat_tabs (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        archived INTEGER DEFAULT 0,
        archived_at TEXT,
        generate_images INTEGER DEFAULT 1,
        nexum INTEGER DEFAULT 0,
        project_name TEXT DEFAULT '',
        repo_ssh_url TEXT DEFAULT '',
        extra_projects TEXT DEFAULT '',
        task_id INTEGER DEFAULT 0,
        parent_id INTEGER DEFAULT 0,
        model_override TEXT DEFAULT '',
        tab_type TEXT DEFAULT 'chat',
        send_project_context INTEGER DEFAULT 1,
        session_id TEXT DEFAULT '',
        tab_uuid TEXT DEFAULT '',
        chatgpt_url TEXT DEFAULT '',
        show_in_sidebar INTEGER DEFAULT 1,
        favorite INTEGER DEFAULT 0,
        path_alias TEXT DEFAULT ''
      );`);

      await client.query(`CREATE TABLE IF NOT EXISTS chat_pairs (
        id SERIAL PRIMARY KEY,
        user_text TEXT NOT NULL,
        ai_text TEXT,
        model TEXT,
        timestamp TEXT NOT NULL,
        ai_timestamp TEXT,
        chat_tab_id INTEGER DEFAULT 1,
        system_context TEXT,
        project_context TEXT,
        token_info TEXT,
        citations_json TEXT,
        image_url TEXT,
        image_alt TEXT DEFAULT '',
        image_title TEXT DEFAULT '',
        image_status TEXT DEFAULT '',
        session_id TEXT DEFAULT '',
        ip_address TEXT DEFAULT '',
        image_uuid TEXT DEFAULT '',
        publish_portfolio INTEGER DEFAULT 0,
        product_url TEXT DEFAULT '',
        ebay_url TEXT DEFAULT '',
        image_hidden INTEGER DEFAULT 0
      );`);

      await client.query(`CREATE TABLE IF NOT EXISTS chat_subroutines (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        trigger_text TEXT DEFAULT '',
        action_text TEXT DEFAULT '',
        action_hook TEXT DEFAULT '',
        created_at TEXT NOT NULL
      );`);

      await client.query(`CREATE TABLE IF NOT EXISTS image_sessions (
        session_id TEXT PRIMARY KEY,
        start_time TEXT NOT NULL
      );`);

      await client.query(`CREATE TABLE IF NOT EXISTS upscaled_images (
        original TEXT PRIMARY KEY,
        upscaled TEXT NOT NULL
      );`);

      await client.query(`CREATE TABLE IF NOT EXISTS feedback (
        id SERIAL PRIMARY KEY,
        message TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'misc',
        timestamp TEXT NOT NULL
      );`);

      await client.query(`CREATE TABLE IF NOT EXISTS project_branches (
        project TEXT PRIMARY KEY,
        base_branch TEXT DEFAULT ''
      );`);

      await client.query(`CREATE TABLE IF NOT EXISTS project_meta (
        project TEXT PRIMARY KEY,
        archived INTEGER DEFAULT 0
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

      await client.query(`CREATE TABLE IF NOT EXISTS upwork_jobs (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        link TEXT DEFAULT '',
        bid TEXT DEFAULT '',
        status TEXT DEFAULT 'Bidding',
        notes TEXT DEFAULT ''
      );`);

      await client.query(`CREATE TABLE IF NOT EXISTS amazon_skus (
        id SERIAL PRIMARY KEY,
        sku TEXT UNIQUE,
        asin TEXT,
        title TEXT DEFAULT '',
        created_at TEXT NOT NULL
      );`);

      await client.query(`CREATE TABLE IF NOT EXISTS sterlingproxy (
        id SERIAL PRIMARY KEY,
        session_id TEXT NOT NULL,
        ip_address TEXT DEFAULT '',
        start_timestamp TEXT NOT NULL,
        last_used_timestamp TEXT NOT NULL,
        status TEXT DEFAULT 'Running',
        assigned_port INTEGER DEFAULT NULL,
        runs INTEGER DEFAULT 0
      );`);

      await client.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_issues_github ON issues(github_id);');
      await client.query('CREATE INDEX IF NOT EXISTS idx_issues_priority ON issues(priority_number);');
      await client.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_tabs_uuid ON chat_tabs(tab_uuid);');

      await client.query("ALTER TABLE issues ADD COLUMN IF NOT EXISTS codex_url TEXT;");
      await client.query("ALTER TABLE chat_tabs ADD COLUMN IF NOT EXISTS archived INTEGER DEFAULT 0;");
      await client.query("ALTER TABLE chat_tabs ADD COLUMN IF NOT EXISTS archived_at TEXT;");
      await client.query("ALTER TABLE chat_tabs ADD COLUMN IF NOT EXISTS generate_images INTEGER DEFAULT 1;");
      await client.query("ALTER TABLE chat_tabs ADD COLUMN IF NOT EXISTS nexum INTEGER DEFAULT 0;");
      await client.query("ALTER TABLE chat_tabs ADD COLUMN IF NOT EXISTS project_name TEXT DEFAULT '';");
      await client.query("ALTER TABLE chat_tabs ADD COLUMN IF NOT EXISTS repo_ssh_url TEXT DEFAULT '';");
      await client.query("ALTER TABLE chat_tabs ADD COLUMN IF NOT EXISTS extra_projects TEXT DEFAULT '';");
      await client.query("ALTER TABLE chat_tabs ADD COLUMN IF NOT EXISTS task_id INTEGER DEFAULT 0;");
      await client.query("ALTER TABLE chat_tabs ADD COLUMN IF NOT EXISTS parent_id INTEGER DEFAULT 0;");
      await client.query("ALTER TABLE chat_tabs ADD COLUMN IF NOT EXISTS model_override TEXT DEFAULT '';");
      await client.query("ALTER TABLE chat_tabs ADD COLUMN IF NOT EXISTS tab_type TEXT DEFAULT 'chat';");
      await client.query("ALTER TABLE chat_tabs ADD COLUMN IF NOT EXISTS send_project_context INTEGER DEFAULT 1;");
      await client.query("ALTER TABLE chat_tabs ADD COLUMN IF NOT EXISTS session_id TEXT DEFAULT '';");
      await client.query("ALTER TABLE chat_tabs ADD COLUMN IF NOT EXISTS tab_uuid TEXT DEFAULT '';");
      await client.query("ALTER TABLE chat_tabs ADD COLUMN IF NOT EXISTS chatgpt_url TEXT DEFAULT '';");
      await client.query("ALTER TABLE chat_tabs ADD COLUMN IF NOT EXISTS show_in_sidebar INTEGER DEFAULT 1;");
      await client.query("ALTER TABLE chat_tabs ADD COLUMN IF NOT EXISTS favorite INTEGER DEFAULT 0;");
      await client.query("ALTER TABLE chat_tabs ADD COLUMN IF NOT EXISTS path_alias TEXT DEFAULT '';");

      await client.query("ALTER TABLE chat_pairs ADD COLUMN IF NOT EXISTS citations_json TEXT;");
      await client.query("ALTER TABLE chat_pairs ADD COLUMN IF NOT EXISTS image_url TEXT;");
      await client.query("ALTER TABLE chat_pairs ADD COLUMN IF NOT EXISTS image_alt TEXT DEFAULT '';");
      await client.query("ALTER TABLE chat_pairs ADD COLUMN IF NOT EXISTS image_title TEXT DEFAULT '';");
      await client.query("ALTER TABLE chat_pairs ADD COLUMN IF NOT EXISTS image_status TEXT DEFAULT '';");
      await client.query("ALTER TABLE chat_pairs ADD COLUMN IF NOT EXISTS session_id TEXT DEFAULT '';");
      await client.query("ALTER TABLE chat_pairs ADD COLUMN IF NOT EXISTS ip_address TEXT DEFAULT '';");
      await client.query("ALTER TABLE chat_pairs ADD COLUMN IF NOT EXISTS image_uuid TEXT DEFAULT '';");
      await client.query("ALTER TABLE chat_pairs ADD COLUMN IF NOT EXISTS publish_portfolio INTEGER DEFAULT 0;");
      await client.query("ALTER TABLE chat_pairs ADD COLUMN IF NOT EXISTS product_url TEXT DEFAULT '';");
      await client.query("ALTER TABLE chat_pairs ADD COLUMN IF NOT EXISTS ebay_url TEXT DEFAULT '';");
      await client.query("ALTER TABLE chat_pairs ADD COLUMN IF NOT EXISTS project_context TEXT;");
      await client.query("ALTER TABLE chat_pairs ADD COLUMN IF NOT EXISTS image_hidden INTEGER DEFAULT 0;");

      await client.query("ALTER TABLE chat_subroutines ADD COLUMN IF NOT EXISTS trigger_text TEXT DEFAULT '';");
      await client.query("ALTER TABLE chat_subroutines ADD COLUMN IF NOT EXISTS action_text TEXT DEFAULT '';");
      await client.query("ALTER TABLE chat_subroutines ADD COLUMN IF NOT EXISTS action_hook TEXT DEFAULT '';");

      await client.query("ALTER TABLE feedback ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'misc';");
      await client.query("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS totp_secret TEXT DEFAULT '';");
      await client.query("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT '';");
      await client.query("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'Free';");
      await client.query("ALTER TABLE sterlingproxy ADD COLUMN IF NOT EXISTS runs INTEGER DEFAULT 0;");

    } finally {
      client.release();
    }
  }

  async listTables() {
    await this._initPromise;
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name"
      );
      return result.rows.map((row) => row.table_name);
    } finally {
      client.release();
    }
  }

  async getTableData(tableName, limit = 200) {
    const tables = await this.listTables();
    if (!tables.includes(tableName)) {
      throw new Error(`Unknown table: ${tableName}`);
    }
    const client = await this.pool.connect();
    try {
      const columnResult = await client.query(
        "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position",
        [tableName]
      );
      const columns = columnResult.rows.map((row) => row.column_name);
      const safeName = `"${tableName.replace(/"/g, '""')}"`;
      const dataResult = await client.query(
        `SELECT * FROM ${safeName} LIMIT $1`,
        [limit]
      );
      return {
        columns,
        rows: dataResult.rows,
        limit,
        rowCount: dataResult.rows.length
      };
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

  async listTasks(includeHidden = false) {
    await this._initPromise;
    const baseSql = includeHidden
      ? 'SELECT * FROM issues WHERE closed = 0 ORDER BY priority_number'
      : 'SELECT * FROM issues WHERE closed = 0 AND hidden = 0 ORDER BY priority_number';
    const { rows } = await this.pool.query(baseSql);
    return rows;
  }

  async getTaskById(id) {
    await this._initPromise;
    const { rows } = await this.pool.query('SELECT * FROM issues WHERE id = $1', [id]);
    return rows[0];
  }

  async listTasksByProject(project) {
    await this._initPromise;
    const { rows } = await this.pool.query(
      'SELECT * FROM issues WHERE project = $1 AND closed = 0 ORDER BY priority_number',
      [project]
    );
    return rows;
  }

  async listTasksBySprint(sprint) {
    await this._initPromise;
    const { rows } = await this.pool.query(
      'SELECT * FROM issues WHERE sprint = $1 AND closed = 0 ORDER BY priority_number',
      [sprint]
    );
    return rows;
  }

  async createChatTab(
    name,
    nexum = 0,
    project = '',
    repo = '',
    extraProjects = '',
    taskId = 0,
    type = 'chat',
    sessionId = '',
    sendProjectContext = 0,
    chatgptUrl = '',
    showInSidebar = 1,
    pathAlias = ''
  ) {
    await this._initPromise;
    const ts = new Date().toISOString();
    const genImages = type === 'design' ? 1 : 0;
    const uuid = randomUUID().replace(/-/g, '').slice(0, 12);
    const { rows } = await this.pool.query(
      `INSERT INTO chat_tabs (
         name, created_at, generate_images, nexum, project_name, repo_ssh_url,
         extra_projects, task_id, tab_type, send_project_context, session_id,
         tab_uuid, chatgpt_url, show_in_sidebar, favorite, path_alias
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10, $11,
         $12, $13, $14, $15, $16
       )
       RETURNING id, tab_uuid`,
      [
        name,
        ts,
        genImages,
        nexum ? 1 : 0,
        project,
        repo,
        extraProjects,
        taskId,
        type,
        sendProjectContext ? 1 : 0,
        sessionId,
        uuid,
        chatgptUrl,
        showInSidebar ? 1 : 0,
        0,
        pathAlias
      ]
    );
    return { id: rows[0]?.id, uuid: rows[0]?.tab_uuid || uuid };
  }

  async listChatTabs(nexum = null, includeArchived = true, sessionId = '') {
    await this._initPromise;
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (sessionId) {
      conditions.push(`session_id = $${paramIndex++}`);
      params.push(sessionId);
    }
    if (nexum !== null) {
      conditions.push(`nexum = $${paramIndex++}`);
      params.push(nexum ? 1 : 0);
    }
    if (!includeArchived) {
      conditions.push('archived = 0');
    }

    let query = 'SELECT * FROM chat_tabs';
    if (conditions.length) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }
    query += ' ORDER BY id DESC';

    const { rows } = await this.pool.query(query, params);
    return rows;
  }

  setChatTabArchived(tabId, archived = 1) {
    void this.setChatTabArchivedAsync(tabId, archived).catch((err) => {
      console.warn('[TaskDBAws] Failed to update chat tab archived state:', err);
    });
  }

  renameChatTab(tabId, newName) {
    void this.renameChatTabAsync(tabId, newName).catch((err) => {
      console.warn('[TaskDBAws] Failed to rename chat tab:', err);
    });
  }

  async setChatTabArchivedAsync(tabId, archived = 1) {
    await this._initPromise;
    const isArchived = archived ? 1 : 0;
    const archivedAt = isArchived ? new Date().toISOString() : null;
    await this.pool.query(
      'UPDATE chat_tabs SET archived = $1, archived_at = $2 WHERE id = $3',
      [isArchived, archivedAt, tabId]
    );
  }

  async renameChatTabAsync(tabId, newName) {
    await this._initPromise;
    await this.pool.query(
      'UPDATE chat_tabs SET name = $1 WHERE id = $2',
      [newName, tabId]
    );
  }

  setChatTabFavorite(tabId, favorite = 1) {
    void this.setChatTabFavoriteAsync(tabId, favorite).catch((err) => {
      console.warn('[TaskDBAws] Failed to update chat tab favorite state:', err);
    });
  }

  async setChatTabFavoriteAsync(tabId, favorite = 1) {
    await this._initPromise;
    await this.pool.query(
      'UPDATE chat_tabs SET favorite = $1 WHERE id = $2',
      [favorite ? 1 : 0, tabId]
    );
  }

  async getChatTab(tabId, sessionId = null) {
    await this._initPromise;
    if (sessionId) {
      const { rows } = await this.pool.query(
        'SELECT * FROM chat_tabs WHERE id = $1 AND session_id = $2',
        [tabId, sessionId]
      );
      return rows[0] || null;
    }
    const { rows } = await this.pool.query(
      'SELECT * FROM chat_tabs WHERE id = $1',
      [tabId]
    );
    return rows[0] || null;
  }

  async getChatPairsPage(tabId = 1, limit = 10, offset = 0) {
    try {
      await this._initPromise;
      const { rows } = await this.pool.query(
        `SELECT * FROM chat_pairs
         WHERE chat_tab_id = $1
         ORDER BY id DESC
         LIMIT $2
         OFFSET $3`,
        [tabId, limit, offset]
      );
      return rows;
    } catch (err) {
      console.warn('[TaskDBAws] Failed to load chat pairs page:', err);
      return [];
    }
  }

  async createChatPair(
      userText,
      chatTabId = 1,
      systemContext = "",
      projectContext = "",
      sessionId = "",
      ipAddress = ""
  ) {
    await this._initPromise;
    const timestamp = new Date().toISOString();
    const { rows } = await this.pool.query(
      `INSERT INTO chat_pairs (
         user_text, ai_text, model, timestamp, ai_timestamp,
         chat_tab_id, system_context, project_context, token_info,
         citations_json, image_url, image_alt, image_title, session_id, ip_address
       )
       VALUES (
         $1, '', '', $2, NULL,
         $3, $4, $5, NULL,
         NULL, NULL, '', '', $6, $7
       )
       RETURNING id`,
      [
        userText,
        timestamp,
        chatTabId,
        systemContext,
        projectContext,
        sessionId,
        ipAddress
      ]
    );
    return rows[0]?.id ?? null;
  }

  async finalizeChatPair(id, aiText, model, aiTimestamp, tokenInfo = null, citationsJson = null) {
    await this._initPromise;
    await this.pool.query(
      `UPDATE chat_pairs
       SET ai_text = $1,
           model = $2,
           ai_timestamp = $3,
           token_info = $4,
           citations_json = $5
       WHERE id = $6`,
      [aiText, model, aiTimestamp, tokenInfo, citationsJson, id]
    );
  }

  async getPairById(id) {
    await this._initPromise;
    const { rows } = await this.pool.query(
      'SELECT * FROM chat_pairs WHERE id = $1',
      [id]
    );
    return rows[0] || null;
  }

  async getAllChatPairs(tabId = 1) {
    await this._initPromise;
    const { rows } = await this.pool.query(
      'SELECT * FROM chat_pairs WHERE chat_tab_id = $1 ORDER BY id ASC',
      [tabId]
    );
    return rows;
  }

  deleteChatTab(tabId) {
    void this.deleteChatTabAsync(tabId).catch((err) => {
      console.warn('[TaskDBAws] Failed to delete chat tab:', err);
    });
  }

  async deleteChatTabAsync(tabId) {
    await this._initPromise;
    await this.pool.query('DELETE FROM chat_pairs WHERE chat_tab_id = $1', [tabId]);
    await this.pool.query('DELETE FROM chat_tabs WHERE id = $1', [tabId]);
  }

  deleteChatPair(id) {
    void this.deleteChatPairAsync(id).catch((err) => {
      console.warn('[TaskDBAws] Failed to delete chat pair:', err);
    });
  }

  async deleteChatPairAsync(id) {
    await this._initPromise;
    await this.pool.query('DELETE FROM chat_pairs WHERE id = $1', [id]);
  }

  deleteAiPart(id) {
    void this.deleteAiPartAsync(id).catch((err) => {
      console.warn('[TaskDBAws] Failed to delete AI part:', err);
    });
  }

  async deleteAiPartAsync(id) {
    await this._initPromise;
    await this.pool.query(
      "UPDATE chat_pairs SET ai_text = '', model = '', ai_timestamp = NULL, token_info = NULL WHERE id = $1",
      [id]
    );
  }

  updateAiText(id, text) {
    void this.updateAiTextAsync(id, text).catch((err) => {
      console.warn('[TaskDBAws] Failed to update AI text:', err);
    });
  }

  async updateAiTextAsync(id, text) {
    await this._initPromise;
    await this.pool.query('UPDATE chat_pairs SET ai_text = $1 WHERE id = $2', [text, id]);
  }

  deleteUserPart(id) {
    void this.deleteUserPartAsync(id).catch((err) => {
      console.warn('[TaskDBAws] Failed to delete user part:', err);
    });
  }

  async deleteUserPartAsync(id) {
    await this._initPromise;
    await this.pool.query("UPDATE chat_pairs SET user_text = '' WHERE id = $1", [id]);
  }

  updateUserText(id, text) {
    void this.updateUserTextAsync(id, text).catch((err) => {
      console.warn('[TaskDBAws] Failed to update user text:', err);
    });
  }

  async updateUserTextAsync(id, text) {
    await this._initPromise;
    await this.pool.query('UPDATE chat_pairs SET user_text = $1 WHERE id = $2', [text, id]);
  }

  async hasUserMessages(tabId = 1) {
    await this._initPromise;
    const { rows } = await this.pool.query(
      "SELECT 1 FROM chat_pairs WHERE chat_tab_id = $1 AND user_text <> '' LIMIT 1",
      [tabId]
    );
    return rows.length > 0;
  }

  async getChatTabUuidByTaskId(taskId) {
    await this._initPromise;
    const { rows } = await this.pool.query(
      'SELECT tab_uuid FROM chat_tabs WHERE task_id = $1',
      [taskId]
    );
    return rows[0]?.tab_uuid || null;
  }

  async listChatSubroutines() {
    await this._initPromise;
    const { rows } = await this.pool.query('SELECT * FROM chat_subroutines ORDER BY id ASC');
    return rows;
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

  async mergeSessions(targetId, sourceId) {
    if (!targetId || !sourceId || targetId === sourceId) return;
    await this._initPromise;
    await this.pool.query('UPDATE chat_tabs SET session_id = $1 WHERE session_id = $2', [
      targetId,
      sourceId
    ]);
    await this.pool.query('UPDATE chat_pairs SET session_id = $1 WHERE session_id = $2', [
      targetId,
      sourceId
    ]);

    const srcStart = await this.getImageSessionStartAsync(sourceId);
    const tgtStart = await this.getImageSessionStartAsync(targetId);
    if (srcStart && (!tgtStart || new Date(srcStart) < new Date(tgtStart))) {
      await this.pool.query(
        `INSERT INTO image_sessions (session_id, start_time)
         VALUES ($1, $2)
         ON CONFLICT (session_id) DO UPDATE SET start_time = EXCLUDED.start_time`,
        [targetId, srcStart]
      );
      this.imageSessionStartCache.set(targetId, srcStart);
    }
    await this.pool.query('DELETE FROM image_sessions WHERE session_id = $1', [sourceId]);
    this.imageSessionStartCache.delete(sourceId);
    this.imageCountCache.delete(sourceId);
    this.imageCountCache.delete(targetId);
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

  listProjects(includeArchived = false) {
    const cacheKey = includeArchived ? 'all' : 'active';
    const cached = this.projectCache.get(cacheKey);
    if (cached) {
      return cached;
    }
    void this.listProjectsAsync(includeArchived)
        .then((rows) => {
          this.projectCache.set(cacheKey, rows);
        })
        .catch((err) => {
          console.warn('[TaskDBAws] Failed to load projects:', err);
        });
    return [];
  }

  async listProjectsAsync(includeArchived = false) {
    await this._initPromise;
    const query = `
      SELECT p.project,
             COALESCE(c.count, 0) AS count,
             COALESCE(pm.archived, 0) AS archived
      FROM (
        SELECT project FROM project_meta
        UNION
        SELECT project FROM issues WHERE project <> ''
      ) p
      LEFT JOIN (
        SELECT project, COUNT(*) AS count
        FROM issues
        WHERE closed = 0 AND hidden = 0
        GROUP BY project
      ) c ON c.project = p.project
      LEFT JOIN project_meta pm ON pm.project = p.project
      ${includeArchived ? '' : 'WHERE COALESCE(pm.archived, 0) = 0'}
      ORDER BY count DESC, p.project ASC;
    `;
    const { rows } = await this.pool.query(query);
    return rows;
  }

  listSprints() {
    if (this.sprintCache) {
      return this.sprintCache;
    }
    void this.listSprintsAsync()
        .then((rows) => {
          this.sprintCache = rows;
        })
        .catch((err) => {
          console.warn('[TaskDBAws] Failed to load sprints:', err);
        });
    return [];
  }

  async listSprintsAsync() {
    await this._initPromise;
    const { rows } = await this.pool.query(
      `SELECT
         sprint,
         COUNT(*)::int AS count
       FROM issues
       WHERE closed = 0 AND hidden = 0
       GROUP BY sprint
       HAVING sprint <> ''
       ORDER BY count DESC`
    );
    return rows;
  }

  logActivity(action, details) {
    void this.logActivityAsync(action, details).catch((err) => {
      console.warn('[TaskDBAws] Failed to log activity:', err);
    });
  }

  async logActivityAsync(action, details) {
    await this._initPromise;
    const timestamp = new Date().toISOString();
    await this.pool.query(
      'INSERT INTO activity_timeline (timestamp, action, details) VALUES ($1, $2, $3)',
      [timestamp, action, details ?? '']
    );
    const cached = this.activityCache;
    if (cached?.length) {
      cached.unshift({
        id: null,
        timestamp,
        action,
        details: details ?? ''
      });
    }
  }

  getActivity() {
    if (this.activityCache.length) {
      return this.activityCache;
    }
    void this.getActivityAsync()
        .then((rows) => {
          this.activityCache = rows;
        })
        .catch((err) => {
          console.warn('[TaskDBAws] Failed to load activity timeline:', err);
        });
    return [];
  }

  async getActivityAsync() {
    await this._initPromise;
    const { rows } = await this.pool.query(
      'SELECT * FROM activity_timeline ORDER BY id DESC'
    );
    return rows;
  }

  ensureImageSession(sessionId) {
    if (!sessionId) return;
    if (this.imageSessionStartCache.has(sessionId)) {
      return;
    }
    void this.ensureImageSessionAsync(sessionId)
        .then((start) => {
          if (start) {
            this.imageSessionStartCache.set(sessionId, start);
          }
        })
        .catch((err) => {
          console.warn('[TaskDBAws] Failed to ensure image session:', err);
        });
  }

  async ensureImageSessionAsync(sessionId) {
    await this._initPromise;
    const { rows } = await this.pool.query(
      'SELECT start_time FROM image_sessions WHERE session_id = $1',
      [sessionId]
    );
    if (rows[0]?.start_time) {
      return rows[0].start_time;
    }
    const start = new Date().toISOString();
    await this.pool.query(
      'INSERT INTO image_sessions (session_id, start_time) VALUES ($1, $2) ON CONFLICT (session_id) DO NOTHING',
      [sessionId, start]
    );
    return start;
  }

  getImageSessionStart(sessionId) {
    if (!sessionId) return null;
    const cached = this.imageSessionStartCache.get(sessionId);
    if (cached) {
      return cached;
    }
    void this.getImageSessionStartAsync(sessionId)
        .then((start) => {
          if (start) {
            this.imageSessionStartCache.set(sessionId, start);
          }
        })
        .catch((err) => {
          console.warn('[TaskDBAws] Failed to load image session start:', err);
        });
    return null;
  }

  async getImageSessionStartAsync(sessionId) {
    await this._initPromise;
    const { rows } = await this.pool.query(
      'SELECT start_time FROM image_sessions WHERE session_id = $1',
      [sessionId]
    );
    return rows[0]?.start_time ?? null;
  }

  async getImageSessionForUrl(url) {
    await this._initPromise;
    const { rows } = await this.pool.query(
      'SELECT session_id FROM chat_pairs WHERE image_url = $1 ORDER BY id DESC LIMIT 1',
      [url]
    );
    return rows[0]?.session_id ?? '';
  }

  async getImageHiddenForUrl(url) {
    await this._initPromise;
    const { rows } = await this.pool.query(
      'SELECT image_hidden FROM chat_pairs WHERE image_url = $1 ORDER BY id DESC LIMIT 1',
      [url]
    );
    return rows[0] ? !!rows[0].image_hidden : false;
  }

  getImageTitleForUrl(url) {
    if (!url) return '';
    const cached = this.imageTitleCache.get(url);
    if (typeof cached === 'string') {
      return cached;
    }
    void this.getImageTitleForUrlAsync(url)
        .then((title) => {
          this.imageTitleCache.set(url, title);
        })
        .catch((err) => {
          console.warn('[TaskDBAws] Failed to load image title:', err);
        });
    return '';
  }

  async getImageTitleForUrlAsync(url) {
    await this._initPromise;
    const { rows } = await this.pool.query(
      'SELECT image_title FROM chat_pairs WHERE image_url = $1 ORDER BY id DESC LIMIT 1',
      [url]
    );
    return rows[0]?.image_title ?? '';
  }

  getImageStatusForUrl(url) {
    if (!url) return '';
    const cached = this.imageStatusCache.get(url);
    if (typeof cached === 'string') {
      return cached;
    }
    void this.getImageStatusForUrlAsync(url)
        .then((status) => {
          this.imageStatusCache.set(url, status);
        })
        .catch((err) => {
          console.warn('[TaskDBAws] Failed to load image status:', err);
        });
    return '';
  }

  async getImageStatusForUrlAsync(url) {
    await this._initPromise;
    const { rows } = await this.pool.query(
      'SELECT image_status FROM chat_pairs WHERE image_url = $1 ORDER BY id DESC LIMIT 1',
      [url]
    );
    return rows[0]?.image_status ?? '';
  }

  getImagePortfolioForUrl(url) {
    if (!url) return false;
    const cached = this.imagePortfolioCache.get(url);
    if (typeof cached === 'boolean') {
      return cached;
    }
    void this.getImagePortfolioForUrlAsync(url)
        .then((flag) => {
          this.imagePortfolioCache.set(url, flag);
        })
        .catch((err) => {
          console.warn('[TaskDBAws] Failed to load image portfolio flag:', err);
        });
    return false;
  }

  async getImagePortfolioForUrlAsync(url) {
    await this._initPromise;
    const { rows } = await this.pool.query(
      'SELECT publish_portfolio FROM chat_pairs WHERE image_url = $1 ORDER BY id DESC LIMIT 1',
      [url]
    );
    return rows[0] ? !!rows[0].publish_portfolio : false;
  }

  getImageIdForUrl(url) {
    if (!url) return null;
    if (this.imageIdCache.has(url)) {
      return this.imageIdCache.get(url);
    }
    void this.getImageIdForUrlAsync(url)
        .then((id) => {
          this.imageIdCache.set(url, id);
        })
        .catch((err) => {
          console.warn('[TaskDBAws] Failed to load image id:', err);
        });
    return null;
  }

  async getImageIdForUrlAsync(url) {
    await this._initPromise;
    const { rows } = await this.pool.query(
      'SELECT id FROM chat_pairs WHERE image_url = $1 ORDER BY id DESC LIMIT 1',
      [url]
    );
    return rows[0]?.id ?? null;
  }

  getImageModelForUrl(url) {
    if (!url) return '';
    const cached = this.imageModelCache.get(url);
    if (typeof cached === 'string') {
      return cached;
    }
    void this.getImageModelForUrlAsync(url)
        .then((model) => {
          this.imageModelCache.set(url, model);
        })
        .catch((err) => {
          console.warn('[TaskDBAws] Failed to load image model:', err);
        });
    return '';
  }

  async getImageModelForUrlAsync(url) {
    await this._initPromise;
    const { rows } = await this.pool.query(
      'SELECT model FROM chat_pairs WHERE image_url = $1 ORDER BY id DESC LIMIT 1',
      [url]
    );
    return rows[0]?.model ?? '';
  }

  getImageUuidForUrl(url) {
    if (!url) return null;
    if (this.imageUuidCache.has(url)) {
      return this.imageUuidCache.get(url);
    }
    void this.getImageUuidForUrlAsync(url)
        .then((uuid) => {
          this.imageUuidCache.set(url, uuid);
        })
        .catch((err) => {
          console.warn('[TaskDBAws] Failed to load image uuid:', err);
        });
    return null;
  }

  async getImageUuidForUrlAsync(url) {
    await this._initPromise;
    const { rows } = await this.pool.query(
      'SELECT id, image_uuid FROM chat_pairs WHERE image_url = $1 ORDER BY id DESC LIMIT 1',
      [url]
    );
    if (!rows[0]) {
      return null;
    }
    if (!rows[0].image_uuid) {
      const uuid = randomUUID().split('-')[0];
      await this.pool.query(
        'UPDATE chat_pairs SET image_uuid = $1 WHERE id = $2',
        [uuid, rows[0].id]
      );
      return uuid;
    }
    return rows[0].image_uuid;
  }

  isGeneratedImage(url) {
    if (!url) return false;
    const cached = this.imageGeneratedCache.get(url);
    if (typeof cached === 'boolean') {
      return cached;
    }
    void this.isGeneratedImageAsync(url)
        .then((generated) => {
          this.imageGeneratedCache.set(url, generated);
        })
        .catch((err) => {
          console.warn('[TaskDBAws] Failed to check image generation:', err);
        });
    return false;
  }

  async isGeneratedImageAsync(url) {
    await this._initPromise;
    const { rows } = await this.pool.query(
      'SELECT 1 FROM chat_pairs WHERE image_url = $1 LIMIT 1',
      [url]
    );
    return !!rows[0];
  }

  getProductUrlForImage(url) {
    if (!url) return '';
    const cached = this.productUrlCache.get(url);
    if (typeof cached === 'string') {
      return cached;
    }
    void this.getProductUrlForImageAsync(url)
        .then((productUrl) => {
          this.productUrlCache.set(url, productUrl);
        })
        .catch((err) => {
          console.warn('[TaskDBAws] Failed to load product url:', err);
        });
    return '';
  }

  async getProductUrlForImageAsync(url) {
    await this._initPromise;
    const { rows } = await this.pool.query(
      'SELECT product_url FROM chat_pairs WHERE image_url = $1 ORDER BY id DESC LIMIT 1',
      [url]
    );
    return rows[0]?.product_url ?? '';
  }

  getEbayUrlForImage(url) {
    if (!url) return '';
    const cached = this.ebayUrlCache.get(url);
    if (typeof cached === 'string') {
      return cached;
    }
    void this.getEbayUrlForImageAsync(url)
        .then((ebayUrl) => {
          this.ebayUrlCache.set(url, ebayUrl);
        })
        .catch((err) => {
          console.warn('[TaskDBAws] Failed to load ebay url:', err);
        });
    return '';
  }

  async getEbayUrlForImageAsync(url) {
    await this._initPromise;
    const { rows } = await this.pool.query(
      'SELECT ebay_url FROM chat_pairs WHERE image_url = $1 ORDER BY id DESC LIMIT 1',
      [url]
    );
    return rows[0]?.ebay_url ?? '';
  }

  hoursSinceImageSessionStart(sessionId) {
    const start = this.getImageSessionStart(sessionId);
    if (!start) return 0;
    const diffMs = Date.now() - new Date(start).getTime();
    return Math.floor(diffMs / (3600 * 1000));
  }

  imageLimitForSession(sessionId, baseLimit = 50) {
    if (baseLimit <= 10) {
      return baseLimit;
    }
    const hours = this.hoursSinceImageSessionStart(sessionId);
    return Math.max(0, baseLimit - hours);
  }

  nextImageLimitReductionTime(sessionId) {
    const start = this.getImageSessionStart(sessionId);
    if (!start) return null;
    const hours = this.hoursSinceImageSessionStart(sessionId);
    const nextMs = new Date(start).getTime() + (hours + 1) * 3600 * 1000;
    return new Date(nextMs).toISOString();
  }

  countImagesForSession(sessionId) {
    if (!sessionId) return 0;
    const cached = this.imageCountCache.get(sessionId);
    if (typeof cached === 'number') {
      return cached;
    }
    void this.countImagesForSessionAsync(sessionId)
        .then((count) => {
          this.imageCountCache.set(sessionId, count);
        })
        .catch((err) => {
          console.warn('[TaskDBAws] Failed to count images for session:', err);
        });
    return 0;
  }

  async countImagesForSessionAsync(sessionId) {
    await this._initPromise;
    const { rows } = await this.pool.query(
      'SELECT COUNT(*)::int AS count FROM chat_pairs WHERE session_id = $1 AND image_url IS NOT NULL',
      [sessionId]
    );
    return rows[0]?.count ?? 0;
  }

  countImagesForIp(ipAddress) {
    if (!ipAddress) return 0;
    const cached = this.ipImageCountCache.get(ipAddress);
    if (typeof cached === 'number') {
      return cached;
    }
    void this.countImagesForIpAsync(ipAddress)
        .then((count) => {
          this.ipImageCountCache.set(ipAddress, count);
        })
        .catch((err) => {
          console.warn('[TaskDBAws] Failed to count images for IP:', err);
        });
    return 0;
  }

  async countImagesForIpAsync(ipAddress) {
    await this._initPromise;
    const { rows } = await this.pool.query(
      'SELECT COUNT(*)::int AS count FROM chat_pairs WHERE ip_address = $1 AND image_url IS NOT NULL',
      [ipAddress]
    );
    return rows[0]?.count ?? 0;
  }

  countSearchesForSession(sessionId) {
    if (!sessionId) return 0;
    const cached = this.searchCountCache.get(sessionId);
    if (typeof cached === 'number') {
      return cached;
    }
    void this.countSearchesForSessionAsync(sessionId)
        .then((count) => {
          this.searchCountCache.set(sessionId, count);
        })
        .catch((err) => {
          console.warn('[TaskDBAws] Failed to count searches for session:', err);
        });
    return 0;
  }

  async countSearchesForSessionAsync(sessionId) {
    await this._initPromise;
    const { rows } = await this.pool.query(
      `SELECT COUNT(*)::int AS count
         FROM chat_pairs cp
         JOIN chat_tabs ct ON cp.chat_tab_id = ct.id
        WHERE cp.session_id = $1 AND ct.tab_type = 'search'`,
      [sessionId]
    );
    return rows[0]?.count ?? 0;
  }

  countSearchesForIp(ipAddress) {
    if (!ipAddress) return 0;
    const cached = this.ipSearchCountCache.get(ipAddress);
    if (typeof cached === 'number') {
      return cached;
    }
    void this.countSearchesForIpAsync(ipAddress)
        .then((count) => {
          this.ipSearchCountCache.set(ipAddress, count);
        })
        .catch((err) => {
          console.warn('[TaskDBAws] Failed to count searches for IP:', err);
        });
    return 0;
  }

  async countSearchesForIpAsync(ipAddress) {
    await this._initPromise;
    const { rows } = await this.pool.query(
      `SELECT COUNT(*)::int AS count
         FROM chat_pairs cp
         JOIN chat_tabs ct ON cp.chat_tab_id = ct.id
        WHERE cp.ip_address = $1 AND ct.tab_type = 'search'`,
      [ipAddress]
    );
    return rows[0]?.count ?? 0;
  }

  ensureDesignChatTab() {
    throw new Error('Design chat tab is not supported for the AWS task DB backend.');
  }

  // Placeholder methods for the rest of the TaskDB API used by server.js
  // Not fully implemented in this initial AWS port.
}
