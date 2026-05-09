import { QueryTypes } from "sequelize";
import { sequelize } from "../db.js";
import { Campaign, Recipient, CampaignRecipient, User } from "../models/index.js";
import { NotFoundError, ConflictError, UnprocessableError } from "../errors/http.js";

const creatorInclude = {
  model: User,
  as: "creator" as const,
  attributes: ["id", "name", "email"],
};

export type CreateCampaignInput = {
  name: string;
  subject: string;
  body: string;
  recipientEmails: string[];
};

export type UpdateCampaignInput = Partial<Omit<CreateCampaignInput, "recipientEmails">> & {
  recipientEmails?: string[];
};

export async function listCampaigns(page: number, limit: number) {
  const offset = (page - 1) * limit;
  const result = await Campaign.findAndCountAll({
    include: [
      { model: CampaignRecipient, as: "recipientLinks", attributes: [] },
      creatorInclude,
    ],
    attributes: {
      include: [
        [sequelize.fn("COUNT", sequelize.col("recipientLinks.recipient_id")), "recipient_count"],
      ],
    },
    group: ["Campaign.id", "creator.id"],
    order: [["created_at", "DESC"]],
    limit,
    offset,
    subQuery: false,
  });
  // findAndCountAll with group returns count as array
  const total = Array.isArray(result.count) ? result.count.length : result.count;
  return { campaigns: result.rows, total, page, limit };
}

export async function createCampaign(userId: number, input: CreateCampaignInput) {
  const uniqueEmails = [...new Set(input.recipientEmails.map((e) => e.toLowerCase()))];

  const created = await sequelize.transaction(async (t) => {
    const campaign = await Campaign.create(
      { name: input.name, subject: input.subject, body: input.body, created_by: userId },
      { transaction: t },
    );
    await Recipient.bulkCreate(
      uniqueEmails.map((email) => ({ email, name: email.split("@")[0] })),
      { transaction: t, updateOnDuplicate: ["email"] },
    );
    const recipients = await Recipient.findAll({ where: { email: uniqueEmails }, transaction: t });
    await CampaignRecipient.bulkCreate(
      recipients.map((r) => ({ campaign_id: campaign.id, recipient_id: r.id })),
      { transaction: t, ignoreDuplicates: true },
    );
    return campaign;
  });

  await created.reload({ include: [creatorInclude] });
  return { ...created.toJSON(), recipient_count: uniqueEmails.length };
}

export async function getCampaign(id: number) {
  const campaign = await Campaign.findOne({
    where: { id },
    include: [creatorInclude],
  });
  if (!campaign) throw new NotFoundError("Campaign not found");

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
    { replacements: { campaignId: campaign.id }, type: QueryTypes.SELECT },
  );

  return { ...campaign.toJSON(), recipient_count: recipients.length, recipients };
}

export async function updateCampaign(id: number, input: UpdateCampaignInput) {
  const campaign = await Campaign.findOne({ where: { id } });
  if (!campaign) throw new NotFoundError("Campaign not found");
  if (campaign.status !== "draft") throw new ConflictError("Only draft campaigns can be edited");

  // Whitelist columns — defense in depth (do NOT spread Zod output keys).
  const updates: Partial<{ name: string; subject: string; body: string }> = {};
  if (input.name !== undefined) updates.name = input.name;
  if (input.subject !== undefined) updates.subject = input.subject;
  if (input.body !== undefined) updates.body = input.body;

  await sequelize.transaction(async (t) => {
    if (Object.keys(updates).length > 0) await campaign.update(updates, { transaction: t });

    if (input.recipientEmails !== undefined) {
      const uniqueEmails = [...new Set(input.recipientEmails.map((e) => e.toLowerCase()))];
      await Recipient.bulkCreate(
        uniqueEmails.map((email) => ({ email, name: email.split("@")[0] })),
        { transaction: t, updateOnDuplicate: ["email"] },
      );
      const recipients = await Recipient.findAll({
        where: { email: uniqueEmails },
        transaction: t,
      });
      // Replace the campaign's recipient set: drop old links, create new.
      await CampaignRecipient.destroy({ where: { campaign_id: campaign.id }, transaction: t });
      await CampaignRecipient.bulkCreate(
        recipients.map((r) => ({ campaign_id: campaign.id, recipient_id: r.id })),
        { transaction: t, ignoreDuplicates: true },
      );
    }
  });

  await campaign.reload({ include: [creatorInclude] });
  return campaign;
}

export async function deleteCampaign(id: number) {
  const campaign = await Campaign.findOne({ where: { id } });
  if (!campaign) throw new NotFoundError("Campaign not found");
  if (campaign.status !== "draft") throw new ConflictError("Only draft campaigns can be deleted");
  await campaign.destroy();
}

export async function scheduleCampaign(id: number, scheduledAt: Date) {
  if (scheduledAt <= new Date()) {
    throw new UnprocessableError("scheduled_at must be a future timestamp");
  }
  const campaign = await Campaign.findOne({ where: { id } });
  if (!campaign) throw new NotFoundError("Campaign not found");
  if (campaign.status !== "draft") {
    throw new ConflictError("Only draft campaigns can be scheduled");
  }
  await campaign.update({ status: "scheduled", scheduled_at: scheduledAt });
  await campaign.reload({ include: [creatorInclude] });
  return campaign;
}

export async function sendCampaign(id: number) {
  // Atomic CAS on status gate prevents double-send races.
  await sequelize.transaction(async (t) => {
    const [casRows] = await sequelize.query<{ id: number; status: string }>(
      `UPDATE campaigns
          SET status = 'sending', updated_at = NOW()
        WHERE id = :id AND status IN ('draft', 'scheduled')
        RETURNING id, status`,
      { replacements: { id }, type: QueryTypes.SELECT, transaction: t },
    );
    if (!casRows) {
      const existing = await Campaign.findOne({
        where: { id },
        transaction: t,
      });
      if (!existing) throw new NotFoundError("Campaign not found");
      throw new ConflictError("Campaign cannot be sent in its current state");
    }
    // Bulk-simulate per-recipient outcome — single random() per row keeps
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
      { replacements: { id }, transaction: t },
    );
    await sequelize.query(
      `UPDATE campaigns SET status = 'sent', updated_at = NOW() WHERE id = :id`,
      { replacements: { id }, transaction: t },
    );
  });

  return await Campaign.findByPk(id, { include: [creatorInclude] });
}

export async function getCampaignStats(id: number) {
  const campaign = await Campaign.findOne({
    where: { id },
    attributes: ["id"],
  });
  if (!campaign) throw new NotFoundError("Campaign not found");

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
    { replacements: { id: campaign.id }, type: QueryTypes.SELECT },
  );

  const total = stats.total || 0;
  const sent = stats.sent || 0;
  const failed = stats.failed || 0;
  const opened = stats.opened || 0;
  // open_rate = opened / sent (returns 0 when sent === 0 per CLAUDE.md §6)
  // send_rate = sent / total (returns 0 when total === 0)
  const open_rate = sent > 0 ? Math.round((opened / sent) * 10000) / 100 : 0;
  const send_rate = total > 0 ? Math.round((sent / total) * 10000) / 100 : 0;

  return { total, sent, failed, opened, open_rate, send_rate };
}
