import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";

// Bootstrap a dedicated env BEFORE importing the app so this spec gets its own
// in-memory limiter, separate from the campaigns suite which disables the limiter.
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-not-for-production";
process.env.JWT_EXPIRES_IN = "24h";
process.env.RATE_LIMIT_DISABLED = "false";
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/campaign_manager_test";

const { default: app } = await import("../src/index.js");
const { sequelize } = await import("../src/models/index.js");

beforeAll(async () => {
  // Ensure tables exist so `User.findOne` in the login path doesn't 500. Plain sync
  // (no force) lets us share a DB with tests/campaigns.test.ts without racing on
  // DROP+CREATE — the campaigns suite still owns table reset via its own force-sync.
  // The rate-limit assertions don't depend on row state; they probe nonexistent emails.
  await sequelize.sync();
});

afterAll(async () => {
  await sequelize.close();
});

describe("Auth rate limiter", () => {
  it("returns 429 after the 10th failed login from the same IP within the window", async () => {
    // 10 attempts inside the limit
    for (let i = 0; i < 10; i++) {
      const r = await request(app)
        .post("/auth/login")
        .send({ email: `nobody${i}@example.com`, password: "any-password-12345" });
      expect(r.status).toBe(401);
    }

    // 11th hits the limit
    const blocked = await request(app)
      .post("/auth/login")
      .send({ email: "nobody@example.com", password: "any-password-12345" });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toMatch(/too many/i);
  });
});
