#!/usr/bin/env python3
"""
Script to add a 'model' column to the alfecode_runs database table.
This modifies rds_store.js to include the model field in:
1. CREATE TABLE statement
2. ALTER TABLE statement (for existing databases)
3. INSERT statement (extracting model from run object)
"""

from pathlib import Path

def update_rds_store():
    file_path = Path("/git/sterling/3528f51b-a217-47c2-bcd4-964814ed9232/alfe-ai-1771874621389/AlfeCode/rds_store.js")
    content = file_path.read_text()

    # 1. Update CREATE TABLE - add model column after branch column
    old_create_table = """      await this.pool.query(`CREATE TABLE IF NOT EXISTS ${ALFECODE_RUNS_TABLE} (
        session_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        numeric_id BIGINT,
        status TEXT DEFAULT '',
        final_output_message TEXT DEFAULT '',
        created_at TEXT DEFAULT '',
        updated_at TEXT DEFAULT '',
        payload_json TEXT NOT NULL,
        account_id INTEGER,
        branch TEXT DEFAULT '',
        PRIMARY KEY (session_id, run_id)
      );`);"""

    new_create_table = """      await this.pool.query(`CREATE TABLE IF NOT EXISTS ${ALFECODE_RUNS_TABLE} (
        session_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        numeric_id BIGINT,
        status TEXT DEFAULT '',
        final_output_message TEXT DEFAULT '',
        created_at TEXT DEFAULT '',
        updated_at TEXT DEFAULT '',
        payload_json TEXT NOT NULL,
        account_id INTEGER,
        branch TEXT DEFAULT '',
        model TEXT DEFAULT '',
        PRIMARY KEY (session_id, run_id)
      );`);"""

    content = content.replace(old_create_table, new_create_table)

    # 2. Add ALTER TABLE for model column - after the branch ALTER TABLE
    old_branch_alter = """      await this.pool.query(
        `ALTER TABLE ${ALFECODE_RUNS_TABLE}
         ADD COLUMN IF NOT EXISTS branch TEXT DEFAULT ''`
      );"""

    new_branch_alter = """      await this.pool.query(
        `ALTER TABLE ${ALFECODE_RUNS_TABLE}
         ADD COLUMN IF NOT EXISTS branch TEXT DEFAULT ''`
      );
      await this.pool.query(
        `ALTER TABLE ${ALFECODE_RUNS_TABLE}
         ADD COLUMN IF NOT EXISTS model TEXT DEFAULT ''`
      );"""

    content = content.replace(old_branch_alter, new_branch_alter)

    # 3. Extract model from run object - after branch extraction
    old_branch_extract = """        // Extract branch from run
        const branch = ((run.branchName || run.gitBranch || run.branch || '') ?? '').toString().trim();"""

    new_branch_extract = """        // Extract branch from run
        const branch = ((run.branchName || run.gitBranch || run.branch || '') ?? '').toString().trim();

        // Extract model from run
        const model = (run.model || run.modelId || '').toString().trim();"""

    content = content.replace(old_branch_extract, new_branch_extract)

    # 4. Update INSERT statement - add model column and parameter
    old_insert = """        await client.query(
          `INSERT INTO ${ALFECODE_RUNS_TABLE}
           (session_id, run_id, numeric_id, status, final_output_message, created_at, updated_at, payload_json, account_id, branch)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            sessionId,
            runId,
            numericId,
            status,
            finalOutputMessage,
            createdAt,
            updatedAt,
            JSON.stringify(run),
            accountId,
            branch,
          ]
        );"""

    new_insert = """        await client.query(
          `INSERT INTO ${ALFECODE_RUNS_TABLE}
           (session_id, run_id, numeric_id, status, final_output_message, created_at, updated_at, payload_json, account_id, branch, model)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            sessionId,
            runId,
            numericId,
            status,
            finalOutputMessage,
            createdAt,
            updatedAt,
            JSON.stringify(run),
            accountId,
            branch,
            model,
          ]
        );"""

    content = content.replace(old_insert, new_insert)

    # Write the updated content
    file_path.write_text(content)
    print("Successfully updated rds_store.js")

if __name__ == "__main__":
    update_rds_store()
