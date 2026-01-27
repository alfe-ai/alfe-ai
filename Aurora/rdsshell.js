import dotenv from "dotenv";
import pg from "pg";
import { Signer } from "@aws-sdk/rds-signer";

dotenv.config();

const DEFAULT_QUERY = "select * from information_schema.tables;";

const inferRegionFromHost = (host) => {
  // e.g. mydb.cluster-xxxx.us-west-2.rds.amazonaws.com
  const m = host?.match(/\.([a-z0-9-]+)\.rds\.amazonaws\.com$/);
  return m?.[1];
};

const buildDbConfig = () => {
  const {
    AWS_DB_URL,
    AWS_DB_HOST,
    AWS_DB_USER,
    AWS_DB_PASSWORD,
    AWS_DB_NAME,
    AWS_DB_PORT,
    AWS_DB_SSL,
    AWS_DB_SSL_MODE,
    AWS_DB_SSL_REJECT_UNAUTHORIZED,
    AWS_DB_SSL_CA,
  } = process.env;

  const config = {};
  if (AWS_DB_URL) {
    config.connectionString = AWS_DB_URL;
  } else {
    const host = AWS_DB_HOST === "::1" ? "127.0.0.1" : AWS_DB_HOST;
    if (host) config.host = host;
    if (AWS_DB_USER) config.user = AWS_DB_USER;
    if (AWS_DB_PASSWORD) config.password = AWS_DB_PASSWORD; // normal password auth
    if (AWS_DB_NAME) config.database = AWS_DB_NAME;
    if (AWS_DB_PORT) config.port = parseInt(AWS_DB_PORT, 10);
  }

  // SSL (recommended for IAM auth; often required if rds.force_ssl is on)
  if (AWS_DB_SSL === "true" || AWS_DB_SSL_MODE) {
    config.ssl = {
      rejectUnauthorized: AWS_DB_SSL_REJECT_UNAUTHORIZED !== "false",
    };
    if (AWS_DB_SSL_CA) {
      config.ssl.ca = AWS_DB_SSL_CA;
    }
  }

  return config;
};

const sanitizeConfig = (config) => {
  if (!config || typeof config !== "object") return config;
  const safe = { ...config };
  if (safe.password) safe.password = "***";
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
      "[rdsshell] Missing AWS RDS configuration. Set AWS_DB_URL or AWS_DB_HOST/AWS_DB_USER/AWS_DB_NAME (and password or IAM)."
    );
    process.exitCode = 1;
    return;
  }

  const useIam = process.env.AWS_DB_IAM === "true";

  // If IAM is enabled, generate the auth token and use it as the password (must be a string)
  if (useIam) {
    if (config.connectionString) {
      console.error(
        "[rdsshell] IAM mode expects discrete host/user/port env vars (AWS_DB_HOST/AWS_DB_USER/AWS_DB_PORT)."
      );
      process.exitCode = 1;
      return;
    }
    if (!config.host || !config.user) {
      console.error("[rdsshell] IAM mode requires AWS_DB_HOST and AWS_DB_USER.");
      process.exitCode = 1;
      return;
    }

    // Ensure SSL is enabled in IAM mode (AWS docs show verify-full usage for IAM auth)
    if (!config.ssl) {
      config.ssl = { rejectUnauthorized: true };
    }

    const region = process.env.AWS_REGION || inferRegionFromHost(config.host);
    if (!region) {
      console.error(
        "[rdsshell] Could not infer AWS region from host. Set AWS_REGION (e.g. us-west-2)."
      );
      process.exitCode = 1;
      return;
    }

    const signer = new Signer({
      hostname: config.host,
      port: config.port ?? 5432,
      username: config.user,
      region,
      // credentials: uses default provider chain (instance profile, env vars, etc.)
    });

    config.password = await signer.getAuthToken();
  } else {
    // Non-IAM: make sure password exists (or connectionString includes it)
    if (!config.password && !config.connectionString) {
      console.error("[rdsshell] Missing AWS_DB_PASSWORD (or AWS_DB_URL with credentials).");
      process.exitCode = 1;
      return;
    }
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

run();
