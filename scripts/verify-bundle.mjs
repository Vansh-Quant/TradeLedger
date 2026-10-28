// Sanity-check only: import the API bundle, verify the exported module shape,
// and do NOT attempt to start a server or connect to any service.
import * as api from "../dist/api/server.mjs";

const required = [
  "default",
  "config",
  "logger",
  "errorCodes",
];

let missing = [];
for (const name of required) {
  if (api[name] === undefined) missing.push(name);
}

if (missing.length) {
  console.error("BUNDLE_API_MISSING exports:", missing.join(", "));
  process.exit(1);
}

// Config object carries the production validation gates that we verified
// separately (fail-fast on API_HOST/CORS_ORIGINS/SUPABASE_URL when unconfigured).
const cfg = api.config;
console.log("BUNDLE_API_OK config:", JSON.stringify({
  host: cfg.API_HOST,
  port: cfg.API_PORT,
  corsAllowed: Array.isArray(cfg.CORS_ORIGINS) ? cfg.CORS_ORIGINS.length : typeof cfg.CORS_ORIGINS,
  supabaseConfigured: Boolean(cfg.SUPABASE_URL),
  authPublicKey: cfg.SUPABASE_PUBLIC_KEY !== undefined,
  jwtSecret: cfg.SUPABASE_JWT_SECRET !== undefined,
  loggerLevel: cfg.LOG_LEVEL,
  maxBodyBytes: cfg.MAX_BODY_BYTES,
  rateLimitWindowMs: cfg.RATE_LIMIT_WINDOW_MS,
  rateLimitMaxRequests: cfg.RATE_LIMIT_MAX_REQUESTS,
}));
console.log("BUNDLE_API_OK exports:", required.join(", "));
