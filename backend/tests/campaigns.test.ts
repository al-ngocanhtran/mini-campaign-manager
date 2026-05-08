import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import request from "supertest";
import bcrypt from "bcrypt";

// Force test DB + secret BEFORE importing app (modules read env on init)
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-not-for-production";
// Auth-flow tests fire >10 requests against /auth/register and /auth/login per
// run; the dedicated tests/auth-rate-limit.test.ts spec covers the limiter itself
// in isolation, so we disable it here to keep the existing suite hermetic.
process.env.RATE_LIMIT_DISABLED = "true";
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/campaign_manager_test";

const { default: app } = await import("../src/index.js");
const { sequelize, User, Campaign, Recipient, CampaignRecipient } = await import(
  "../src/models/index.js"
);
const { signToken } = await import("../src/middleware/auth.js");

const __dirname = dirname(fileURLToPath(import.meta.url));

let userAId: number;
let userAToken: string;
let userBId: number;

beforeAll(async () => {
  const sql = readFileSync(join(__dirname, "../migrations/001_initial.sql"), "utf-8");
  // Clean slate, then apply schema (idempotent via IF NOT EXISTS)
  await sequelize.query("DROP TABLE IF EXISTS campaign_recipients, campaigns, recipients, users CASCADE");
  await sequelize.query(sql);

  const hash = await bcrypt.hash("testpass123", 4);
  const userA = await User.create({ email: "alice@test.com", name: "Alice", password_hash: hash });
  const userB = await User.create({ email: "bob@test.com", name: "Bob", password_hash: hash });
  userAId = userA.id;
  userBId = userB.id;
  userAToken = signToken({ id: userA.id, email: userA.email });
});

beforeEach(async () => {
  await CampaignRecipient.destroy({ where: {}, truncate: true, cascade: true });
  await Campaign.destroy({ where: {}, truncate: true, cascade: true });
  await Recipient.destroy({ where: {}, truncate: true, cascade: true });
});

afterAll(async () => {
  await sequelize.close();
});

async function createCampaignWith(
  status: "draft" | "scheduled" | "sending" | "sent",
  ownerId = userAId,
  recipientEmails = ["r1@x.com", "r2@x.com", "r3@x.com"]
): Promise<number> {
  const campaign = await Campaign.create({
    name: "Test",
    subject: "Subject",
    body: "Body",
    status,
    created_by: ownerId,
  });
  for (const email of recipientEmails) {
    const [r] = await Recipient.findOrCreate({ where: { email }, defaults: { email, name: email } });
    await CampaignRecipient.create({ campaign_id: campaign.id, recipient_id: r.id });
  }
  return campaign.id;
}

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

describe("PATCH /campaigns/:id — draft-only edit rule", () => {
  it("allows updating a draft campaign with 200", async () => {
    const id = await createCampaignWith("draft");
    const res = await request(app)
      .patch(`/campaigns/${id}`)
      .set("Authorization", `Bearer ${userAToken}`)
      .send({ name: "Updated" });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Updated");
  });

  it("returns 409 when editing a scheduled campaign", async () => {
    const id = await createCampaignWith("scheduled");
    const res = await request(app)
      .patch(`/campaigns/${id}`)
      .set("Authorization", `Bearer ${userAToken}`)
      .send({ name: "Nope" });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/draft/i);
  });

  it("replaces the recipient list on a draft campaign", async () => {
    const id = await createCampaignWith("draft", userAId, ["old1@x.com", "old2@x.com"]);
    const res = await request(app)
      .patch(`/campaigns/${id}`)
      .set("Authorization", `Bearer ${userAToken}`)
      .send({ recipientEmails: ["new1@x.com", "new2@x.com", "new3@x.com"] });
    expect(res.status).toBe(200);

    const links = await CampaignRecipient.findAll({ where: { campaign_id: id } });
    expect(links).toHaveLength(3);

    const recipients = await Recipient.findAll({
      where: { id: links.map((l) => l.recipient_id) },
    });
    expect(recipients.map((r) => r.email).sort()).toEqual([
      "new1@x.com",
      "new2@x.com",
      "new3@x.com",
    ]);
  });

  it("returns 400 when recipientEmails is empty", async () => {
    const id = await createCampaignWith("draft");
    const res = await request(app)
      .patch(`/campaigns/${id}`)
      .set("Authorization", `Bearer ${userAToken}`)
      .send({ recipientEmails: [] });
    expect(res.status).toBe(400);
  });

  it("returns 409 when updating recipients on a scheduled campaign", async () => {
    const id = await createCampaignWith("scheduled");
    const res = await request(app)
      .patch(`/campaigns/${id}`)
      .set("Authorization", `Bearer ${userAToken}`)
      .send({ recipientEmails: ["new@x.com"] });
    expect(res.status).toBe(409);
  });
});

describe("DELETE /campaigns/:id — draft-only delete rule", () => {
  it("returns 204 for a draft campaign", async () => {
    const id = await createCampaignWith("draft");
    const res = await request(app)
      .delete(`/campaigns/${id}`)
      .set("Authorization", `Bearer ${userAToken}`);
    expect(res.status).toBe(204);
  });

  it("returns 409 for a scheduled campaign", async () => {
    const id = await createCampaignWith("scheduled");
    const res = await request(app)
      .delete(`/campaigns/${id}`)
      .set("Authorization", `Bearer ${userAToken}`);
    expect(res.status).toBe(409);
  });
});

describe("POST /campaigns/:id/schedule — future-date rule", () => {
  it("returns 422 when scheduled_at is in the past", async () => {
    const id = await createCampaignWith("draft");
    const res = await request(app)
      .post(`/campaigns/${id}/schedule`)
      .set("Authorization", `Bearer ${userAToken}`)
      .send({ scheduled_at: "2020-01-01T00:00:00Z" });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/future/i);
  });

  it("returns 200 and transitions to scheduled for a future date", async () => {
    const id = await createCampaignWith("draft");
    const futureIso = new Date(Date.now() + 3600_000).toISOString();
    const res = await request(app)
      .post(`/campaigns/${id}/schedule`)
      .set("Authorization", `Bearer ${userAToken}`)
      .send({ scheduled_at: futureIso });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("scheduled");
  });

  it("returns 409 if the campaign is not draft or scheduled", async () => {
    const id = await createCampaignWith("sent");
    const futureIso = new Date(Date.now() + 3600_000).toISOString();
    const res = await request(app)
      .post(`/campaigns/${id}/schedule`)
      .set("Authorization", `Bearer ${userAToken}`)
      .send({ scheduled_at: futureIso });
    expect(res.status).toBe(409);
  });

  it("returns 400 when scheduled_at lacks an explicit timezone offset", async () => {
    const id = await createCampaignWith("draft");
    const res = await request(app)
      .post(`/campaigns/${id}/schedule`)
      .set("Authorization", `Bearer ${userAToken}`)
      .send({ scheduled_at: "2099-01-01T10:00:00" }); // naive — no Z, no offset
    expect(res.status).toBe(400);
    expect(res.body.fields?.scheduled_at).toMatch(/timezone offset/i);
  });

  it("reschedules an already-scheduled campaign with a new future timestamp", async () => {
    const id = await createCampaignWith("scheduled");
    const futureIso = new Date(Date.now() + 7200_000).toISOString();
    const res = await request(app)
      .post(`/campaigns/${id}/schedule`)
      .set("Authorization", `Bearer ${userAToken}`)
      .send({ scheduled_at: futureIso });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("scheduled");
    expect(new Date(res.body.scheduled_at).toISOString()).toBe(futureIso);
  });
});

describe("POST /campaigns/:id/send — atomic transition", () => {
  it("transitions a draft campaign to sent and marks recipients", async () => {
    const id = await createCampaignWith("draft");
    const res = await request(app)
      .post(`/campaigns/${id}/send`)
      .set("Authorization", `Bearer ${userAToken}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("sent");

    const recipients = await CampaignRecipient.findAll({ where: { campaign_id: id } });
    expect(recipients).toHaveLength(3);
    for (const r of recipients) {
      expect(["sent", "failed"]).toContain(r.status);
      if (r.status === "sent") expect(r.sent_at).not.toBeNull();
      if (r.status === "failed") expect(r.sent_at).toBeNull();
    }
  });

  it("admits exactly one of two concurrent send requests (atomic CAS regression)", async () => {
    const id = await createCampaignWith("draft");
    const [a, b] = await Promise.all([
      request(app).post(`/campaigns/${id}/send`).set("Authorization", `Bearer ${userAToken}`),
      request(app).post(`/campaigns/${id}/send`).set("Authorization", `Bearer ${userAToken}`),
    ]);
    // Order is racy; the *set* of outcomes is the invariant.
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);

    const after = await Campaign.findByPk(id);
    expect(after?.status).toBe("sent");
  });
});

describe("GET /campaigns/:id/stats", () => {
  it("returns all zeros when there are no recipients (no divide-by-zero)", async () => {
    const campaign = await Campaign.create({
      name: "Empty",
      subject: "s",
      body: "b",
      status: "draft",
      created_by: userAId,
    });
    const res = await request(app)
      .get(`/campaigns/${campaign.id}/stats`)
      .set("Authorization", `Bearer ${userAToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 0, sent: 0, failed: 0, opened: 0, open_rate: 0, send_rate: 0 });
  });

  it("computes open_rate as opened/sent (not opened/total)", async () => {
    const campaign = await Campaign.create({
      name: "Manual",
      subject: "s",
      body: "b",
      status: "sent",
      created_by: userAId,
    });
    // 3 recipients: 2 sent (1 opened), 1 failed
    const emails = ["a@x.com", "b@x.com", "c@x.com"];
    const recipients = await Promise.all(
      emails.map((e) => Recipient.findOrCreate({ where: { email: e }, defaults: { email: e, name: e } }).then(([r]) => r))
    );
    const now = new Date();
    await CampaignRecipient.bulkCreate([
      { campaign_id: campaign.id, recipient_id: recipients[0].id, status: "sent", sent_at: now, opened_at: now },
      { campaign_id: campaign.id, recipient_id: recipients[1].id, status: "sent", sent_at: now, opened_at: null },
      { campaign_id: campaign.id, recipient_id: recipients[2].id, status: "failed", sent_at: null, opened_at: null },
    ]);

    const res = await request(app)
      .get(`/campaigns/${campaign.id}/stats`)
      .set("Authorization", `Bearer ${userAToken}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.sent).toBe(2);
    expect(res.body.failed).toBe(1);
    expect(res.body.opened).toBe(1);
    // open_rate = 1/2 = 50 (not 1/3 = 33.33)
    expect(res.body.open_rate).toBe(50);
    // send_rate = 2/3 ≈ 66.67
    expect(res.body.send_rate).toBeCloseTo(66.67, 1);
  });
});

describe("Tenant isolation", () => {
  it("returns 404 when accessing another user's campaign", async () => {
    const id = await createCampaignWith("draft", userBId);
    const res = await request(app)
      .get(`/campaigns/${id}`)
      .set("Authorization", `Bearer ${userAToken}`);
    expect(res.status).toBe(404);
  });

  it("returns 404 when deleting another user's campaign", async () => {
    const id = await createCampaignWith("draft", userBId);
    const res = await request(app)
      .delete(`/campaigns/${id}`)
      .set("Authorization", `Bearer ${userAToken}`);
    expect(res.status).toBe(404);
  });
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

describe("POST /campaigns — transactional create with recipients", () => {
  it("creates a draft campaign and attaches all recipients in 201", async () => {
    const res = await request(app)
      .post("/campaigns")
      .set("Authorization", `Bearer ${userAToken}`)
      .send({
        name: "Launch",
        subject: "Hello",
        body: "Welcome",
        recipientEmails: ["a@example.com", "b@example.com", "c@example.com"],
      });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("draft");
    expect(res.body.created_by).toBe(userAId);
    expect(res.body.recipient_count).toBe(3);

    const links = await CampaignRecipient.findAll({ where: { campaign_id: res.body.id } });
    expect(links).toHaveLength(3);
    const recipients = await Recipient.findAll();
    expect(recipients.map((r) => r.email).sort()).toEqual([
      "a@example.com",
      "b@example.com",
      "c@example.com",
    ]);
  });

  it("returns 400 when recipientEmails is empty", async () => {
    const res = await request(app)
      .post("/campaigns")
      .set("Authorization", `Bearer ${userAToken}`)
      .send({ name: "X", subject: "Y", body: "Z", recipientEmails: [] });
    expect(res.status).toBe(400);
  });

  it("rejects an invalid recipient email and writes nothing (no orphan rows)", async () => {
    const campaignsBefore = await Campaign.count();
    const recipientsBefore = await Recipient.count();

    const res = await request(app)
      .post("/campaigns")
      .set("Authorization", `Bearer ${userAToken}`)
      .send({
        name: "Bad",
        subject: "Subject",
        body: "Body",
        recipientEmails: ["valid@example.com", "not-an-email"],
      });

    expect(res.status).toBe(400);
    expect(await Campaign.count()).toBe(campaignsBefore);
    expect(await Recipient.count()).toBe(recipientsBefore);
  });
});

describe("Tenant isolation — mutating endpoints", () => {
  it("returns 404 when User A tries to PATCH User B's draft campaign and leaves it unchanged", async () => {
    const id = await createCampaignWith("draft", userBId);
    const res = await request(app)
      .patch(`/campaigns/${id}`)
      .set("Authorization", `Bearer ${userAToken}`)
      .send({ name: "Hijacked" });
    expect(res.status).toBe(404);

    const after = await Campaign.findByPk(id);
    expect(after?.name).toBe("Test");
  });

  it("returns 404 when User A tries to schedule User B's campaign and leaves it unchanged", async () => {
    const id = await createCampaignWith("draft", userBId);
    const futureIso = new Date(Date.now() + 3600_000).toISOString();
    const res = await request(app)
      .post(`/campaigns/${id}/schedule`)
      .set("Authorization", `Bearer ${userAToken}`)
      .send({ scheduled_at: futureIso });
    expect(res.status).toBe(404);

    const after = await Campaign.findByPk(id);
    expect(after?.status).toBe("draft");
    expect(after?.scheduled_at).toBeNull();
  });

  it("returns 404 when User A tries to send User B's campaign and recipients stay pending", async () => {
    const id = await createCampaignWith("draft", userBId);
    const res = await request(app)
      .post(`/campaigns/${id}/send`)
      .set("Authorization", `Bearer ${userAToken}`);
    expect(res.status).toBe(404);

    const after = await Campaign.findByPk(id);
    expect(after?.status).toBe("draft");
    const links = await CampaignRecipient.findAll({ where: { campaign_id: id } });
    expect(links).toHaveLength(3);
    for (const link of links) {
      expect(link.status).toBe("pending");
      expect(link.sent_at).toBeNull();
    }
  });
});
