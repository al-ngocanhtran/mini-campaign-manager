import bcrypt from "bcrypt";
import pool from "./db.js";

async function seed() {
  // Create a test user
  const hash = await bcrypt.hash("password123", 10);
  const {
    rows: [user],
  } = await pool.query(
    `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    ["demo@example.com", "Demo User", hash]
  );

  // Create some recipients
  const recipientEmails = [
    "alice@example.com",
    "bob@example.com",
    "carol@example.com",
    "dave@example.com",
    "eve@example.com",
  ];

  const recipientIds: number[] = [];
  for (const email of recipientEmails) {
    const {
      rows: [r],
    } = await pool.query(
      `INSERT INTO recipients (email, name) VALUES ($1, $2)
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [email, email.split("@")[0]]
    );
    recipientIds.push(r.id);
  }

  // Create a draft campaign
  const {
    rows: [draft],
  } = await pool.query(
    `INSERT INTO campaigns (name, subject, body, status, created_by)
     VALUES ($1, $2, $3, 'draft', $4) RETURNING id`,
    ["Spring Sale", "Don't miss our spring sale!", "Big discounts await you...", user.id]
  );

  for (const rid of recipientIds) {
    await pool.query(
      `INSERT INTO campaign_recipients (campaign_id, recipient_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [draft.id, rid]
    );
  }

  // Create a sent campaign
  const {
    rows: [sent],
  } = await pool.query(
    `INSERT INTO campaigns (name, subject, body, status, created_by)
     VALUES ($1, $2, $3, 'sent', $4) RETURNING id`,
    ["Welcome Email", "Welcome aboard!", "Thanks for joining us...", user.id]
  );

  const now = new Date().toISOString();
  for (let i = 0; i < recipientIds.length; i++) {
    const status = i < 4 ? "sent" : "failed";
    const openedAt = i < 3 ? now : null;
    await pool.query(
      `INSERT INTO campaign_recipients (campaign_id, recipient_id, status, sent_at, opened_at)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
      [sent.id, recipientIds[i], status, status === "sent" ? now : null, openedAt]
    );
  }

  console.log("Seed complete");
  console.log("Login: demo@example.com / password123");
  await pool.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
