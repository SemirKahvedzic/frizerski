import "dotenv/config";

/**
 * Integration tests run against the dedicated test database.
 * `DATABASE_URL_TEST` (docker-compose `postgres-test`, port 5433) overrides
 * `DATABASE_URL` before any application module reads the environment.
 * Vitest already sets NODE_ENV=test.
 */
if (process.env["DATABASE_URL_TEST"]) {
  process.env["DATABASE_URL"] = process.env["DATABASE_URL_TEST"];
}
// .env may set a verbose level for development; tests stay quiet unless asked.
process.env["LOG_LEVEL"] = process.env["TEST_LOG_LEVEL"] ?? "silent";
process.env["EMAIL_PROVIDER"] = "fake";
process.env["PUSH_PROVIDER"] = "fake";
process.env["VAPID_PUBLIC_KEY"] ??= "BFakePublicKeyOnlyUsedByTests";
process.env["STORAGE_PROVIDER"] = "fake";
process.env["BETTER_AUTH_SECRET"] ??= "integration-test-secret-0123456789abcdef0123456789";
process.env["APP_URL"] ??= "http://localhost:3000";
