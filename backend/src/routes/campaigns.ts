import { Router, Response } from "express";
import { QueryTypes } from "sequelize";
import { sequelize } from "../db.js";
import { Campaign, Recipient, CampaignRecipient } from "../models/index.js";
import { authenticate, AuthRequest } from "../middleware/auth.js";
import {
  createCampaignSchema,
  updateCampaignSchema,
  scheduleCampaignSchema,
} from "../validation/schemas.js";

const router = Router();
router.use(authenticate);

// GET /campaigns — Paginated list for the authenticated user
router.get("/", async (req: AuthRequest, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 10));
  const offset = (page - 1) * limit;

  const { rows, count } = await Campaign.findAndCountAll({
    where: { created_by: req.user!.id },
    include: [{ model: CampaignRecipient, as: "recipientLinks", attributes: [] }],
    attributes: {
      include: [[sequelize.fn("COUNT", sequelize.col("recipientLinks.recipient_id")), "recipient_count"]],
    },
    group: ["Campaign.id"],
    order: [["created_at", "DESC"]],
    limit,
    offset,
    subQuery: false,
  }).then(async (result) => {
    // findAndCountAll with group returns count as array
    const total = Array.isArray(result.count) ? result.count.length : result.count;
    return { rows: result.rows, count: total };
  });

  res.json({ campaigns: rows, total: count, page, limit });
});

// POST /campaigns — Create a new campaign (starts as draft)
router.post("/", async (req: AuthRequest, res: Response) => {
  const parsed = createCampaignSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
  }

  const { name, subject, body, recipientEmails } = parsed.data;
  const uniqueEmails = [...new Set(recipientEmails.map((e) => e.toLowerCase()))];

  const campaign = await sequelize.transaction(async (t) => {
    const created = await Campaign.create(
      { name, subject, body, created_by: req.user!.id },
      { transaction: t }
    );

    // Bulk upsert recipients
    await Recipient.bulkCreate(
      uniqueEmails.map((email) => ({ email, name: email.split("@")[0] })),
      {
        transaction: t,
        updateOnDuplicate: ["email"],
      }
    );

    const recipients = await Recipient.findAll({
      where: { email: uniqueEmails },
      transaction: t,
    });

    await CampaignRecipient.bulkCreate(
      recipients.map((r) => ({ campaign_id: created.id, recipient_id: r.id })),
      { transaction: t, ignoreDuplicates: true }
    );

    return created;
  });

  const result = campaign.toJSON() as Record<string, unknown>;
  result.recipient_count = uniqueEmails.length;
  res.status(201).json(result);
});

// GET /campaigns/:id — Campaign with full recipient list
router.get("/:id", async (req: AuthRequest, res: Response) => {
  const campaign = await Campaign.findOne({
    where: { id: req.params.id, created_by: req.user!.id },
  });

  if (!campaign) {
    return res.status(404).json({ error: "Campaign not found" });
  }

  const recipients = await sequelize.query<{
    id: number;
    email: string;
    name: string | null;
    status: string;
    sent_at: Date | null;
    opened_at: Date | null;
  }>(
    `SELECT r.id, r.email, r.name, cr.status, cr.sent_at, cr.opened_at
       FROM campaign_recipients cr
       JOIN recipients r ON r.id = cr.recipient_id
      WHERE cr.campaign_id = :campaignId
      ORDER BY r.email`,
    { replacements: { campaignId: campaign.id }, type: QueryTypes.SELECT }
  );

  res.json({ ...campaign.toJSON(), recipients });
});

// PATCH /campaigns/:id — Update a draft campaign (409 if not draft)
router.patch("/:id", async (req: AuthRequest, res: Response) => {
  const parsed = updateCampaignSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
  }

  const campaign = await Campaign.findOne({
    where: { id: req.params.id, created_by: req.user!.id },
  });

  if (!campaign) {
    return res.status(404).json({ error: "Campaign not found" });
  }

  if (campaign.status !== "draft") {
    return res.status(409).json({ error: "Only draft campaigns can be edited" });
  }

  // Whitelist columns — do NOT derive from Zod output keys (defense in depth)
  const updates: Partial<{ name: string; subject: string; body: string }> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.subject !== undefined) updates.subject = parsed.data.subject;
  if (parsed.data.body !== undefined) updates.body = parsed.data.body;

  await campaign.update(updates);
  res.json(campaign);
});

// DELETE /campaigns/:id — Delete a draft campaign (409 if not draft)
router.delete("/:id", async (req: AuthRequest, res: Response) => {
  const campaign = await Campaign.findOne({
    where: { id: req.params.id, created_by: req.user!.id },
  });

  if (!campaign) {
    return res.status(404).json({ error: "Campaign not found" });
  }

  if (campaign.status !== "draft") {
    return res.status(409).json({ error: "Only draft campaigns can be deleted" });
  }

  await campaign.destroy();
  res.status(204).end();
});

// POST /campaigns/:id/schedule — Schedule a draft campaign (409 if not draft, 422 if past)
router.post("/:id/schedule", async (req: AuthRequest, res: Response) => {
  const parsed = scheduleCampaignSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
  }

  const scheduledAt = new Date(parsed.data.scheduled_at);
  if (scheduledAt <= new Date()) {
    return res.status(422).json({ error: "scheduled_at must be a future timestamp" });
  }

  const campaign = await Campaign.findOne({
    where: { id: req.params.id, created_by: req.user!.id },
  });

  if (!campaign) {
    return res.status(404).json({ error: "Campaign not found" });
  }

  if (campaign.status !== "draft") {
    return res.status(409).json({ error: "Only draft campaigns can be scheduled" });
  }

  await campaign.update({ status: "scheduled", scheduled_at: scheduledAt });
  res.json(campaign);
});

// POST /campaigns/:id/send — Transition draft|scheduled → sending → sent.
// Atomic CAS on status gate prevents double-send races.
router.post("/:id/send", async (req: AuthRequest, res: Response) => {
  const campaignId = req.params.id;
  const userId = req.user!.id;

  const result = await sequelize.transaction(async (t) => {
    // Atomic compare-and-swap: only one concurrent request succeeds
    const [casRows] = await sequelize.query<{ id: number; status: string }>(
      `UPDATE campaigns
          SET status = 'sending', updated_at = NOW()
        WHERE id = :id AND created_by = :userId AND status IN ('draft', 'scheduled')
        RETURNING id, status`,
      { replacements: { id: campaignId, userId }, type: QueryTypes.SELECT, transaction: t }
    );

    if (!casRows) {
      // Gate failed — distinguish 404 (not found / not owned) from 409 (wrong state)
      const existing = await Campaign.findOne({
        where: { id: campaignId, created_by: userId },
        transaction: t,
      });
      if (!existing) return { status: 404 as const };
      return { status: 409 as const };
    }

    // Bulk-simulate per-recipient outcome. Single random() per row to keep
    // sent/failed/opened_at mutually consistent (a failed row has no sent_at/opened_at).
    await sequelize.query(
      `WITH rolls AS (
         SELECT recipient_id, random() AS delivery_roll, random() AS open_roll
           FROM campaign_recipients
          WHERE campaign_id = :id AND status = 'pending'
       )
       UPDATE campaign_recipients cr
          SET status   = CASE WHEN rolls.delivery_roll < 0.9 THEN 'sent' ELSE 'failed' END,
              sent_at  = CASE WHEN rolls.delivery_roll < 0.9 THEN NOW() ELSE NULL END,
              opened_at = CASE WHEN rolls.delivery_roll < 0.9 AND rolls.open_roll < 0.35
                               THEN NOW() ELSE NULL END
          FROM rolls
         WHERE cr.campaign_id = :id AND cr.recipient_id = rolls.recipient_id`,
      { replacements: { id: campaignId }, transaction: t }
    );

    await sequelize.query(
      `UPDATE campaigns SET status = 'sent', updated_at = NOW() WHERE id = :id`,
      { replacements: { id: campaignId }, transaction: t }
    );

    return { status: 200 as const };
  });

  if (result.status === 404) {
    return res.status(404).json({ error: "Campaign not found" });
  }
  if (result.status === 409) {
    return res.status(409).json({ error: "Campaign cannot be sent in its current state" });
  }

  const updated = await Campaign.findByPk(campaignId);
  res.json(updated);
});

// GET /campaigns/:id/stats — Aggregated stats
router.get("/:id/stats", async (req: AuthRequest, res: Response) => {
  const campaign = await Campaign.findOne({
    where: { id: req.params.id, created_by: req.user!.id },
    attributes: ["id"],
  });

  if (!campaign) {
    return res.status(404).json({ error: "Campaign not found" });
  }

  const [stats] = await sequelize.query<{
    total: number;
    sent: number;
    failed: number;
    opened: number;
  }>(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status = 'sent')::int AS sent,
       COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
       COUNT(*) FILTER (WHERE opened_at IS NOT NULL)::int AS opened
       FROM campaign_recipients
      WHERE campaign_id = :id`,
    { replacements: { id: campaign.id }, type: QueryTypes.SELECT }
  );

  const total = stats.total || 0;
  const sent = stats.sent || 0;
  const failed = stats.failed || 0;
  const opened = stats.opened || 0;

  // open_rate = opened / sent (returns 0 when sent === 0 per CLAUDE.md §6)
  // send_rate = sent / total (returns 0 when total === 0)
  const open_rate = sent > 0 ? Math.round((opened / sent) * 10000) / 100 : 0;
  const send_rate = total > 0 ? Math.round((sent / total) * 10000) / 100 : 0;

  res.json({ total, sent, failed, opened, open_rate, send_rate });
});

export default router;
