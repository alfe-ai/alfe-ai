import Database from "better-sqlite3";
import { randomUUID } from "crypto";

export default class TaskDB {
  constructor(dbPath = "issues.sqlite") {
    this.db = new Database(dbPath);
    this._enableDbLogging();
    this._init();
  }

  /* ------------------------------------------------------------------ */
  /*  Schema bootstrap & migrations                                     */
  /* ------------------------------------------------------------------ */
  _enableDbLogging() {
    if (process.env.DB_PRINTS !== "true") return;
    const originalExec = this.db.exec.bind(this.db);
    this.db.exec = (sql) => {
      console.log("[TaskDB DB_PRINTS] exec", sql);
      return originalExec(sql);
    };

    const originalPrepare = this.db.prepare.bind(this.db);
    this.db.prepare = (sql) => {
      console.log("[TaskDB DB_PRINTS] prepare", sql);
      const statement = originalPrepare(sql);
      return this._wrapStatementForLogging(statement, sql);
    };
  }

  _wrapStatementForLogging(statement, sql) {
    const methodsToLog = new Set(["run", "get", "all", "iterate"]);
    return new Proxy(statement, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);
        if (typeof value === "function" && methodsToLog.has(prop)) {
          return (...args) => {
            console.log(`[TaskDB DB_PRINTS] ${String(prop)}`, sql, args);
            return value.apply(target, args);
          };
        }
        return value;
      }
    });
  }

  _init() {
    console.debug("[TaskDB Debug] Initializing DB schema…");

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS issues (
                                          id              INTEGER PRIMARY KEY AUTOINCREMENT,
                                          github_id       INTEGER UNIQUE,
                                          repository      TEXT,
                                          number          INTEGER,
                                          title           TEXT,
                                          html_url        TEXT,
                                          codex_url       TEXT,
                                          task_id_slug    TEXT,
                                          priority_number REAL,
                                          priority        TEXT DEFAULT 'Medium',
                                          hidden          INTEGER DEFAULT 0,
                                          project         TEXT DEFAULT '',
                                          sprint          TEXT DEFAULT '',
                                          fib_points      INTEGER,
                                          assignee        TEXT,
                                          created_at      TEXT,
                                          closed          INTEGER DEFAULT 0,
                                          status          TEXT DEFAULT 'Not Started',
                                          dependencies    TEXT DEFAULT '',
                                          blocking        TEXT DEFAULT ''
      );
    `);

    try {
      this.db.exec(`ALTER TABLE issues RENAME COLUMN priority_number TO priority_number_old;`);
      console.debug("[TaskDB Debug] Renamed existing priority_number -> priority_number_old");
    } catch(e) {
      console.debug("[TaskDB Debug] Skipped rename (likely doesn't exist).", e.message);
    }
    try {
      this.db.exec(`ALTER TABLE issues ADD COLUMN priority_number REAL;`);
      console.debug("[TaskDB Debug] Created new priority_number column as REAL");
    } catch(e) {
      console.debug("[TaskDB Debug] Skipped add column (likely exists).", e.message);
    }
    try {
      this.db.exec(`UPDATE issues SET priority_number = priority_number_old;`);
      console.debug("[TaskDB Debug] Copied data from priority_number_old to priority_number");
    } catch(e) {
      console.debug("[TaskDB Debug] Skipped copy data (maybe no old data).", e.message);
    }
    try {
      this.db.exec('ALTER TABLE issues ADD COLUMN codex_url TEXT;');
      console.debug("[TaskDB Debug] Added issues.codex_url column");
    } catch(e) {
      // column already exists
    }

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
                                            key   TEXT PRIMARY KEY,
                                            value TEXT NOT NULL
      );
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS session_settings (
                                            session_id TEXT NOT NULL,
                                            key        TEXT NOT NULL,
                                            value      TEXT NOT NULL,
                                            PRIMARY KEY (session_id, key)
      );
    `);

    this.db.exec(
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_issues_github ON issues(github_id);`
    );
    this.db.exec(
        `CREATE INDEX IF NOT EXISTS idx_issues_priority ON issues(priority_number);`
    );

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS activity_timeline (
                                                     id INTEGER PRIMARY KEY AUTOINCREMENT,
                                                     timestamp TEXT NOT NULL,
                                                     action TEXT NOT NULL,
                                                     details TEXT
      );
    `);

    this.db.exec(`
        CREATE TABLE IF NOT EXISTS chat_tabs (
                                               id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      );
    `);
      try {
        this.db.exec('ALTER TABLE chat_tabs ADD COLUMN archived INTEGER DEFAULT 0;');
        console.debug("[TaskDB Debug] Added chat_tabs.archived column");
      } catch(e) {
        //console.debug("[TaskDB Debug] chat_tabs.archived column exists, skipping.", e.message);
      }
      try {
        this.db.exec('ALTER TABLE chat_tabs ADD COLUMN archived_at TEXT;');
        console.debug("[TaskDB Debug] Added chat_tabs.archived_at column");
      } catch(e) {
        //console.debug("[TaskDB Debug] chat_tabs.archived_at column exists, skipping.", e.message);
      }
      try {
        this.db.exec('ALTER TABLE chat_tabs ADD COLUMN generate_images INTEGER DEFAULT 1;');
        console.debug("[TaskDB Debug] Added chat_tabs.generate_images column");
      } catch(e) {
        //console.debug("[TaskDB Debug] generate_images column exists, skipping.", e.message);
    }
    try {
      this.db.exec('ALTER TABLE chat_tabs ADD COLUMN nexum INTEGER DEFAULT 0;');
      console.debug("[TaskDB Debug] Added chat_tabs.nexum column");
    } catch(e) {
      //console.debug("[TaskDB Debug] chat_tabs.nexum column exists, skipping.", e.message);
    }
    try {
      this.db.exec("ALTER TABLE chat_tabs ADD COLUMN project_name TEXT DEFAULT '';" );
      console.debug("[TaskDB Debug] Added chat_tabs.project_name column");
    } catch(e) {
      //console.debug("[TaskDB Debug] chat_tabs.project_name column exists, skipping.", e.message);
    }
    try {
      this.db.exec("ALTER TABLE chat_tabs ADD COLUMN repo_ssh_url TEXT DEFAULT '';" );
      console.debug("[TaskDB Debug] Added chat_tabs.repo_ssh_url column");
    } catch(e) {
      //console.debug("[TaskDB Debug] chat_tabs.repo_ssh_url column exists, skipping.", e.message);
    }
    try {
      this.db.exec("ALTER TABLE chat_tabs ADD COLUMN extra_projects TEXT DEFAULT '';" );
      console.debug("[TaskDB Debug] Added chat_tabs.extra_projects column");
    } catch(e) {
      //console.debug("[TaskDB Debug] chat_tabs.extra_projects column exists, skipping.", e.message);
    }
    try {
      this.db.exec('ALTER TABLE chat_tabs ADD COLUMN task_id INTEGER DEFAULT 0;');
      console.debug("[TaskDB Debug] Added chat_tabs.task_id column");
    } catch(e) {
      //console.debug("[TaskDB Debug] chat_tabs.task_id column exists, skipping.", e.message);
    }
    try {
      this.db.exec("ALTER TABLE chat_tabs ADD COLUMN model_override TEXT DEFAULT '';" );
      console.debug("[TaskDB Debug] Added chat_tabs.model_override column");
    } catch(e) {
      //console.debug("[TaskDB Debug] chat_tabs.model_override column exists, skipping.", e.message);
    }
    try {
      this.db.exec("ALTER TABLE chat_tabs ADD COLUMN tab_type TEXT DEFAULT 'chat';" );
      console.debug("[TaskDB Debug] Added chat_tabs.tab_type column");
    } catch(e) {
      //console.debug("[TaskDB Debug] chat_tabs.tab_type column exists, skipping.", e.message);
    }
    try {
      this.db.exec('ALTER TABLE chat_tabs ADD COLUMN send_project_context INTEGER DEFAULT 1;');
      console.debug("[TaskDB Debug] Added chat_tabs.send_project_context column");
    } catch(e) {
      //console.debug("[TaskDB Debug] chat_tabs.send_project_context column exists, skipping.", e.message);
    }
    try {
      this.db.exec("ALTER TABLE chat_tabs ADD COLUMN session_id TEXT DEFAULT '';" );
      console.debug("[TaskDB Debug] Added chat_tabs.session_id column");
    } catch(e) {
      //console.debug("[TaskDB Debug] chat_tabs.session_id column exists, skipping.", e.message);
    }
    try {
      this.db.exec("ALTER TABLE chat_tabs ADD COLUMN tab_uuid TEXT DEFAULT '';" );
      this.db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_tabs_uuid ON chat_tabs(tab_uuid);");
      console.debug("[TaskDB Debug] Added chat_tabs.tab_uuid column");
    } catch(e) {
      //console.debug("[TaskDB Debug] chat_tabs.tab_uuid column exists, skipping.", e.message);
    }
    try {
      this.db.exec('ALTER TABLE chat_tabs ADD COLUMN parent_id INTEGER DEFAULT 0;');
      console.debug("[TaskDB Debug] Added chat_tabs.parent_id column");
    } catch(e) {
      //console.debug("[TaskDB Debug] chat_tabs.parent_id column exists, skipping.", e.message);
    }
    try {
      this.db.exec("ALTER TABLE chat_tabs ADD COLUMN chatgpt_url TEXT DEFAULT '';" );
      console.debug("[TaskDB Debug] Added chat_tabs.chatgpt_url column");
    } catch(e) {
      //console.debug("[TaskDB Debug] chat_tabs.chatgpt_url column exists, skipping.", e.message);
    }
    try {
      this.db.exec('ALTER TABLE chat_tabs ADD COLUMN show_in_sidebar INTEGER DEFAULT 1;');
      console.debug("[TaskDB Debug] Added chat_tabs.show_in_sidebar column");
    } catch(e) {
      //console.debug("[TaskDB Debug] chat_tabs.show_in_sidebar column exists, skipping.", e.message);
    }
    try {
      this.db.exec("ALTER TABLE chat_tabs ADD COLUMN path_alias TEXT DEFAULT '';" );
      console.debug("[TaskDB Debug] Added chat_tabs.path_alias column");
    } catch(e) {
      //console.debug("[TaskDB Debug] chat_tabs.path_alias column exists, skipping.", e.message);
    }
    try {
      this.db.exec('ALTER TABLE chat_tabs ADD COLUMN favorite INTEGER DEFAULT 0;');
      console.debug("[TaskDB Debug] Added chat_tabs.favorite column");
    } catch(e) {
      //console.debug("[TaskDB Debug] chat_tabs.favorite column exists, skipping.", e.message);
    }

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chat_pairs (
                                              id INTEGER PRIMARY KEY AUTOINCREMENT,
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
                                              image_uuid TEXT DEFAULT '',
                                              publish_portfolio INTEGER DEFAULT 0,
                                              product_url TEXT DEFAULT '',
                                              ebay_url TEXT DEFAULT ''
      );
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chat_subroutines (
                                                id INTEGER PRIMARY KEY AUTOINCREMENT,
                                                name TEXT NOT NULL,
                                                trigger_text TEXT DEFAULT '',
                                                action_text TEXT DEFAULT '',
                                                action_hook TEXT DEFAULT '',
                                                created_at TEXT NOT NULL
      );
    `);

    try {
      this.db.exec(`ALTER TABLE chat_subroutines ADD COLUMN trigger_text TEXT DEFAULT '';`);
      console.debug("[TaskDB Debug] Added chat_subroutines.trigger_text column");
    } catch(e) {
      //console.debug("[TaskDB Debug] trigger_text column exists, skipping.", e.message);
    }
    try {
      this.db.exec(`ALTER TABLE chat_subroutines ADD COLUMN action_text TEXT DEFAULT '';`);
      console.debug("[TaskDB Debug] Added chat_subroutines.action_text column");
    } catch(e) {
      //console.debug("[TaskDB Debug] action_text column exists, skipping.", e.message);
    }
    try {
      this.db.exec(`ALTER TABLE chat_subroutines ADD COLUMN action_hook TEXT DEFAULT '';`);
      console.debug("[TaskDB Debug] Added chat_subroutines.action_hook column");
    } catch(e) {
      //console.debug("[TaskDB Debug] action_hook column exists, skipping.", e.message);
    }

    try {
      this.db.exec(`ALTER TABLE chat_pairs ADD COLUMN image_url TEXT;`);
      console.debug("[TaskDB Debug] Added chat_pairs.image_url column");
    } catch(e) {
      //console.debug("[TaskDB Debug] image_url column exists, skipping.", e.message);
    }
    try {
      this.db.exec(`ALTER TABLE chat_pairs ADD COLUMN citations_json TEXT DEFAULT '';`);
      console.debug("[TaskDB Debug] Added chat_pairs.citations_json column");
    } catch(e) {
      //console.debug("[TaskDB Debug] citations_json column exists, skipping.", e.message);
    }
    try {
      this.db.exec(`ALTER TABLE chat_pairs ADD COLUMN image_alt TEXT DEFAULT '';`);
      console.debug("[TaskDB Debug] Added chat_pairs.image_alt column");
    } catch(e) {
      //console.debug("[TaskDB Debug] image_alt column exists, skipping.", e.message);
    }
    try {
      this.db.exec(`ALTER TABLE chat_pairs ADD COLUMN image_title TEXT DEFAULT '';`);
      console.debug("[TaskDB Debug] Added chat_pairs.image_title column");
    } catch(e) {
      //console.debug("[TaskDB Debug] image_title column exists, skipping.", e.message);
    }
    try {
      this.db.exec(`ALTER TABLE chat_pairs ADD COLUMN image_status TEXT DEFAULT '';`);
      console.debug("[TaskDB Debug] Added chat_pairs.image_status column");
    } catch(e) {
      //console.debug("[TaskDB Debug] image_status column exists, skipping.", e.message);
    }
    try {
      this.db.exec(`ALTER TABLE chat_pairs ADD COLUMN session_id TEXT DEFAULT '';`);
      console.debug("[TaskDB Debug] Added chat_pairs.session_id column");
    } catch(e) {
      //console.debug("[TaskDB Debug] chat_pairs.session_id column exists, skipping.", e.message);
    }
    try {
      this.db.exec(`ALTER TABLE chat_pairs ADD COLUMN ip_address TEXT DEFAULT '';`);
      console.debug("[TaskDB Debug] Added chat_pairs.ip_address column");
    } catch(e) {
      //console.debug("[TaskDB Debug] chat_pairs.ip_address column exists, skipping.", e.message);
    }
    try {
      this.db.exec(`ALTER TABLE chat_pairs ADD COLUMN image_uuid TEXT DEFAULT '';`);
      console.debug("[TaskDB Debug] Added chat_pairs.image_uuid column");
    } catch(e) {
      //console.debug("[TaskDB Debug] chat_pairs.image_uuid column exists, skipping.", e.message);
    }
    try {
      this.db.exec(`ALTER TABLE chat_pairs ADD COLUMN publish_portfolio INTEGER DEFAULT 0;`);
      console.debug("[TaskDB Debug] Added chat_pairs.publish_portfolio column");
    } catch(e) {
      //console.debug("[TaskDB Debug] chat_pairs.publish_portfolio column exists, skipping.", e.message);
    }
    try {
      this.db.exec(`ALTER TABLE chat_pairs ADD COLUMN product_url TEXT DEFAULT '';`);
      console.debug("[TaskDB Debug] Added chat_pairs.product_url column");
    } catch(e) {
      //console.debug("[TaskDB Debug] chat_pairs.product_url column exists, skipping.", e.message);
    }
    try {
      this.db.exec(`ALTER TABLE chat_pairs ADD COLUMN ebay_url TEXT DEFAULT '';`);
      console.debug("[TaskDB Debug] Added chat_pairs.ebay_url column");
    } catch(e) {
      //console.debug("[TaskDB Debug] chat_pairs.ebay_url column exists, skipping.", e.message);
    }
    try {
      this.db.exec(`ALTER TABLE chat_pairs ADD COLUMN project_context TEXT DEFAULT '';`);
      console.debug("[TaskDB Debug] Added chat_pairs.project_context column");
    } catch(e) {
      //console.debug("[TaskDB Debug] chat_pairs.project_context column exists, skipping.", e.message);
    }
    try {
      this.db.exec(`ALTER TABLE chat_pairs ADD COLUMN image_hidden INTEGER DEFAULT 0;`);
      console.debug("[TaskDB Debug] Added chat_pairs.image_hidden column");
    } catch(e) {
      //console.debug("[TaskDB Debug] chat_pairs.image_hidden column exists, skipping.", e.message);
    }

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS image_sessions (
        session_id TEXT PRIMARY KEY,
        start_time TEXT NOT NULL
      );
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS upscaled_images (
        original TEXT PRIMARY KEY,
        upscaled TEXT NOT NULL
      );
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'misc',
        timestamp TEXT NOT NULL
      );
    `);
    try {
      this.db.exec(`ALTER TABLE feedback ADD COLUMN type TEXT NOT NULL DEFAULT 'misc';`);
      console.debug("[TaskDB Debug] Added feedback.type column");
    } catch(e) {
      //console.debug("[TaskDB Debug] feedback.type column exists, skipping.", e.message);
    }

    // The is_image_desc column is no longer used, but we won't remove it in the schema for safety
    // The logic referencing it is removed.

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS project_branches (
                                                    project TEXT PRIMARY KEY,
                                                    base_branch TEXT DEFAULT ''
      );
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS project_meta (
        project TEXT PRIMARY KEY,
        archived INTEGER DEFAULT 0
      );
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        session_id TEXT DEFAULT '',
        created_at TEXT NOT NULL,
        totp_secret TEXT DEFAULT '',
        timezone TEXT DEFAULT '',
        plan TEXT DEFAULT 'Free',
        disabled INTEGER DEFAULT 0
      );
    `);

    try {
      this.db.exec('ALTER TABLE accounts ADD COLUMN totp_secret TEXT DEFAULT "";');
      console.debug("[TaskDB Debug] Added accounts.totp_secret column");
    } catch(e) {
      // column exists
    }

    try {
      this.db.exec('ALTER TABLE accounts ADD COLUMN timezone TEXT DEFAULT "";');
      console.debug("[TaskDB Debug] Added accounts.timezone column");
    } catch(e) {
      // column exists
    }

    try {
      this.db.exec("ALTER TABLE accounts ADD COLUMN plan TEXT DEFAULT 'Free';");
      console.debug("[TaskDB Debug] Added accounts.plan column");
    } catch(e) {
      // column exists
    }

    try {
      this.db.exec("ALTER TABLE accounts ADD COLUMN disabled INTEGER DEFAULT 0;");
      console.debug("[TaskDB Debug] Added accounts.disabled column");
    } catch(e) {
      // column exists
    }

    this.db.exec("UPDATE accounts SET disabled=0 WHERE disabled IS NULL;");

    // Migration: remove the deprecated upwork_jobs table if it exists.
    this.db.exec('DROP TABLE IF EXISTS upwork_jobs;');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS amazon_skus (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sku TEXT UNIQUE,
        asin TEXT,
        title TEXT DEFAULT '',
        created_at TEXT NOT NULL
      );
    `);

    console.debug("[TaskDB Debug] Finished DB schema init.");
  }

  /* ------------------------------------------------------------------ */
  /*  Upsert / sync helpers                                             */
  /* ------------------------------------------------------------------ */
  upsertIssue(issue, repositorySlug) {
    const existing = this.db
        .prepare(
            "SELECT priority_number, priority, project, sprint, status, dependencies, blocking, codex_url FROM issues WHERE github_id = ?"
        )
        .get(issue.id);

    let priorityNum = existing?.priority_number;
    if (!priorityNum) {
      const max =
          this.db.prepare("SELECT MAX(priority_number) AS m FROM issues").get()
              .m || 0;
      priorityNum = max + 1;
    }

    const row = {
      github_id: issue.id,
      repository: repositorySlug,
      number: issue.number,
      title: issue.title,
      html_url: issue.html_url,
      codex_url: existing?.codex_url ?? '',
      task_id_slug: `${repositorySlug}#${issue.number}`,
      priority_number: priorityNum,
      priority: existing?.priority ?? "Medium",
      hidden: 0,
      project: existing?.project ?? this.getSetting("default_project") ?? "",
      sprint: existing?.sprint ?? this.getSetting("default_sprint") ?? "",
      fib_points: null,
      assignee: issue.assignee?.login || null,
      created_at: issue.created_at,
      closed: 0,
      status: existing?.status ?? "Not Started",
      dependencies: existing?.dependencies ?? "",
      blocking: existing?.blocking ?? ""
    };

    const stmt = this.db.prepare(`
      INSERT INTO issues (
        github_id, repository, number, title, html_url, codex_url,
        task_id_slug, priority_number, priority, hidden,
        project, sprint, fib_points, assignee, created_at, closed, status,
        dependencies, blocking
      ) VALUES (
                 @github_id, @repository, @number, @title, @html_url, @codex_url,
                 @task_id_slug, @priority_number, @priority, @hidden,
                 @project, @sprint, @fib_points, @assignee, @created_at, @closed, @status,
                 @dependencies, @blocking
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
                                    blocking        = issues.blocking
    `);

    stmt.run(row);
  }

  markClosedExcept(openGithubIds) {
    // Only auto-close tasks that originated from GitHub.
    // Locally created tasks have a NULL github_id and should not be affected.
    if (!openGithubIds.length) {
      this.db.exec("UPDATE issues SET closed = 1 WHERE github_id IS NOT NULL AND closed = 0;");
      return;
    }
    const placeholders = openGithubIds.map(() => "?").join(",");
    this.db
        .prepare(`UPDATE issues SET closed = 1 WHERE github_id IS NOT NULL AND github_id NOT IN (${placeholders});`)
        .run(...openGithubIds);
  }

  listTasks(includeHidden = false) {
    const sql = includeHidden
        ? "SELECT * FROM issues WHERE closed = 0 ORDER BY priority_number;"
        : "SELECT * FROM issues WHERE closed = 0 AND hidden = 0 ORDER BY priority_number;";
    return this.db.prepare(sql).all();
  }

  reorderTask(id, direction) {
    const current = this.db
        .prepare("SELECT id, priority_number FROM issues WHERE id = ?")
        .get(id);
    if (!current) return false;

    let neighbor;
    if (direction === "up") {
      neighbor = this.db
          .prepare(
              `SELECT id, priority_number FROM issues
               WHERE priority_number < ?
               ORDER BY priority_number DESC
                 LIMIT 1`
          )
          .get(current.priority_number);
      if (!neighbor) {
        const newVal = current.priority_number - 1;
        this.db.prepare("UPDATE issues SET priority_number=? WHERE id=?").run(newVal, current.id);
        return true;
      }
      const newVal = (current.priority_number + neighbor.priority_number) / 2;
      this.db.prepare("UPDATE issues SET priority_number=? WHERE id=?").run(newVal, current.id);
      return true;
    } else {
      neighbor = this.db
          .prepare(
              `SELECT id, priority_number FROM issues
               WHERE priority_number > ?
               ORDER BY priority_number ASC
                 LIMIT 1`
          )
          .get(current.priority_number);
      if (!neighbor) {
        const newVal = current.priority_number + 1;
        this.db.prepare("UPDATE issues SET priority_number=? WHERE id=?").run(newVal, current.id);
        return true;
      }
      const newVal = (current.priority_number + neighbor.priority_number) / 2;
      this.db.prepare("UPDATE issues SET priority_number=? WHERE id=?").run(newVal, current.id);
      return true;
    }
  }

  reorderAll(taskIdsInOrder) {
    const upd = this.db.prepare("UPDATE issues SET priority_number=? WHERE id=?");
    this.db.transaction(() => {
      taskIdsInOrder.forEach((taskId, index) => {
        const newVal = index + 1;
        upd.run(newVal, taskId);
      });
    })();
  }

  setHidden(id, hidden) {
    this.db.prepare("UPDATE issues SET hidden = ? WHERE id = ?").run(
        hidden ? 1 : 0,
        id
    );

    try {
      this.db.exec(
        `CREATE TABLE IF NOT EXISTS sterlingproxy (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT NOT NULL,
          ip_address TEXT DEFAULT '',
          start_timestamp TEXT NOT NULL,
          last_used_timestamp TEXT NOT NULL,
          status TEXT DEFAULT 'Running',
          assigned_port INTEGER DEFAULT NULL,
          runs INTEGER DEFAULT 0
        );`
      );
      console.debug("[TaskDB Debug] Created sterlingproxy table");
    } catch(e) {}

    try {
      this.db.exec('ALTER TABLE sterlingproxy ADD COLUMN runs INTEGER DEFAULT 0;');
      console.debug("[TaskDB Debug] Added sterlingproxy.runs column");
    } catch(e) {}

  }
  ensureSterlingProxy(sessionId) {
      if (!sessionId) return;
      const exists = this.db.prepare("SELECT 1 FROM sterlingproxy WHERE session_id=?").get(sessionId);
      if (!exists) {
        const now = new Date().toISOString();
        this.db.prepare("INSERT INTO sterlingproxy (session_id, ip_address, start_timestamp, last_used_timestamp, status) VALUES (?, ?, ?, ?, ?)").run(sessionId, '', now, now, 'Running');
      }
    }

    upsertSterlingProxy(sessionId, ipAddress, assignedPort) {
      if (!sessionId) return;
      const now = new Date().toISOString();
      const row = this.db.prepare("SELECT id FROM sterlingproxy WHERE session_id=?").get(sessionId);
      if (row) {
        this.db.prepare("UPDATE sterlingproxy SET ip_address=?, last_used_timestamp=?, assigned_port=? WHERE session_id=?").run(ipAddress||'', now, assignedPort||null, sessionId);
      } else {
        this.db.prepare("INSERT INTO sterlingproxy (session_id, ip_address, start_timestamp, last_used_timestamp, status, assigned_port) VALUES (?, ?, ?, ?, ?, ?)").run(sessionId, ipAddress||'', now, now, 'Running', assignedPort||null);
      }
    }

    listSterlingProxy() {
      return this.db.prepare("SELECT session_id, ip_address, start_timestamp, last_used_timestamp, status, assigned_port, runs FROM sterlingproxy ORDER BY start_timestamp DESC").all();
    }

  setPoints(id, points) {
    this.db.prepare("UPDATE issues SET fib_points = ? WHERE id = ?").run(
        points,
        id
    );
  }

  setProject(id, project) {
    this.db.prepare("UPDATE issues SET project = ? WHERE id = ?").run(
        project,
        id
    );
  }

  setSprint(id, sprint) {
    this.db.prepare("UPDATE issues SET sprint = ? WHERE id = ?").run(
        sprint,
        id
    );
  }

  setPriority(id, priority) {
    this.db.prepare("UPDATE issues SET priority = ? WHERE id = ?").run(
        priority,
        id
    );
  }

  setStatus(id, status) {
    this.db.prepare("UPDATE issues SET status = ? WHERE id = ?").run(
        status,
        id
    );
  }

  setDependencies(id, deps) {
    this.db.prepare("UPDATE issues SET dependencies = ? WHERE id = ?").run(
        deps,
        id
    );
  }

  setBlocking(id, blocks) {
    this.db.prepare("UPDATE issues SET blocking = ? WHERE id = ?").run(
        blocks,
        id
    );
  }

  setCodexUrl(id, url) {
    this.db.prepare("UPDATE issues SET codex_url = ? WHERE id = ?").run(url, id);
  }

  setProjectByGithubId(githubId, project) {
    this.db
        .prepare("UPDATE issues SET project = ? WHERE github_id = ?")
        .run(project, githubId);
  }

  setSprintByGithubId(githubId, sprint) {
    this.db
        .prepare("UPDATE issues SET sprint = ? WHERE github_id = ?")
        .run(sprint, githubId);
  }

  allSettings() {
    return this.db
        .prepare("SELECT key, value FROM settings")
        .all()
        .map((r) => ({
          key: r.key,
          value: this._safeParse(r.value)
        }));
  }

  getSetting(key) {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
    return row ? this._safeParse(row.value) : undefined;
  }

  setSetting(key, value) {
    const val = JSON.stringify(value);
    this.db
        .prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
        .run(key, val);
  }

  getSessionSetting(sessionId, key) {
    if (!sessionId) {
      return this.getSetting(key);
    }
    const row = this.db
        .prepare("SELECT value FROM session_settings WHERE session_id = ? AND key = ?")
        .get(sessionId, key);
    return row ? this._safeParse(row.value) : undefined;
  }

  setSessionSetting(sessionId, key, value) {
    if (!sessionId) {
      this.setSetting(key, value);
      return;
    }
    const val = JSON.stringify(value);
    this.db
        .prepare(
            "INSERT OR REPLACE INTO session_settings (session_id, key, value) VALUES (?, ?, ?)"
        )
        .run(sessionId, key, val);
  }

  listProjects(includeArchived = false) {
    const stmt = this.db.prepare(
        `SELECT p.project,
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
         ORDER BY count DESC, p.project ASC;`
    );
    return stmt.all();
  }

  listSprints() {
    return this.db
        .prepare(
            `SELECT
               sprint,
               COUNT(*) AS count
             FROM issues
             WHERE closed = 0 AND hidden = 0
             GROUP BY sprint
             HAVING sprint <> ''
             ORDER BY count DESC;`
        )
        .all();
  }

  dump() {
    return this.db
        .prepare("SELECT * FROM issues ORDER BY priority_number")
        .all();
  }

  _safeParse(val) {
    try {
      return JSON.parse(val);
    } catch {
      return val;
    }
  }

  getTaskById(id) {
    return this.db
        .prepare("SELECT * FROM issues WHERE id=?")
        .get(id);
  }

  listTasksByProject(project) {
    return this.db
        .prepare("SELECT * FROM issues WHERE project=? AND closed=0 ORDER BY priority_number")
        .all(project);
  }

  listTasksBySprint(sprint) {
    return this.db
        .prepare("SELECT * FROM issues WHERE sprint=? AND closed=0 ORDER BY priority_number")
        .all(sprint);
  }

  createTask(title, project = '', sprint = '') {
    const maxPrio = this.db.prepare('SELECT MAX(priority_number) AS m FROM issues').get().m || 0;
    const priority_number = maxPrio + 1;
    const maxNumber = this.db.prepare('SELECT MAX(number) AS m FROM issues').get().m || 0;
    const number = maxNumber + 1;
    const created_at = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO issues (
        github_id, repository, number, title, html_url, codex_url,
        task_id_slug, priority_number, priority, hidden,
        project, sprint, fib_points, assignee, created_at, closed, status,
        dependencies, blocking
      ) VALUES (
        NULL, 'local', @number, @title, '#', '',
        @task_id_slug, @priority_number, 'Medium', 0,
        @project, @sprint, NULL, NULL, @created_at, 0, 'Not Started',
        '', ''
      )
    `);
    const { lastInsertRowid } = stmt.run({
      number,
      title,
      codex_url: '',
      task_id_slug: `local#${number}`,
      priority_number,
      project,
      sprint,
      created_at
    });
    return lastInsertRowid;
  }

  setTitle(id, newTitle) {
    this.db.prepare("UPDATE issues SET title = ? WHERE id = ?").run(newTitle, id);
  }

  logActivity(action, details) {
    this.db
        .prepare("INSERT INTO activity_timeline (timestamp, action, details) VALUES (?, ?, ?)")
        .run(new Date().toISOString(), action, details ?? "");
  }

  getActivity() {
    return this.db
        .prepare("SELECT * FROM activity_timeline ORDER BY id DESC")
        .all();
  }

  addFeedback(message, type = 'misc') {
    this.db
        .prepare("INSERT INTO feedback (message, type, timestamp) VALUES (?, ?, ?)")
        .run(message, type, new Date().toISOString());
  }

  async createChatPair(
      userText,
      chatTabId = 1,
      systemContext = "",
      projectContext = "",
      sessionId = "",
      ipAddress = ""
  ) {
    const timestamp = new Date().toISOString();
    const { lastInsertRowid } = this.db.prepare(`
      INSERT INTO chat_pairs (
        user_text, ai_text, model, timestamp, ai_timestamp,
        chat_tab_id, system_context, project_context, token_info,
        citations_json, image_url, image_alt, image_title, session_id, ip_address
      )
      VALUES (
        @user_text, '', '', @timestamp, NULL,
        @chat_tab_id, @system_context, @project_context, NULL,
        NULL, NULL, '', '', @session_id, @ip_address
      )
    `).run({
      user_text: userText,
      timestamp,
      chat_tab_id: chatTabId,
      system_context: systemContext,
      project_context: projectContext,
      citations_json: null,
      session_id: sessionId,
      ip_address: ipAddress
    });
    return lastInsertRowid;
  }

  async finalizeChatPair(id, aiText, model, aiTimestamp, tokenInfo=null, citationsJson=null) {
    this.db.prepare(`
      UPDATE chat_pairs
      SET ai_text = @ai_text,
          model = @model,
          ai_timestamp = @ai_timestamp,
          token_info = @token_info,
          citations_json = @citations_json
      WHERE id = @id
    `).run({
      id,
      ai_text: aiText,
      model,
      ai_timestamp: aiTimestamp,
      token_info: tokenInfo,
      citations_json: citationsJson
    });
  }

  createImagePair(url, altText = '', chatTabId = 1, title = '', status = 'Generated', sessionId = '', ipAddress = '', model = '', publish = 0, productUrl = '', ebayUrl = '') {
    const ts = new Date().toISOString();
    const uuid = randomUUID().split('-')[0];
    const { lastInsertRowid } = this.db.prepare(`
      INSERT INTO chat_pairs (
        user_text, ai_text, model, timestamp, ai_timestamp,
        chat_tab_id, system_context, project_context, token_info,
        citations_json, image_url, image_alt, image_title, image_status, session_id, ip_address, image_uuid, publish_portfolio, product_url, ebay_url
      ) VALUES ('', '', @model, @ts, @ts, @chat_tab_id, '', '', NULL, NULL, @url, @alt, @title, @status, @session_id, @ip_address, @uuid, @publish, @product_url, @ebay_url)
    `).run({ ts, chat_tab_id: chatTabId, url, alt: altText, title, status, session_id: sessionId, ip_address: ipAddress, uuid, model, publish: publish ? 1 : 0, product_url: productUrl, ebay_url: ebayUrl, citations_json: null });
    return lastInsertRowid;
  }

  async getAllChatPairs(tabId = 1) {
    return this.db
        .prepare("SELECT * FROM chat_pairs WHERE chat_tab_id=? ORDER BY id ASC")
        .all(tabId);
  }

  getChatPairsByProject(projectName) {
    if (!projectName) {
      return [];
    }
    return this.db
        .prepare(
          `SELECT cp.* FROM chat_pairs cp
           JOIN chat_tabs ct ON cp.chat_tab_id = ct.id
           WHERE ct.project_name = ?
           ORDER BY cp.id ASC`
        )
        .all(projectName);
  }

  hasUserMessages(tabId = 1) {
    const row = this.db
        .prepare("SELECT 1 FROM chat_pairs WHERE chat_tab_id=? AND user_text<>'' LIMIT 1")
        .get(tabId);
    return !!row;
  }

  getChatPairsPage(tabId = 1, limit = 10, offset = 0) {
    return this.db.prepare(`
      SELECT * FROM chat_pairs
      WHERE chat_tab_id = ?
      ORDER BY id DESC
        LIMIT ?
      OFFSET ?
    `).all(tabId, limit, offset);
  }

  async getPairById(id) {
    return this.db
        .prepare("SELECT * FROM chat_pairs WHERE id = ?")
        .get(id);
  }

  createChatTab(name, nexum = 0, project = '', repo = '', extraProjects = '', taskId = 0, type = 'chat', sessionId = '', sendProjectContext = 0, chatgptUrl = '', showInSidebar = 1, pathAlias = '') {
    const ts = new Date().toISOString();
    const genImages = type === 'design' ? 1 : 0;
    if (project) this.ensureProjectMeta(project);
    const uuid = randomUUID().replace(/-/g, '').slice(0, 12);
    const { lastInsertRowid } = this.db.prepare(`
      INSERT INTO chat_tabs (name, created_at, generate_images, nexum, project_name, repo_ssh_url, extra_projects, task_id, tab_type, send_project_context, session_id, tab_uuid, chatgpt_url, show_in_sidebar, favorite, path_alias)
      VALUES (@name, @created_at, @generate_images, @nexum, @project_name, @repo_ssh_url, @extra_projects, @task_id, @tab_type, @send_project_context, @session_id, @uuid, @chatgpt_url, @show_in_sidebar, @favorite, @path_alias)
    `).run({
      name,
      created_at: ts,
      generate_images: genImages,
      nexum: nexum ? 1 : 0,
      project_name: project,
      repo_ssh_url: repo,
      extra_projects: extraProjects,
      task_id: taskId,
      tab_type: type,
      send_project_context: sendProjectContext ? 1 : 0,
      session_id: sessionId,
      uuid,
      chatgpt_url: chatgptUrl,
      show_in_sidebar: showInSidebar ? 1 : 0,
      favorite: 0,
      path_alias: pathAlias
    });
    return { id: lastInsertRowid, uuid };
  }

  listChatTabs(nexum = null, includeArchived = true, sessionId = '') {
    let query = 'SELECT * FROM chat_tabs';
    const params = [];
    const conditions = [];

    if (sessionId) {
      conditions.push('session_id=?');
      params.push(sessionId);
    }
    if (nexum !== null) {
      conditions.push('nexum=?');
      params.push(nexum ? 1 : 0);
    }
    if (!includeArchived) {
      conditions.push('archived=0');
    }

    if (conditions.length) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    // Show most recently created tabs first
    query += ' ORDER BY id DESC';

    return this.db.prepare(query).all(...params);
  }

  renameChatTab(tabId, newName) {
    this.db.prepare("UPDATE chat_tabs SET name=? WHERE id=?").run(newName, tabId);
  }

  setChatTabPathAlias(tabId, alias = '') {
    const normalized = (alias || '').trim();
    this.db.prepare("UPDATE chat_tabs SET path_alias=? WHERE id=?").run(normalized, tabId);
  }

  setChatTabArchived(tabId, archived = 1) {
    if (archived) {
      this.db.prepare("UPDATE chat_tabs SET archived=1, archived_at=? WHERE id=?")
          .run(new Date().toISOString(), tabId);
    } else {
      this.db.prepare("UPDATE chat_tabs SET archived=0, archived_at=NULL WHERE id=?")
          .run(tabId);
    }
  }

  setChatTabFavorite(tabId, favorite = 1) {
    this.db.prepare('UPDATE chat_tabs SET favorite=? WHERE id=?')
        .run(favorite ? 1 : 0, tabId);
  }

  setProjectArchived(project, archived = 1) {
    if (!project) return;
    this.ensureProjectMeta(project);
    this.db
        .prepare(
            "UPDATE project_meta SET archived=? WHERE project=?"
        )
        .run(archived ? 1 : 0, project);
    if (archived) {
      this.db.prepare(
        "UPDATE chat_tabs SET archived=1, archived_at=? WHERE project_name=?"
      ).run(new Date().toISOString(), project);
    } else {
      this.db.prepare(
        "UPDATE chat_tabs SET archived=0, archived_at=NULL WHERE project_name=?"
      ).run(project);
    }
  }

  setProjectHidden(project, hidden = 1) {
    if (!project) return;
    this.db
        .prepare("UPDATE issues SET hidden=? WHERE project=?")
        .run(hidden ? 1 : 0, project);
  }

  setChatTabGenerateImages(tabId, enabled = 1) {
    this.db.prepare("UPDATE chat_tabs SET generate_images=? WHERE id=?")
        .run(enabled ? 1 : 0, tabId);
  }

  setChatTabModel(tabId, model = '') {
    this.db.prepare("UPDATE chat_tabs SET model_override=? WHERE id=?")
        .run(model, tabId);
  }

  getChatTabModel(tabId) {
    const row = this.db
        .prepare("SELECT model_override FROM chat_tabs WHERE id=?")
        .get(tabId);
    return row ? row.model_override || '' : '';
  }

  getChatTabGenerateImages(tabId) {
    const row = this.db
        .prepare("SELECT generate_images FROM chat_tabs WHERE id=?")
        .get(tabId);
    return row ? !!row.generate_images : true;
  }

  setChatTabSendProjectContext(tabId, enabled = 1) {
    this.db.prepare("UPDATE chat_tabs SET send_project_context=? WHERE id=?")
        .run(enabled ? 1 : 0, tabId);
  }

  getChatTabSendProjectContext(tabId) {
    const row = this.db
        .prepare("SELECT send_project_context FROM chat_tabs WHERE id=?")
        .get(tabId);
    return row ? !!row.send_project_context : false;
  }

  setChatTabConfig(tabId, project = '', repo = '', extraProjects = '', taskId = 0, type = 'chat', sendProjectContext = 0, chatgptUrl = '') {
    const genImages = type === 'design' ? 1 : 0;
    this.db.prepare(
        "UPDATE chat_tabs SET project_name=?, repo_ssh_url=?, extra_projects=?, task_id=?, tab_type=?, generate_images=?, send_project_context=?, chatgpt_url=? WHERE id=?"
    ).run(project, repo, extraProjects, taskId, type, genImages, sendProjectContext ? 1 : 0, chatgptUrl, tabId);
  }

  setChatTabParent(tabId, parentId = 0) {
    this.db.prepare('UPDATE chat_tabs SET parent_id=? WHERE id=?').run(parentId, tabId);
  }

  getChatTab(tabId, sessionId = null) {
    if (sessionId) {
      return this.db
          .prepare("SELECT * FROM chat_tabs WHERE id=? AND session_id=?")
          .get(tabId, sessionId);
    }
    return this.db.prepare("SELECT * FROM chat_tabs WHERE id=?").get(tabId);
  }

  getChatTabByUuid(uuid) {
    return this.db.prepare("SELECT * FROM chat_tabs WHERE tab_uuid=?").get(uuid);
  }

  getChatTabByPathAlias(alias, sessionId = null) {
    if (!alias) return null;
    if (sessionId) {
      return this.db
          .prepare("SELECT * FROM chat_tabs WHERE path_alias=? AND session_id=?")
          .get(alias, sessionId);
    }
    return this.db.prepare("SELECT * FROM chat_tabs WHERE path_alias=?").get(alias);
  }

  ensureDesignChatTab(sessionId = '') {
    const alias = '/chat/design';
    const existing = this.getChatTabByPathAlias(alias, sessionId || null);
    if (existing) return existing;
    const { id } = this.createChatTab(
      'Design Chat',
      0,
      '',
      '',
      '',
      0,
      'design',
      sessionId,
      0,
      '',
      0,
      alias
    );
    return this.getChatTab(id, sessionId || null);
  }

  getChatTabUuidByTaskId(taskId) {
    const row = this.db
        .prepare("SELECT tab_uuid FROM chat_tabs WHERE task_id=?")
        .get(taskId);
    return row ? row.tab_uuid : null;
  }

  duplicateChatTab(tabId, name = null) {
    const tab = this.getChatTab(tabId);
    if (!tab) return null;
    const ts = new Date().toISOString();
    const uuid = randomUUID().replace(/-/g, '').slice(0, 12);
    const newName = name || `${tab.name} Copy`;
    const { lastInsertRowid } = this.db.prepare(`
      INSERT INTO chat_tabs (name, created_at, generate_images, nexum, project_name, repo_ssh_url, extra_projects, task_id, tab_type, send_project_context, session_id, tab_uuid, chatgpt_url, show_in_sidebar, favorite, path_alias)
      VALUES (@name, @created_at, @generate_images, @nexum, @project_name, @repo_ssh_url, @extra_projects, @task_id, @tab_type, @send_project_context, @session_id, @uuid, @chatgpt_url, @show_in_sidebar, @favorite, @path_alias)
    `).run({
      name: newName,
      created_at: ts,
      generate_images: tab.generate_images,
      nexum: tab.nexum,
      project_name: tab.project_name,
      repo_ssh_url: tab.repo_ssh_url,
      extra_projects: tab.extra_projects,
      task_id: tab.task_id,
      tab_type: tab.tab_type,
      send_project_context: tab.send_project_context,
      session_id: tab.session_id,
      uuid,
      chatgpt_url: tab.chatgpt_url || '',
      show_in_sidebar: tab.show_in_sidebar ? 1 : 0,
      favorite: tab.favorite ? 1 : 0,
      path_alias: tab.path_alias || ''
    });

    this.db.prepare(`
      INSERT INTO chat_pairs (
        user_text, ai_text, model, timestamp, ai_timestamp,
        chat_tab_id, system_context, project_context, token_info,
        image_url, image_alt, image_title, image_status,
        session_id, ip_address, image_uuid, publish_portfolio, product_url
      )
      SELECT user_text, ai_text, model, timestamp, ai_timestamp,
        @new_id, system_context, project_context, token_info,
        image_url, image_alt, image_title, image_status,
        session_id, ip_address, image_uuid, publish_portfolio, product_url
      FROM chat_pairs WHERE chat_tab_id=@old_id
    `).run({ new_id: lastInsertRowid, old_id: tabId });

    return { id: lastInsertRowid, uuid };
  }

  deleteChatTab(tabId) {
    this.db.prepare("DELETE FROM chat_tabs WHERE id=?").run(tabId);
    this.db.prepare("DELETE FROM chat_pairs WHERE chat_tab_id=?").run(tabId);
  }

  deleteChatPair(id) {
    this.db.prepare("DELETE FROM chat_pairs WHERE id=?").run(id);
  }

  deleteAiPart(id) {
    this.db.prepare(
        "UPDATE chat_pairs SET ai_text='', model='', ai_timestamp=NULL, token_info=NULL WHERE id=?"
    ).run(id);
  }

  updateAiText(id, text) {
    this.db.prepare(
        "UPDATE chat_pairs SET ai_text=? WHERE id=?"
    ).run(text, id);
  }

  deleteUserPart(id) {
    this.db.prepare(
        "UPDATE chat_pairs SET user_text='' WHERE id=?"
    ).run(id);
  }

  updateUserText(id, text) {
    this.db.prepare(
        "UPDATE chat_pairs SET user_text=? WHERE id=?"
    ).run(text, id);
  }

  listProjectBranches() {
    return this.db
        .prepare("SELECT project, base_branch FROM project_branches ORDER BY project ASC")
        .all();
  }

  upsertProjectBranch(project, branch) {
    this.db.prepare(`
      INSERT INTO project_branches (project, base_branch)
      VALUES (@project, @branch)
        ON CONFLICT(project) DO UPDATE SET base_branch=excluded.base_branch
    `).run({ project, branch });
  }

  deleteProjectBranch(project) {
    this.db.prepare("DELETE FROM project_branches WHERE project=?").run(project);
  }

  ensureProjectMeta(project) {
    if (!project) return;
    this.db
        .prepare(
            "INSERT OR IGNORE INTO project_meta (project, archived) VALUES (?, 0)"
        )
        .run(project);
  }

  renameProject(oldProject, newProject) {
    const row = this.db
        .prepare("SELECT base_branch FROM project_branches WHERE project=?")
        .get(oldProject);

    const baseBranch = row ? row.base_branch : "";

    this.deleteProjectBranch(oldProject);

    if (newProject) {
      this.upsertProjectBranch(newProject, baseBranch);
      this.ensureProjectMeta(newProject);
    }

    this.db
        .prepare("UPDATE issues SET project=? WHERE project=?")
        .run(newProject, oldProject);

    this.db.prepare(
        "UPDATE chat_tabs SET project_name=? WHERE project_name=?"
    ).run(newProject, oldProject);

    const meta = this.db
        .prepare("SELECT archived FROM project_meta WHERE project=?")
        .get(oldProject);
    if (meta) {
      this.db.prepare("DELETE FROM project_meta WHERE project=?").run(oldProject);
      this.db.prepare(
          "INSERT OR REPLACE INTO project_meta (project, archived) VALUES (?, ?)"
      ).run(newProject, meta.archived);
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Chat subroutines helpers                                           */
  /* ------------------------------------------------------------------ */

  createChatSubroutine(name, trigger = "", action = "", hook = "") {
    const ts = new Date().toISOString();
    const { lastInsertRowid } = this.db
        .prepare(
            "INSERT INTO chat_subroutines (name, trigger_text, action_text, action_hook, created_at) VALUES (?, ?, ?, ?, ?, ?)"
        )
        .run(name, trigger, action, hook, ts);
    return lastInsertRowid;
  }

  listChatSubroutines() {
    return this.db
        .prepare("SELECT * FROM chat_subroutines ORDER BY id ASC")
        .all();
  }

  renameChatSubroutine(id, newName) {
    this.db
        .prepare("UPDATE chat_subroutines SET name=? WHERE id=?")
        .run(newName, id);
  }

  updateChatSubroutine(id, name, trigger = "", action = "", hook = "") {
    this.db
        .prepare(
            "UPDATE chat_subroutines SET name=?, trigger_text=?, action_text=?, action_hook=? WHERE id=?"
        )
        .run(name, trigger, action, hook, id);
  }

  getImageTitleForUrl(url) {
    const row = this.db
        .prepare("SELECT image_title FROM chat_pairs WHERE image_url=? ORDER BY id DESC LIMIT 1")
        .get(url);
    return row ? row.image_title : "";
  }

  getImageStatusForUrl(url) {
    const row = this.db
        .prepare("SELECT image_status FROM chat_pairs WHERE image_url=? ORDER BY id DESC LIMIT 1")
        .get(url);
    return row ? row.image_status : "";
  }

  getImagePortfolioForUrl(url) {
    const row = this.db
        .prepare("SELECT publish_portfolio FROM chat_pairs WHERE image_url=? ORDER BY id DESC LIMIT 1")
        .get(url);
    return row ? !!row.publish_portfolio : false;
  }

  getImageIdForUrl(url) {
    const row = this.db
        .prepare("SELECT id FROM chat_pairs WHERE image_url=? ORDER BY id DESC LIMIT 1")
        .get(url);
    return row ? row.id : null;
  }

  getImageModelForUrl(url) {
    const row = this.db
        .prepare("SELECT model FROM chat_pairs WHERE image_url=? ORDER BY id DESC LIMIT 1")
        .get(url);
    return row ? row.model : "";
  }

  getImageUuidForUrl(url) {
    const row = this.db
        .prepare("SELECT id, image_uuid FROM chat_pairs WHERE image_url=? ORDER BY id DESC LIMIT 1")
        .get(url);
    if (!row) return null;
    if (!row.image_uuid) {
      const uuid = randomUUID().split('-')[0];
      this.db.prepare("UPDATE chat_pairs SET image_uuid=? WHERE id=?").run(uuid, row.id);
      return uuid;
    }
    return row.image_uuid;
  }

  getImageSessionForUrl(url) {
    const row = this.db
        .prepare("SELECT session_id FROM chat_pairs WHERE image_url=? ORDER BY id DESC LIMIT 1")
        .get(url);
    return row ? row.session_id : "";
  }

  ensureImageSession(sessionId) {
    if (!sessionId) return;
    const exists = this.db
        .prepare("SELECT 1 FROM image_sessions WHERE session_id=?")
        .get(sessionId);
    if (!exists) {
      this.db
          .prepare(
              "INSERT INTO image_sessions (session_id, start_time) VALUES (?, ?)"
          )
          .run(sessionId, new Date().toISOString());
    }
  }

  getImageSessionStart(sessionId) {
    if (!sessionId) return null;
    const row = this.db
        .prepare("SELECT start_time FROM image_sessions WHERE session_id=?")
        .get(sessionId);
    return row ? row.start_time : null;
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
    const row = this.db
        .prepare(
            "SELECT COUNT(*) AS count FROM chat_pairs WHERE session_id=? AND image_url IS NOT NULL"
        )
        .get(sessionId);
    return row ? row.count : 0;
  }

  countImagesForIp(ipAddress) {
    if (!ipAddress) return 0;
    const row = this.db
        .prepare(
            "SELECT COUNT(*) AS count FROM chat_pairs WHERE ip_address=? AND image_url IS NOT NULL"
        )
        .get(ipAddress);
    return row ? row.count : 0;
  }

  countSearchesForSession(sessionId) {
    if (!sessionId) return 0;
    const row = this.db
        .prepare(
            `SELECT COUNT(*) AS count
               FROM chat_pairs cp
               JOIN chat_tabs ct ON cp.chat_tab_id = ct.id
              WHERE cp.session_id = ? AND ct.tab_type = 'search'`
        )
        .get(sessionId);
    return row ? row.count : 0;
  }

  countSearchesForIp(ipAddress) {
    if (!ipAddress) return 0;
    const row = this.db
        .prepare(
            `SELECT COUNT(*) AS count
               FROM chat_pairs cp
               JOIN chat_tabs ct ON cp.chat_tab_id = ct.id
              WHERE cp.ip_address = ? AND ct.tab_type = 'search'`
        )
        .get(ipAddress);
    return row ? row.count : 0;
  }

  setImageStatus(url, status) {
    const stmt = this.db.prepare("UPDATE chat_pairs SET image_status=? WHERE image_url=?");
    const info = stmt.run(status, url);
    if(info.changes === 0){
      this.createImagePair(url, '', 1, '', status, '', '', '', 0, '', '');
    }
  }

  setImageTitle(url, title) {
    const stmt = this.db.prepare("UPDATE chat_pairs SET image_title=? WHERE image_url=?");
    const info = stmt.run(title, url);
    if (info.changes === 0) {
      this.createImagePair(url, '', 1, title, '', '', '', '', 0, '', '');
    }
  }

  setImagePortfolio(url, flag) {
    const stmt = this.db.prepare("UPDATE chat_pairs SET publish_portfolio=? WHERE image_url=?");
    const info = stmt.run(flag ? 1 : 0, url);
    if(info.changes === 0){
      this.createImagePair(url, '', 1, '', '', '', '', '', flag ? 1 : 0, '', '');
    }
  }

  setProductUrl(url, productUrl) {
    const stmt = this.db.prepare("UPDATE chat_pairs SET product_url=? WHERE image_url=?");
    const info = stmt.run(productUrl, url);
    if(info.changes === 0){
      this.createImagePair(url, '', 1, '', '', '', '', '', 0, productUrl, '');
    }
  }

  getProductUrlForImage(url) {
    const row = this.db
        .prepare("SELECT product_url FROM chat_pairs WHERE image_url=? ORDER BY id DESC LIMIT 1")
        .get(url);
    return row ? row.product_url : '';
  }

  setEbayUrl(url, ebayUrl) {
    const stmt = this.db.prepare("UPDATE chat_pairs SET ebay_url=? WHERE image_url=?");
    const info = stmt.run(ebayUrl, url);
    if(info.changes === 0){
      this.createImagePair(url, '', 1, '', '', '', '', '', 0, '', ebayUrl);
    }
  }

  setEbayUrlForProductId(productId, ebayUrl) {
    const stmt = this.db.prepare(
      "UPDATE chat_pairs SET ebay_url=? WHERE product_url LIKE '%' || ? || '%'"
    );
    const info = stmt.run(ebayUrl, productId);
    return info.changes;
  }

  getEbayUrlForImage(url) {
    const row = this.db
        .prepare("SELECT ebay_url FROM chat_pairs WHERE image_url=? ORDER BY id DESC LIMIT 1")
        .get(url);
    return row ? row.ebay_url : '';
  }

  setImageHidden(url, hidden) {
    const stmt = this.db.prepare("UPDATE chat_pairs SET image_hidden=? WHERE image_url=?");
    const info = stmt.run(hidden ? 1 : 0, url);
    if(info.changes === 0){
      const id = this.createImagePair(url, '', 1, '', '', '', '', '', 0, '', '');
      this.db.prepare("UPDATE chat_pairs SET image_hidden=? WHERE id=?").run(hidden ? 1 : 0, id);
    }
  }

  getImageHiddenForUrl(url) {
    const row = this.db
        .prepare("SELECT image_hidden FROM chat_pairs WHERE image_url=? ORDER BY id DESC LIMIT 1")
        .get(url);
    return row ? !!row.image_hidden : false;
  }

  isGeneratedImage(url) {
    const row = this.db
        .prepare("SELECT 1 FROM chat_pairs WHERE image_url=? LIMIT 1")
        .get(url);
    return !!row;
  }

  setUpscaledImage(originalUrl, upscaledPath) {
    this.db
        .prepare(
            "INSERT INTO upscaled_images (original, upscaled) VALUES (?, ?) " +
            "ON CONFLICT(original) DO UPDATE SET upscaled=excluded.upscaled"
        )
        .run(originalUrl, upscaledPath);
  }

  getUpscaledImage(originalUrl) {
    const row = this.db
        .prepare("SELECT upscaled FROM upscaled_images WHERE original=?")
        .get(originalUrl);
    return row ? row.upscaled : null;
  }

  createAccount(email, passwordHash, sessionId = '', timezone = '', plan = 'Free') {
    const ts = new Date().toISOString();
    const { lastInsertRowid } = this.db
        .prepare(
            `INSERT INTO accounts (email, password_hash, session_id, created_at, timezone, plan)
             VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(email, passwordHash, sessionId, ts, timezone, plan);
    return lastInsertRowid;
  }

  getAccountByEmail(email) {
    return this.db.prepare('SELECT * FROM accounts WHERE email=?').get(email);
  }

  setAccountSession(id, sessionId) {
    this.db.prepare('UPDATE accounts SET session_id=? WHERE id=?').run(sessionId, id);
  }

  setAccountTotpSecret(id, secret) {
    this.db.prepare('UPDATE accounts SET totp_secret=? WHERE id=?').run(secret, id);
  }

  setAccountTimezone(id, timezone) {
    this.db.prepare('UPDATE accounts SET timezone=? WHERE id=?').run(timezone, id);
  }

  setAccountPlan(id, plan) {
    this.db.prepare('UPDATE accounts SET plan=? WHERE id=?').run(plan, id);
  }

  setAccountPassword(id, passwordHash) {
    this.db.prepare('UPDATE accounts SET password_hash=? WHERE id=?').run(passwordHash, id);
  }

  getAccountBySession(sessionId) {
    const account = this.db.prepare('SELECT * FROM accounts WHERE session_id=?').get(sessionId);
    if (!account) return null;
    if (account.disabled) {
      this.db.prepare("UPDATE accounts SET session_id='' WHERE id=?").run(account.id);
      return null;
    }
    return account;
  }

  mergeSessions(targetId, sourceId) {
    if (!targetId || !sourceId || targetId === sourceId) return;

    await this.db.prepare('UPDATE chat_tabs SET session_id=? WHERE session_id=?').run(targetId, sourceId);
    await this.db.prepare('UPDATE chat_pairs SET session_id=? WHERE session_id=?').run(targetId, sourceId);

    const srcStart = this.getImageSessionStart(sourceId);
    const tgtStart = this.getImageSessionStart(targetId);
    if (srcStart) {
      if (!tgtStart || new Date(srcStart) < new Date(tgtStart)) {
        this.db.prepare(
          `INSERT INTO image_sessions (session_id, start_time)
           VALUES (?, ?)
           ON CONFLICT(session_id) DO UPDATE SET start_time=excluded.start_time`
        ).run(targetId, srcStart);
      }
    }
    this.db.prepare('DELETE FROM image_sessions WHERE session_id=?').run(sourceId);
  }

  addUpworkJob(job) {
    const { lastInsertRowid } = this.db
      .prepare(
        `INSERT INTO upwork_jobs (title, link, bid, status, notes)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        job.title,
        job.link || '',
        job.bid || '',
        job.status || 'Bidding',
        job.notes || ''
      );
    return lastInsertRowid;
  }

  listUpworkJobs() {
    return this.db
      .prepare('SELECT * FROM upwork_jobs ORDER BY id DESC')
      .all();
  }

  deleteUpworkJob(id) {
    this.db.prepare('DELETE FROM upwork_jobs WHERE id=?').run(id);
  }

  insertAmazonSkus(list) {
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO amazon_skus (sku, asin, title, created_at)
       VALUES (?, ?, ?, ?)`
    );
    const now = new Date().toISOString();
    const insertMany = this.db.transaction(arr => {
      for (const s of arr) {
        if (!s.sku || !s.asin) continue;
        stmt.run(s.sku, s.asin, s.title || '', now);
      }
    });
    insertMany(list);
  }

  listAmazonSkus() {
    return this.db.prepare('SELECT * FROM amazon_skus ORDER BY id DESC').all();
  }

  getAsinForSku(sku) {
    const row = this.db.prepare('SELECT asin FROM amazon_skus WHERE sku=?').get(sku);
    return row ? row.asin : null;
  }

  listTables() {
    return this.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      .all()
      .map((row) => row.name);
  }

  getTableData(tableName, limit = 200) {
    const tables = this.listTables();
    if (!tables.includes(tableName)) {
      throw new Error(`Unknown table: ${tableName}`);
    }
    const safeName = `"${tableName.replace(/"/g, "\"\"")}"`;
    const columnInfo = this.db.prepare(`PRAGMA table_info(${safeName})`).all();
    const columns = columnInfo.map((col) => col.name);
    const rows = this.db
      .prepare(`SELECT * FROM ${safeName} LIMIT ?`)
      .all(limit);
    return { columns, rows, limit, rowCount: rows.length };
  }
}
