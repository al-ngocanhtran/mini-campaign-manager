import { Router, Response } from "express";
import pool from "../db.js";
import { authenticate, AuthRequest } from "../middleware/auth.js";
import {
  createCampaignSchema,
  updateCampaignSchema,
  scheduleCampaignSchema,
} from "../validation/schemas.js";

const router = Router();

// All campaign routes require authentication
router.use(authenticate);

// GET /campaigns — List campaigns for the authenticated user
router.get("/", async (req: AuthRequest, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 10));
  const offset = (page - 1) * limit;

  const { rows: campaigns } = await pool.query(
    `SELECT c.*,
            COUNT(cr.recipient_id)::int AS recipient_count
     FROM campaigns c
     LEFT JOIN campaign_recipients cr ON cr.campaign_id = c.id
     WHERE c.created_by = $1
     GROUP BY c.id
     ORDER BY c.created_at DESC
     LIMIT $2 OFFSET $3`,
    [req.user!.id, limit, offset]
  );

  const {
    rows: [{ count }],
  } = await pool.query("SELECT COUNT(*)::int AS count FROM campaigns WHERE created_by = $1", [
    req.user!.id,
  ]);

  res.json({ campaigns, total: count, page, limit });
});

// POST /campaigns — Create a new campaign
router.post("/", async (req: AuthRequest, res: Response) => {
  const parsed = createCampaignSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
  }

  const { name, subject, body, recipientEmails } = parsed.data;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Create campaign
    const {
      rows: [campaign],
    } = await client.query(
      `INSERT INTO campaigns (name, subject, body, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name, subject, body, req.user!.id]
    );

    // Upsert recipients and link to campaign
    for (const email of recipientEmails) {
      const {
        rows: [recipient],
      } = await client.query(
        `INSERT INTO recipients (email, name)
         VALUES ($1, $2)
         ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
         RETURNING id`,
        [email, email.split("@")[0]]
      );

      await client.query(
        `INSERT INTO campaign_recipients (campaign_id, recipient_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [campaign.id, recipient.id]
      );
    }

    await client.query("COMMIT");

    // Return campaign with recipient count
    const {
      rows: [result],
    } = await pool.query(
      `SELECT c.*, COUNT(cr.recipient_id)::int AS recipient_count
       FROM campaigns c
       LEFT JOIN campaign_recipients cr ON cr.campaign_id = c.id
       WHERE c.id = $1
       GROUP BY c.id`,
      [campaign.id]
    );

    res.status(201).json(result);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

// GET /campaigns/:id — Campaign details with recipient stats
router.get("/:id", async (req: AuthRequest, res: Response) => {
  const {
    rows: [campaign],
  } = await pool.query(
    `SELECT c.*
     FROM campaigns c
     WHERE c.id = $1 AND c.created_by = $2`,
    [req.params.id, req.user!.id]
  );

  if (!campaign) {
    return res.status(404).json({ error: "Campaign not found" });
  }

  const { rows: recipients } = await pool.query(
    `SELECT r.id, r.email, r.name, cr.status, cr.sent_at, cr.opened_at
     FROM campaign_recipients cr
     JOIN recipients r ON r.id = cr.recipient_id
     WHERE cr.campaign_id = $1
     ORDER BY r.email`,
    [req.params.id]
  );

  res.json({ ...campaign, recipients });
});

// PATCH /campaigns/:id — Update a draft campaign
router.patch("/:id", async (req: AuthRequest, res: Response) => {
  const parsed = updateCampaignSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
  }

  const {
    rows: [campaign],
  } = await pool.query("SELECT * FROM campaigns WHERE id = $1 AND created_by = $2", [
    req.params.id,
    req.user!.id,
  ]);

  if (!campaign) {
    return res.status(404).json({ error: "Campaign not found" });
  }

  if (campaign.status !== "draft") {
    return res.status(400).json({ error: "Only draft campaigns can be edited" });
  }

  const updates = parsed.data;
  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      fields.push(`${key} = $${idx}`);
      values.push(value);
      idx++;
    }
  }

  if (fields.length === 0) {
    return res.json(campaign);
  }

  fields.push(`updated_at = NOW()`);
  values.push(req.params.id);

  const {
    rows: [updated],
  } = await pool.query(
    `UPDATE campaigns SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`,
    values
  );

  res.json(updated);
});

// DELETE /campaigns/:id — Delete a draft campaign
router.delete("/:id", async (req: AuthRequest, res: Response) => {
  const {
    rows: [campaign],
  } = await pool.query("SELECT * FROM campaigns WHERE id = $1 AND created_by = $2", [
    req.params.id,
    req.user!.id,
  ]);

  if (!campaign) {
    return res.status(404).json({ error: "Campaign not found" });
  }

  if (campaign.status !== "draft") {
    return res.status(400).json({ error: "Only draft campaigns can be deleted" });
  }

  await pool.query("DELETE FROM campaigns WHERE id = $1", [req.params.id]);
  res.status(204).end();
});

// POST /campaigns/:id/schedule — Schedule a campaign
router.post("/:id/schedule", async (req: AuthRequest, res: Response) => {
  const parsed = scheduleCampaignSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
  }

  const {
    rows: [campaign],
  } = await pool.query("SELECT * FROM campaigns WHERE id = $1 AND created_by = $2", [
    req.params.id,
    req.user!.id,
  ]);

  if (!campaign) {
    return res.status(404).json({ error: "Campaign not found" });
  }

  if (campaign.status !== "draft") {
    return res.status(400).json({ error: "Only draft campaigns can be scheduled" });
  }

  const {
    rows: [updated],
  } = await pool.query(
    `UPDATE campaigns SET status = 'scheduled', scheduled_at = $1, updated_at = NOW()
     WHERE id = $2 RETURNING *`,
    [parsed.data.scheduled_at, req.params.id]
  );

  res.json(updated);
});

// POST /campaigns/:id/send — Simulate sending a campaign
router.post("/:id/send", async (req: AuthRequest, res: Response) => {
  const {
    rows: [campaign],
  } = await pool.query("SELECT * FROM campaigns WHERE id = $1 AND created_by = $2", [
    req.params.id,
    req.user!.id,
  ]);

  if (!campaign) {
    return res.status(404).json({ error: "Campaign not found" });
  }

  if (campaign.status === "sent") {
    return res.status(400).json({ error: "Campaign has already been sent" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Simulate sending: mark all pending recipients as sent, randomly fail ~10%
    const { rows: recipients } = await client.query(
      `SELECT recipient_id FROM campaign_recipients
       WHERE campaign_id = $1 AND status = 'pending'`,
      [req.params.id]
    );

    const now = new Date().toISOString();
    for (const r of recipients) {
      const failed = Math.random() < 0.1; // 10% simulated failure rate
      await client.query(
        `UPDATE campaign_recipients
         SET status = $1, sent_at = $2
         WHERE campaign_id = $3 AND recipient_id = $4`,
        [failed ? "failed" : "sent", failed ? null : now, req.params.id, r.recipient_id]
      );
    }

    // Update campaign status
    const {
      rows: [updated],
    } = await client.query(
      `UPDATE campaigns SET status = 'sent', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id]
    );

    await client.query("COMMIT");
    res.json(updated);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

// GET /campaigns/:id/stats — Campaign statistics
router.get("/:id/stats", async (req: AuthRequest, res: Response) => {
  const {
    rows: [campaign],
  } = await pool.query("SELECT id FROM campaigns WHERE id = $1 AND created_by = $2", [
    req.params.id,
    req.user!.id,
  ]);

  if (!campaign) {
    return res.status(404).json({ error: "Campaign not found" });
  }

  const {
    rows: [stats],
  } = await pool.query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status = 'sent')::int AS sent,
       COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
       COUNT(*) FILTER (WHERE opened_at IS NOT NULL)::int AS opened
     FROM campaign_recipients
     WHERE campaign_id = $1`,
    [req.params.id]
  );

  const total = stats.total || 0;
  const sent = stats.sent || 0;
  const opened = stats.opened || 0;

  res.json({
    total,
    sent,
    failed: stats.failed || 0,
    opened,
    open_rate: total > 0 ? Math.round((opened / total) * 10000) / 100 : 0,
    send_rate: total > 0 ? Math.round((sent / total) * 10000) / 100 : 0,
  });
});

export default router;
