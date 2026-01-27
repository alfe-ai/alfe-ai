import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

const secretId = process.env.AWS_SECRETS_MANAGER_SECRET_ID;
const region = process.env.AWS_SECRETS_MANAGER_REGION || process.env.AWS_REGION || "us-west-2";

const applySecretToEnv = (secretPayload) => {
  if (!secretPayload) return;
  if (typeof secretPayload === "string") {
    if (!process.env.AWS_DB_URL && secretPayload.startsWith("postgres")) {
      process.env.AWS_DB_URL = secretPayload;
    }
    return;
  }

  if (!process.env.AWS_DB_URL && typeof secretPayload.url === "string") {
    process.env.AWS_DB_URL = secretPayload.url;
    return;
  }

  if (!process.env.AWS_DB_URL && typeof secretPayload.connectionString === "string") {
    process.env.AWS_DB_URL = secretPayload.connectionString;
    return;
  }

  if (!process.env.AWS_DB_HOST && typeof secretPayload.host === "string") {
    process.env.AWS_DB_HOST = secretPayload.host;
  }
  if (!process.env.AWS_DB_USER && typeof secretPayload.username === "string") {
    process.env.AWS_DB_USER = secretPayload.username;
  }
  if (!process.env.AWS_DB_PASSWORD && typeof secretPayload.password === "string") {
    process.env.AWS_DB_PASSWORD = secretPayload.password;
  }
  if (!process.env.AWS_DB_NAME && typeof secretPayload.dbname === "string") {
    process.env.AWS_DB_NAME = secretPayload.dbname;
  }
  if (!process.env.AWS_DB_PORT && (typeof secretPayload.port === "number" || typeof secretPayload.port === "string")) {
    process.env.AWS_DB_PORT = String(secretPayload.port);
  }
};

const loadSecrets = async () => {
  if (!secretId) return;
  const client = new SecretsManagerClient({ region });
  const response = await client.send(
    new GetSecretValueCommand({
      SecretId: secretId,
      VersionStage: "AWSCURRENT",
    })
  );

  if (response.SecretString) {
    try {
      applySecretToEnv(JSON.parse(response.SecretString));
    } catch (error) {
      applySecretToEnv(response.SecretString);
    }
  } else if (response.SecretBinary) {
    const decoded = Buffer.from(response.SecretBinary, "base64").toString("utf-8");
    try {
      applySecretToEnv(JSON.parse(decoded));
    } catch (error) {
      applySecretToEnv(decoded);
    }
  }
};

await loadSecrets();
await import("./server.js");
