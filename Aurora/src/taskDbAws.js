import pg from 'pg';
import { randomUUID } from 'crypto';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

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

    this.pool = new pg.Pool({
      connectionString: AWS_DB_URL,
      host: AWS_DB_HOST,
      user: AWS_DB_USER,
      password: AWS_DB_PASSWORD,
      database: AWS_DB_NAME,
      port: AWS_DB_PORT ? parseInt(AWS_DB_PORT, 10) : undefined
    });
    this._init();
  }

  async _init() {
    const client = await this.pool.connect();
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

      const { rows } = await client.query('SELECT COUNT(*) AS count FROM issues');
      const issueCount = parseInt(rows[0].count, 10);
      if (issueCount === 0) {
        await this._importFromSqlite(client);
      }
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
    const client = await this.pool.connect();
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

  async getSetting(key) {
    const { rows } = await this.pool.query('SELECT value FROM settings WHERE key = $1', [key]);
    if (!rows.length) return undefined;
    try {
      return JSON.parse(rows[0].value);
    } catch {
      return rows[0].value;
    }
  }

  async setSetting(key, value) {
    const val = JSON.stringify(value);
    await this.pool.query(
      'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
      [key, val]
    );
  }

  async getSessionSetting(sessionId, key) {
    if (!sessionId) {
      return this.getSetting(key);
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

  async setSessionSetting(sessionId, key, value) {
    if (!sessionId) {
      await this.setSetting(key, value);
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

  async _importFromSqlite(client) {
    const sqlitePath = path.resolve('issues.sqlite');
    if (!fs.existsSync(sqlitePath)) {
      console.log('[TaskDBAws] SQLite DB not found, skipping import.');
      return;
    }

    console.log('[TaskDBAws] Importing data from SQLite…');
    const sqlite = new Database(sqlitePath);
    try {
      const issues = sqlite.prepare('SELECT * FROM issues').all();
      for (const row of issues) {
        await client.query(
          `INSERT INTO issues (
            github_id, repository, number, title, html_url, codex_url,
            task_id_slug, priority_number, priority, hidden,
            project, sprint, fib_points, assignee, created_at,
            closed, status, dependencies, blocking
          ) VALUES (
            $1,$2,$3,$4,$5,$6,
            $7,$8,$9,$10,
            $11,$12,$13,$14,$15,
            $16,$17,$18,$19
          )
          ON CONFLICT(github_id) DO NOTHING`,
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

      const settings = sqlite.prepare('SELECT key, value FROM settings').all();
      for (const s of settings) {
        await client.query(
          `INSERT INTO settings (key, value) VALUES ($1, $2)
           ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
          [s.key, s.value]
        );
      }
    } finally {
      sqlite.close();
    }
  }

  async createTask(title, project = '', sprint = '') {
    const client = await this.pool.connect();
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
