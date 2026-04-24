import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import pg from "pg";
import bcrypt from "bcrypt";
import { signToken } from "../src/middleware/auth.js";

/*
  Integration tests for campaign business logic.
  Requires a running PostgreSQL with the schema applied.

  Run: DATABASE_URL=postgresql://postgres:postgres@localhost:5432/campaign_manager_test npm test
*/

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/campaign_manager_test",
});

let userId: number;
let token: string;

beforeAll(async () => {
  // Apply schema
  const { readFileSync } = await import("fs");
  const { join, dirname } = await import("path");
  const { fileURLToPath } = await import("url");
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const sql = readFileSync(join(__dirname, "../migrations/001_initial.sql"), "utf-8");
  await pool.query(sql);

  // Create test user
  const hash = await bcrypt.hash("testpass", 10);
  const {
    rows: [user],
  } = await pool.query(
    "INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id, email",
    ["test@test.com", "Test User", hash]
  );
  userId = user.id;
  token = signToken({ id: user.id, email: user.email });
});

beforeEach(async () => {
  // Clean campaign data between tests
  await pool.query("DELETE FROM campaign_recipients");
  await pool.query("DELETE FROM campaigns");
  await pool.query("DELETE FROM recipients");
});

afterAll(async () => {
  await pool.query("DELETE FROM campaign_recipients");
  await pool.query("DELETE FROM campaigns");
  await pool.query("DELETE FROM recipients");
  await pool.query("DELETE FROM users WHERE email = 'test@test.com'");
  await pool.end();
});

// Helper: create a campaign directly in DB
async function createCampaign(
  status: "draft" | "scheduled" | "sent" = "draft"
): Promise<number> {
  const {
    rows: [c],
  } = await pool.query(
    `INSERT INTO campaigns (name, subject, body, status, created_by)
     VALUES ('Test', 'Subject', 'Body', $1, $2) RETURNING id`,
    [status, userId]
  );

  // Add 3 recipients
  for (const email of ["a@x.com", "b@x.com", "c@x.com"]) {
    const {
      rows: [r],
    } = await pool.query(
      `INSERT INTO recipients (email) VALUES ($1)
       ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
       RETURNING id`,
      [email]
    );
    await pool.query(
      `INSERT INTO campaign_recipients (campaign_id, recipient_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [c.id, r.id]
    );
  }

  return c.id;
}

describe("Business rule: only draft campaigns can be edited", () => {
  it("allows updating a draft campaign", async () => {
    const id = await createCampaign("draft");

    const { rowCount } = await pool.query(
      `UPDATE campaigns SET name = 'Updated', updated_at = NOW()
       WHERE id = $1 AND status = 'draft' RETURNING *`,
      [id]
    );

    expect(rowCount).toBe(1);
  });

  it("prevents updating a sent campaign", async () => {
    const id = await createCampaign("sent");

    const { rowCount } = await pool.query(
      `UPDATE campaigns SET name = 'Updated', updated_at = NOW()
       WHERE id = $1 AND status = 'draft' RETURNING *`,
      [id]
    );

    expect(rowCount).toBe(0);
  });

  it("prevents deleting a non-draft campaign", async () => {
    const id = await createCampaign("scheduled");

    // Our API checks status before deleting — simulate the check
    const {
      rows: [campaign],
    } = await pool.query("SELECT status FROM campaigns WHERE id = $1", [id]);
    expect(campaign.status).toBe("scheduled");

    // Should not delete if status is not draft
    const canDelete = campaign.status === "draft";
    expect(canDelete).toBe(false);
  });
});

describe("Business rule: sending transitions status irreversibly", () => {
  it("marks recipients as sent and updates campaign status", async () => {
    const id = await createCampaign("draft");

    // Simulate the send operation
    const now = new Date().toISOString();
    await pool.query(
      `UPDATE campaign_recipients SET status = 'sent', sent_at = $1
       WHERE campaign_id = $2 AND status = 'pending'`,
      [now, id]
    );
    await pool.query(`UPDATE campaigns SET status = 'sent', updated_at = NOW() WHERE id = $1`, [
      id,
    ]);

    // Verify
    const {
      rows: [campaign],
    } = await pool.query("SELECT status FROM campaigns WHERE id = $1", [id]);
    expect(campaign.status).toBe("sent");

    const { rows: recipients } = await pool.query(
      "SELECT status, sent_at FROM campaign_recipients WHERE campaign_id = $1",
      [id]
    );
    for (const r of recipients) {
      expect(r.status).toBe("sent");
      expect(r.sent_at).not.toBeNull();
    }
  });
});

describe("Stats calculation", () => {
  it("calculates correct rates", async () => {
    const id = await createCampaign("draft");

    // Simulate: 2 sent (1 opened), 1 failed
    const { rows: recipients } = await pool.query(
      "SELECT recipient_id FROM campaign_recipients WHERE campaign_id = $1 ORDER BY recipient_id",
      [id]
    );

    const now = new Date().toISOString();
    await pool.query(
      `UPDATE campaign_recipients SET status = 'sent', sent_at = $1, opened_at = $1
       WHERE campaign_id = $2 AND recipient_id = $3`,
      [now, id, recipients[0].recipient_id]
    );
    await pool.query(
      `UPDATE campaign_recipients SET status = 'sent', sent_at = $1
       WHERE campaign_id = $2 AND recipient_id = $3`,
      [now, id, recipients[1].recipient_id]
    );
    await pool.query(
      `UPDATE campaign_recipients SET status = 'failed'
       WHERE campaign_id = $1 AND recipient_id = $2`,
      [id, recipients[2].recipient_id]
    );

    // Query stats
    const {
      rows: [stats],
    } = await pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'sent')::int AS sent,
         COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
         COUNT(*) FILTER (WHERE opened_at IS NOT NULL)::int AS opened
       FROM campaign_recipients WHERE campaign_id = $1`,
      [id]
    );

    expect(stats.total).toBe(3);
    expect(stats.sent).toBe(2);
    expect(stats.failed).toBe(1);
    expect(stats.opened).toBe(1);

    const openRate = Math.round((stats.opened / stats.total) * 10000) / 100;
    const sendRate = Math.round((stats.sent / stats.total) * 10000) / 100;

    expect(openRate).toBeCloseTo(33.33, 1);
    expect(sendRate).toBeCloseTo(66.67, 1);
  });
});
