import bcrypt from "bcrypt";
import { sequelize, User, Campaign, Recipient, CampaignRecipient } from "./models/index.js";

async function seed() {
  const password_hash = await bcrypt.hash("password123", 12);

  const [user] = await User.findOrCreate({
    where: { email: "demo@example.com" },
    defaults: { email: "demo@example.com", name: "Demo User", password_hash },
  });

  const emails = ["alice@example.com", "bob@example.com", "carol@example.com", "dave@example.com", "eve@example.com"];
  const recipients = await Promise.all(
    emails.map((email) =>
      Recipient.findOrCreate({
        where: { email },
        defaults: { email, name: email.split("@")[0] },
      }).then(([r]) => r)
    )
  );

  const draft = await Campaign.create({
    name: "Spring Sale",
    subject: "Don't miss our spring sale!",
    body: "Big discounts await you...",
    status: "draft",
    created_by: user.id,
  });

  await CampaignRecipient.bulkCreate(
    recipients.map((r) => ({ campaign_id: draft.id, recipient_id: r.id })),
    { ignoreDuplicates: true }
  );

  const sent = await Campaign.create({
    name: "Welcome Email",
    subject: "Welcome aboard!",
    body: "Thanks for joining us...",
    status: "sent",
    created_by: user.id,
  });

  const now = new Date();
  await CampaignRecipient.bulkCreate(
    recipients.map((r, i) => {
      const delivered = i < 4;
      const opened = delivered && i < 3;
      return {
        campaign_id: sent.id,
        recipient_id: r.id,
        status: delivered ? "sent" : ("failed" as const),
        sent_at: delivered ? now : null,
        opened_at: opened ? now : null,
      };
    }),
    { ignoreDuplicates: true }
  );

  console.log("Seed complete");
  console.log("Login: demo@example.com / password123");
  await sequelize.close();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
