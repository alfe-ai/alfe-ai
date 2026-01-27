import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const DEFAULT_QUERY = "select * from information_schema.tables;";

const buildDbConfig = () => {
  const {
    AWS_DB_URL,
    AWS_DB_HOST,
    AWS_DB_USER,
    AWS_DB_PASSWORD,
    AWS_DB_NAME,
    AWS_DB_PORT
  } = process.env;

  const config = {};
  if (AWS_DB_URL) {
    config.connectionString = AWS_DB_URL;
  } else {
    const host = AWS_DB_HOST === "::1" ? "127.0.0.1" : AWS_DB_HOST;
    if (host) config.host = host;
    if (AWS_DB_USER) config.user = AWS_DB_USER;
    if (AWS_DB_PASSWORD) config.password = AWS_DB_PASSWORD;
    if (AWS_DB_NAME) config.database = AWS_DB_NAME;
    if (AWS_DB_PORT) config.port = parseInt(AWS_DB_PORT, 10);
  }

  if (process.env.AWS_DB_SSL === "true" || process.env.AWS_DB_SSL_MODE) {
    config.ssl = {
      rejectUnauthorized: process.env.AWS_DB_SSL_REJECT_UNAUTHORIZED !== "false"
    };
    if (process.env.AWS_DB_SSL_CA) {
      config.ssl.ca = process.env.AWS_DB_SSL_CA;
    }
  }

  return config;
};

const sanitizeConfig = (config) => {
  if (!config || typeof config !== "object") return config;
  const safe = { ...config };
  if (safe.password) {
    safe.password = "***";
  }
  if (safe.connectionString) {
    safe.connectionString = safe.connectionString.replace(/:(?:[^:@/]+)@/, ":***@");
  }
  return safe;
};

const run = async () => {
  const query = process.argv.slice(2).join(" ").trim() || DEFAULT_QUERY;
  const config = buildDbConfig();
  if (Object.keys(config).length === 0) {
    console.error(
      "[rdsshell] Missing AWS RDS configuration. Set AWS_DB_URL or AWS_DB_HOST/AWS_DB_USER/AWS_DB_PASSWORD/AWS_DB_NAME."
    );
    process.exitCode = 1;
    return;
  }

  console.log("[rdsshell] Connecting with config:", sanitizeConfig(config));
  const client = new pg.Client(config);
  try {
    await client.connect();
    const result = await client.query(query);
    console.log(`[rdsshell] Query OK. Rows: ${result.rowCount ?? result.rows.length}`);
    if (result.rows?.length) {
      console.table(result.rows);
    }
  } catch (error) {
    console.error("[rdsshell] Query failed:", error?.message || error);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => undefined);
  }
};

run();
