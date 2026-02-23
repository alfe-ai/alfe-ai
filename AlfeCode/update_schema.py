#!/usr/bin/env python3
"""
Script to update the alfecode_runs table schema to add account_id and branch columns.
Also updates the queueReplaceSessionRuns function to include these fields.
"""

import re

RDS_STORE_PATH = "/git/sterling/3528f51b-a217-47c2-bcd4-964814ed9232/alfe-ai-1771873930350/AlfeCode/rds_store.js"

def read_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()

def write_file(path, content):
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

def update_schema_creation(table_creation_sql):
    """Update the CREATE TABLE statement to add account_id and branch columns."""
    # Find the CREATE TABLE statement for alfecode_runs
    # We need to add account_id and branch columns before the PRIMARY KEY line
    
    # The current table creation ends with:
    #         payload_json TEXT NOT NULL,
    #         PRIMARY KEY (session_id, run_id)
    #   );`
    
    # We need to add:
    #         account_id INTEGER,
    #         branch TEXT DEFAULT '',
    
    old_pattern = r"(        payload_json TEXT NOT NULL,\n        PRIMARY KEY)"
    new_replacement = r"        payload_json TEXT NOT NULL,\n        account_id INTEGER,\n        branch TEXT DEFAULT '',\n        PRIMARY KEY"
    
    return re.sub(old_pattern, new_replacement, table_creation_sql)

def update_alterations(sql_content):
    """Add ALTER TABLE statements to add the new columns if they don't exist."""
    # Find the section where other ALTER TABLE statements are added
    # We'll add our ALTER TABLE statements after the PROJECTVIEW_JSON_TABLE alterations
    
    # Look for the pattern where other ALTERs are added and insert after it
    pattern = r"(      await this\.pool\.query\(\s*`ALTER TABLE \${PROJECTVIEW_JSON_TABLE}\s* ADD COLUMN IF NOT EXISTS updated_at TEXT NOT NULL DEFAULT ''\s*\);)"
    
    new_alterations = r"""\1
      await this.pool.query(
        `ALTER TABLE ${ALFECODE_RUNS_TABLE}
         ADD COLUMN IF NOT EXISTS account_id INTEGER`
      );
      await this.pool.query(
        `ALTER TABLE ${ALFECODE_RUNS_TABLE}
         ADD COLUMN IF NOT EXISTS branch TEXT DEFAULT ''`
      );"""
    
    return re.sub(pattern, new_alterations, sql_content)

def update_queue_replace_function(content):
    """Update queueReplaceSessionRuns to include account_id and branch in INSERT."""
    
    # First, we need to look up the account_id from sessionId
    # Then extract branch from each run
    
    # Find the queueReplaceSessionRuns function
    # We need to:
    # 1. Add account lookup at the start
    # 2. Modify the INSERT to include account_id and branch
    # 3. Extract branch from run object
    
    # Pattern to find the INSERT statement
    old_insert_pattern = r'''(        await client\.query\(\s*`INSERT INTO \${ALFECODE_RUNS_TABLE}
           \(session_id, run_id, numeric_id, status, final_output_message, created_at, updated_at, payload_json\)
           VALUES \(\$1, \$2, \$3, \$4, \$5, \$6, \$7, \$8\)`,'''
    
    new_insert_replacement = r'''        // Get account_id from session
        const account = await this.getAccountBySession(sessionId);
        const accountId = account?.id || null;
        
        // Extract branch from run
        const branch = ((run.branchName || run.gitBranch || run.branch || '') ?? '').toString().trim();

        await client.query(
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
        );'''
    
    content = re.sub(old_insert_pattern, new_insert_replacement, content, flags=re.MULTILINE)
    
    return content

def main():
    content = read_file(RDS_STORE_PATH)
    
    # 1. Update the CREATE TABLE statement
    # Find the CREATE TABLE for alfecode_runs
    content = update_schema_creation(content)
    
    # 2. Add ALTER TABLE statements
    content = update_alterations(content)
    
    # 3. Update queueReplaceSessionRuns to include account_id and branch
    content = update_queue_replace_function(content)
    
    write_file(RDS_STORE_PATH, content)
    print("Schema updated successfully!")

if __name__ == "__main__":
    main()
