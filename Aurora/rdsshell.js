import dotenv from "dotenv";
import pg from "pg";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

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

  const client = new SecretsManagerClient({ region });
  const resp = await client.send(new GetSecretValueCommand({ SecretId: secretId }));

  if (!resp.SecretString) {
    throw new Error("SecretString is empty (binary secrets not supported by this script).");
  }

  try {
    return JSON.parse(resp.SecretString);
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

  // Option A: connection string (unchanged behavior)
  if (AWS_DB_URL) {
    config.connectionString = AWS_DB_URL;
  } else {
    // Option B: explicit env vars (unchanged behavior)
    const host = AWS_DB_HOST === "::1" ? "127.0.0.1" : AWS_DB_HOST;
    if (host) config.host = host;
    if (AWS_DB_USER) config.user = AWS_DB_USER;
    if (AWS_DB_PASSWORD) config.password = AWS_DB_PASSWORD;
    if (AWS_DB_NAME) config.database = AWS_DB_NAME;
    if (AWS_DB_PORT) config.port = parseInt(AWS_DB_PORT, 10);
  }

  // Option C: Secrets Manager (fills missing fields + sets password)
  if (AWS_DB_SECRET_ARN) {
    const s = await loadSecretJson(AWS_DB_SECRET_ARN);

    // RDS-managed secrets commonly include these fields
    if (!config.host && s.host) config.host = s.host;
    if (!config.port && s.port) config.port = Number(s.port);
    if (!config.database && (s.dbname || s.database)) config.database = s.dbname || s.database;
    if (!config.user && s.username) config.user = s.username;

    // Always prefer the secret password when provided
    if (s.password) config.password = String(s.password);
  }

  // SSL
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

  // pg expects password as a string (or function). If it's missing, SCRAM can fail.
  // (pg Client config docs list password as string/function.) :contentReference[oaicite:2]{index=2}
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
