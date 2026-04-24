import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import request from "supertest";
import bcrypt from "bcrypt";

// Force test DB + secret BEFORE importing app (modules read env on init)
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-not-for-production";
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
let userBToken: string;

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
  userBToken = signToken({ id: userB.id, email: userB.email });
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

  it("returns 409 when editing a sent campaign", async () => {
    const id = await createCampaignWith("sent");
    const res = await request(app)
      .patch(`/campaigns/${id}`)
      .set("Authorization", `Bearer ${userAToken}`)
      .send({ name: "Nope" });
    expect(res.status).toBe(409);
  });

  it("returns 400 on empty payload", async () => {
    const id = await createCampaignWith("draft");
    const res = await request(app)
      .patch(`/campaigns/${id}`)
      .set("Authorization", `Bearer ${userAToken}`)
      .send({});
    expect(res.status).toBe(400);
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

  it("returns 409 if the campaign is not a draft", async () => {
    const id = await createCampaignWith("sent");
    const futureIso = new Date(Date.now() + 3600_000).toISOString();
    const res = await request(app)
      .post(`/campaigns/${id}/schedule`)
      .set("Authorization", `Bearer ${userAToken}`)
      .send({ scheduled_at: futureIso });
    expect(res.status).toBe(409);
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

  it("returns 409 when sent again (atomic CAS gate)", async () => {
    const id = await createCampaignWith("draft");
    await request(app).post(`/campaigns/${id}/send`).set("Authorization", `Bearer ${userAToken}`);
    const second = await request(app)
      .post(`/campaigns/${id}/send`)
      .set("Authorization", `Bearer ${userAToken}`);
    expect(second.status).toBe(409);
  });

  it("returns 409 when two concurrent sends race", async () => {
    const id = await createCampaignWith("draft");
    const [a, b] = await Promise.all([
      request(app).post(`/campaigns/${id}/send`).set("Authorization", `Bearer ${userAToken}`),
      request(app).post(`/campaigns/${id}/send`).set("Authorization", `Bearer ${userAToken}`),
    ]);
    const statuses = [a.status, b.status].sort();
    // One must win (200), the other must 409 — never two 200s
    expect(statuses).toEqual([200, 409]);
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
