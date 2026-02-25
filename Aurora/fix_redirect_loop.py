#!/usr/bin/env python3
"""Fix the redirect loop issue in /auth/shopify/start endpoint."""

from pathlib import Path

server_file = Path("/git/sterling/ab6788f1-3688-48a1-a686-efc84bb67ac0/alfe-ai-1772049587174/Aurora/src/server.js")

content = server_file.read_text()

# Find the shopify auth start endpoint and add a check to prevent redirect loop
old_code = '''app.get(SHOPIFY_AUTH_START_PATH, (req, res) => {
  const configuredShopifyStartUrl = (process.env.SHOPIFY_AUTH_START_URL || "").trim();
  const targetStartUrl =
    configuredShopifyStartUrl && configuredShopifyStartUrl !== SHOPIFY_AUTH_START_PATH
      ? configuredShopifyStartUrl
      : SHOPIFY_AUTH_DEFAULT_START_URL;

  try {
    const redirectUrl = new URL(targetStartUrl, CODE_ALFE_REDIRECT_TARGET);
    for (const [key, value] of Object.entries(req.query || {})) {
      if (Array.isArray(value)) {
        value.forEach((item) => {
          if (typeof item === "string") {
            redirectUrl.searchParams.append(key, item);
          }
        });
      } else if (typeof value === "string") {
        redirectUrl.searchParams.set(key, value);
      }
    }
    return res.redirect(302, redirectUrl.toString());
  } catch (error) {
    console.error("[Server Debug] Failed to build Shopify auth redirect URL:", error);
    return res.status(500).send("Unable to start Shopify authentication.");
  }
});'''

new_code = '''app.get(SHOPIFY_AUTH_START_PATH, (req, res) => {
  const configuredShopifyStartUrl = (process.env.SHOPIFY_AUTH_START_URL || "").trim();
  const targetStartUrl =
    configuredShopifyStartUrl && configuredShopifyStartUrl !== SHOPIFY_AUTH_START_PATH
      ? configuredShopifyStartUrl
      : SHOPIFY_AUTH_DEFAULT_START_URL;

  try {
    const redirectUrl = new URL(targetStartUrl, CODE_ALFE_REDIRECT_TARGET);

    // Prevent redirect loop: if redirecting to same host, use CODE_ALFE_REDIRECT_TARGET instead
    const requestHost = req.get("host");
    if (redirectUrl.hostname === requestHost) {
      console.debug("[Server Debug] Detected potential redirect loop, redirecting to CODE_ALFE_REDIRECT_TARGET");
      redirectUrl.hostname = new URL(CODE_ALFE_REDIRECT_TARGET).hostname;
      redirectUrl.protocol = new URL(CODE_ALFE_REDIRECT_TARGET).protocol;
      if (new URL(CODE_ALFE_REDIRECT_TARGET).port) {
        redirectUrl.port = new URL(CODE_ALFE_REDIRECT_TARGET).port;
      } else {
        redirectUrl.port = "";
      }
    }

    for (const [key, value] of Object.entries(req.query || {})) {
      if (Array.isArray(value)) {
        value.forEach((item) => {
          if (typeof item === "string") {
            redirectUrl.searchParams.append(key, item);
          }
        });
      } else if (typeof value === "string") {
        redirectUrl.searchParams.set(key, value);
      }
    }
    return res.redirect(302, redirectUrl.toString());
  } catch (error) {
    console.error("[Server Debug] Failed to build Shopify auth redirect URL:", error);
    return res.status(500).send("Unable to start Shopify authentication.");
  }
});'''

if old_code in content:
    content = content.replace(old_code, new_code)
    server_file.write_text(content)
    print("✓ Fixed redirect loop issue in /auth/shopify/start endpoint")
else:
    print("✗ Could not find the target code to replace")
    print("This might mean the code was already modified or has a different format")
