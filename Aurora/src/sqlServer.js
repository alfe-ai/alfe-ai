import dotenv from "dotenv";
import express from "express";
import Database from "better-sqlite3";

dotenv.config();

const port = process.env.SQL_SERVER_PORT || 7000;
const dbPath = process.env.SQLITE_DB_PATH || "issues.sqlite";

const db = new Database(dbPath);
const app = express();
app.use(express.json());

app.post("/sql", (req, res) => {
  const { sql, params } = req.body || {};
  if (!sql) {
    return res.status(400).json({ error: "sql is required" });
  }
  try {
    const stmt = db.prepare(sql);
    if (stmt.reader) {
      const rows = stmt.all(params || []);
      res.json({ rows });
    } else {
      const info = stmt.run(params || []);
      res.json({ changes: info.changes, lastInsertRowid: info.lastInsertRowid });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`SQL passthrough server listening on port ${port}`);
});
