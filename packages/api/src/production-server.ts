import { ConfigurationError } from "./config.js";
import { startTradeLedgerApi } from "./main.js";

/**
 * Production entry point. Forces TRADELEDGER_ENV=production before config
 * validation, so this process refuses to boot unless:
 *
 *   - SUPABASE_URL is set (JWT verification; the static dev token is rejected)
 *   - API_HOST and CORS_ORIGINS are set explicitly
 *
 * Required environment: SUPABASE_URL, API_HOST, CORS_ORIGINS.
 * Optional: API_PORT (default 3000), SUPABASE_JWT_AUDIENCE, RATE_LIMIT_*,
 * TRADELEDGER_DATA_DIR, TRADELEDGER_ACCOUNT_IDS, TRADELEDGER_MARKET_DATA_INSTRUMENTS.
 */
process.env.TRADELEDGER_ENV ??= "production";

try {
  startTradeLedgerApi(process.env);
} catch (error) {
  if (error instanceof ConfigurationError) process.exit(1);
  throw error;
}