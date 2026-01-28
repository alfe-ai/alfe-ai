const dotenv = require("dotenv");
const pg = require("pg");
const { execFile } = require("node:child_process");

dotenv.config();

const DEFAULT_QUERY = "select * from information_schema.tables;";

const sanitizeConfig = (config) => {
  if (!config || typeof config !== "object") return config;
  const safe = { ...config };
  if (safe.password) safe.password = "***";
  if (safe.connectionString) {
    safe.connectionString = safe.connectionString.replace(/:(?:[^:@/]+)@/, ":***@");
  }
  return safe;
};

const loadSecretJson = async (secretId) => {
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
  if (!region) {
    throw new Error("Missing AWS_REGION (required to read Secrets Manager secret).");
  }
  const secretString = await new Promise((resolve, reject) => {
    execFile(
      "aws",
      [
        "secretsmanager",
        "get-secret-value",
        "--region",
        region,
        "--secret-id",
        secretId,
        "--query",
        "SecretString",
        "--output",
        "text",
      ],
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(stdout.trim());
      }
    );
  });

  if (!secretString) {
    throw new Error("SecretString is empty (binary secrets not supported by this script).");
  }

  try {
    return JSON.parse(secretString);
  } catch (e) {
    throw new Error("SecretString is not valid JSON.");
  }
};

const buildDbConfig = async () => {
  const {
    AWS_DB_URL,
    AWS_DB_HOST,
    AWS_DB_USER,
    AWS_DB_PASSWORD,
    AWS_DB_NAME,
    AWS_DB_PORT,
    AWS_DB_SECRET_ARN,
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

  if (AWS_DB_SECRET_ARN) {
    const secret = await loadSecretJson(AWS_DB_SECRET_ARN);

    if (!config.host && secret.host) config.host = secret.host;
    if (!config.port && secret.port) config.port = Number(secret.port);
    if (!config.database && (secret.dbname || secret.database)) {
      config.database = secret.dbname || secret.database;
    }
    if (!config.user && secret.username) config.user = secret.username;

    if (secret.password) config.password = String(secret.password);
  }

  if (process.env.AWS_DB_SSL === "true" || process.env.AWS_DB_SSL_MODE) {
    config.ssl = {
      rejectUnauthorized: process.env.AWS_DB_SSL_REJECT_UNAUTHORIZED !== "false",
    };
    if (process.env.AWS_DB_SSL_CA) config.ssl.ca = process.env.AWS_DB_SSL_CA;
  }

  return config;
};

const run = async () => {
  const query = process.argv.slice(2).join(" ").trim() || DEFAULT_QUERY;

  const config = await buildDbConfig();

  if (!config.connectionString && (!config.host || !config.user || !config.database)) {
    console.error(
      "[rdsshell] Missing DB config. Provide AWS_DB_URL or AWS_DB_HOST/AWS_DB_USER/AWS_DB_NAME (or AWS_DB_SECRET_ARN)."
    );
    process.exitCode = 1;
    return;
  }
  if (!config.connectionString && (config.password == null || config.password === "")) {
    console.error(
      "[rdsshell] Missing DB password. Set AWS_DB_PASSWORD or AWS_DB_SECRET_ARN (Secrets Manager)."
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
    if (result.rows?.length) console.table(result.rows);
  } catch (error) {
    console.error("[rdsshell] Query failed:", error?.message || error);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => undefined);
  }
};

run().catch((e) => {
  console.error("[rdsshell] Fatal:", e?.message || e);
  process.exitCode = 1;
});
