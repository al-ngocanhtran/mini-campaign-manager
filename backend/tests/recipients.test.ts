import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";

// Force test DB + secret BEFORE importing app (modules read env on init)
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-not-for-production";
process.env.JWT_EXPIRES_IN = "24h";
process.env.RATE_LIMIT_DISABLED = "true";
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/campaign_manager_test";

const { default: app } = await import("../src/index.js");
const { sequelize, User, Recipient } = await import("../src/models/index.js");
const { signToken } = await import("../src/middleware/auth.js");

let userAToken: string;

beforeAll(async () => {
  await sequelize.sync({ force: true });

  const hash = await bcrypt.hash("testpass123", 4);
  const userA = await User.create({ email: "alice@test.com", name: "Alice", password_hash: hash });
  userAToken = signToken({ id: userA.id, email: userA.email });
});

beforeEach(async () => {
  await Recipient.destroy({ where: {}, truncate: true, cascade: true });
});

afterAll(async () => {
  await sequelize.close();
});

describe("POST /recipients", () => {
  it("creates a recipient with 201", async () => {
    const res = await request(app)
      .post("/recipients")
      .set("Authorization", `Bearer ${userAToken}`)
      .send({ email: "new@example.com", name: "New" });
    expect(res.status).toBe(201);
    expect(res.body.email).toBe("new@example.com");
  });

  it("returns 409 on duplicate email", async () => {
    await request(app)
      .post("/recipients")
      .set("Authorization", `Bearer ${userAToken}`)
      .send({ email: "dup@example.com" });
    const res = await request(app)
      .post("/recipients")
      .set("Authorization", `Bearer ${userAToken}`)
      .send({ email: "dup@example.com" });
    expect(res.status).toBe(409);
  });
});
