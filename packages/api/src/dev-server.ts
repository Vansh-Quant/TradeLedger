import { ConfigurationError } from "./config.js";
import { startTradeLedgerApi } from "./main.js";

/**
 * Development entry point.
 *
 * Defaults: loopback bind, static dev-token, explicit CORS origins, JSON state
 * in `.tradeledger-data/`. Override any value through the environment (see
 * DEPLOYMENT.md). Production uses `production-server.ts`, which requires
 * Supabase JWT verification and explicit CORS origins.
 */
try {
  startTradeLedgerApi(process.env);
} catch (error) {
  if (error instanceof ConfigurationError) process.exit(1);
  throw error;
}