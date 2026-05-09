import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";
import dotenv from "dotenv";

// Resolve the monorepo root relative to this file so the loader works
// regardless of cwd (tsx, vitest, sequelize-cli all run from different roots).
// src/config/index.ts → ../../../  ==  monorepo root
// dist/config/index.js → ../../../ ==  monorepo root
const here = dirname(fileURLToPath(import.meta.url));
const monorepoRoot = resolve(here, "../../..");
const backendRoot = resolve(here, "../..");

// Project root .env wins; fall back to backend-local .env for legacy setups.
// `override: false` (dotenv default) preserves anything already set in
// process.env, so test files that set vars before importing config still win.
for (const candidate of [
  resolve(monorepoRoot, ".env"),
  resolve(backendRoot, ".env"),
]) {
  if (existsSync(candidate)) {
    dotenv.config({ path: candidate });
  }
}

const NODE_ENV = process.env.NODE_ENV ?? "development";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET && NODE_ENV !== "test") {
  throw new Error(`JWT_SECRET must be set (NODE_ENV=${NODE_ENV})`);
}
if (!JWT_SECRET) {
  console.warn("JWT_SECRET not set — using insecure test fallback.");
}

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN;
if (!JWT_EXPIRES_IN) {
  throw new Error(`JWT_EXPIRES_IN must be set (NODE_ENV=${NODE_ENV})`);
}
if (!/^\d+(ms|s|m|h|d|w|y)?$/i.test(JWT_EXPIRES_IN)) {
  throw new Error(`JWT_EXPIRES_IN has invalid format: "${JWT_EXPIRES_IN}"`);
}

export const config = {
  nodeEnv: NODE_ENV,
  isTest: NODE_ENV === "test",
  port: Number(process.env.PORT) || 3001,
  databaseUrl:
    process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@localhost:5432/campaign_manager",
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:5173",
  jwtSecret: JWT_SECRET || "dev-secret-not-for-production",
  jwtExpiresIn: JWT_EXPIRES_IN,
  rateLimitDisabled: process.env.RATE_LIMIT_DISABLED === "true",
} as const;

export type Config = typeof config;
