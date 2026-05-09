import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";

// Force test DB + secret BEFORE importing app (modules read env on init)
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-not-for-production";
process.env.JWT_EXPIRES_IN = "24h";
// Auth-flow tests fire >10 requests against /auth/register and /auth/login per
// run; the dedicated tests/auth-rate-limit.test.ts spec covers the limiter itself
// in isolation, so we disable it here to keep the existing suite hermetic.
process.env.RATE_LIMIT_DISABLED = "true";
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/campaign_manager_test";

const { default: app } = await import("../src/index.js");
const { sequelize, User } = await import("../src/models/index.js");

beforeAll(async () => {
  // Tests own the schema: sync from models for speed instead of running sequelize-cli migrations.
  await sequelize.sync({ force: true });

  const hash = await bcrypt.hash("testpass123", 4);
  await User.create({ email: "alice@test.com", name: "Alice", password_hash: hash });
  await User.create({ email: "bob@test.com", name: "Bob", password_hash: hash });
});

afterAll(async () => {
  await sequelize.close();
});

describe("Auth middleware", () => {
  it("returns 401 when Authorization header is missing", async () => {
    const res = await request(app).get("/campaigns");
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/authorization/i);
  });

  it("returns 401 for a malformed token", async () => {
    const res = await request(app).get("/campaigns").set("Authorization", "Bearer not-a-real-token");
    expect(res.status).toBe(401);
  });
});

describe("Auth — register + login", () => {
  it("registers a new user, returns a working JWT, and never exposes the password", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ email: "newcomer@test.com", name: "Newcomer", password: "secret-pw-12345" });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.email).toBe("newcomer@test.com");
    expect(res.body.user).not.toHaveProperty("password");
    expect(res.body.user).not.toHaveProperty("password_hash");

    const protectedRes = await request(app)
      .get("/campaigns")
      .set("Authorization", `Bearer ${res.body.token}`);
    expect(protectedRes.status).toBe(200);
  });

  it("returns 409 when registering an email that already exists", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ email: "alice@test.com", name: "Imposter", password: "another-pw-12345" });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/registered|exists/i);
  });

  it("logs in with correct credentials and returns a usable JWT", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: "alice@test.com", password: "testpass123" });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.email).toBe("alice@test.com");
    expect(res.body.user).not.toHaveProperty("password_hash");

    const protectedRes = await request(app)
      .get("/campaigns")
      .set("Authorization", `Bearer ${res.body.token}`);
    expect(protectedRes.status).toBe(200);
  });

  it("returns 401 on wrong password and does not leak a token", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: "alice@test.com", password: "definitely-wrong" });
    expect(res.status).toBe(401);
    expect(res.body.token).toBeUndefined();
  });

  it("rejects register with invalid email and returns a per-field message", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ email: "not-an-email", name: "X", password: "long-enough-pw-12345" });
    expect(res.status).toBe(400);
    expect(res.body.fields?.email).toMatch(/valid email/i);
  });

  it("rejects register with a password shorter than 12 chars", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ email: "shortpw@test.com", name: "X", password: "short-pw" });
    expect(res.status).toBe(400);
    expect(res.body.fields?.password).toMatch(/12 characters/i);
  });

  it("rejects register with a common password", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ email: "common@test.com", name: "X", password: "password1234" });
    expect(res.status).toBe(400);
    expect(res.body.fields?.password).toMatch(/too common/i);
  });

  it("normalizes email on register so login works with any casing or whitespace", async () => {
    const reg = await request(app)
      .post("/auth/register")
      .send({ email: "  Foo@Example.COM  ", name: "Foo", password: "long-enough-pw-12345" });
    expect(reg.status).toBe(201);
    expect(reg.body.user.email).toBe("foo@example.com");

    const login = await request(app)
      .post("/auth/login")
      .send({ email: "foo@example.com", password: "long-enough-pw-12345" });
    expect(login.status).toBe(200);
  });

  it("returns identical 401 body for unknown email vs wrong password (no enumeration leak)", async () => {
    const unknown = await request(app)
      .post("/auth/login")
      .send({ email: "ghost@test.com", password: "any-password-12345" });
    const wrongPw = await request(app)
      .post("/auth/login")
      .send({ email: "alice@test.com", password: "any-password-12345" });

    expect(unknown.status).toBe(401);
    expect(wrongPw.status).toBe(401);
    expect(unknown.body).toEqual({ error: "Invalid email or password" });
    expect(wrongPw.body).toEqual({ error: "Invalid email or password" });
    expect(unknown.body).toEqual(wrongPw.body);
    expect(unknown.body).not.toHaveProperty("fields");
  });
});
