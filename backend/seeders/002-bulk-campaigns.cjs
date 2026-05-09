'use strict';

const bcrypt = require('bcrypt');

const ADMIN_COUNT = 5;
const RECIPIENT_COUNT = 30;
const CAMPAIGN_COUNT = 20;
const ADMIN_PASSWORD = 'passworD@123';

const adminEmail = (i) => `admin${i + 1}@example.com`;
const recipientEmail = (i) => `recipient${i + 1}@example.com`;

const SUBJECT_TEMPLATES = [
  'Limited time offer inside',
  'Your weekly digest',
  'A note from the team',
  'New features just landed',
  'We thought you should know',
];

const BODY_TEMPLATES = [
  'Hello {name}, here is what we have been working on this week.',
  'Hi {name}, do not miss our latest updates and exclusive deals.',
  'Hey {name}, a quick heads up about something new for you.',
  'Greetings {name}, your monthly summary is ready to read.',
  'Dear {name}, thanks for being part of our community.',
];

module.exports = {
  async up(queryInterface) {
    const now = new Date();

    await queryInterface.sequelize.transaction(async (t) => {
      const password_hash = await bcrypt.hash(ADMIN_PASSWORD, 12);

      const adminEmails = Array.from({ length: ADMIN_COUNT }, (_, i) => adminEmail(i));
      const [existingAdmins] = await queryInterface.sequelize.query(
        'SELECT id, email FROM users WHERE email IN (:emails)',
        { replacements: { emails: adminEmails }, transaction: t }
      );
      const existingAdminEmails = new Set(existingAdmins.map((u) => u.email));

      const adminsToInsert = adminEmails
        .filter((email) => !existingAdminEmails.has(email))
        .map((email, idx) => ({
          email,
          name: `Admin ${email.match(/admin(\d+)/)[1]}`,
          password_hash,
          created_at: now,
        }));

      if (adminsToInsert.length > 0) {
        await queryInterface.bulkInsert('users', adminsToInsert, { transaction: t });
      }

      const [allAdmins] = await queryInterface.sequelize.query(
        'SELECT id, email FROM users WHERE email IN (:emails) ORDER BY email',
        { replacements: { emails: adminEmails }, transaction: t }
      );
      const adminIds = allAdmins.map((u) => u.id);

      const recipientEmails = Array.from({ length: RECIPIENT_COUNT }, (_, i) =>
        recipientEmail(i)
      );
      const [existingRecipients] = await queryInterface.sequelize.query(
        'SELECT email FROM recipients WHERE email IN (:emails)',
        { replacements: { emails: recipientEmails }, transaction: t }
      );
      const existingRecipientEmails = new Set(existingRecipients.map((r) => r.email));

      const recipientsToInsert = recipientEmails
        .filter((email) => !existingRecipientEmails.has(email))
        .map((email) => ({
          email,
          name: email.split('@')[0],
          created_at: now,
        }));

      if (recipientsToInsert.length > 0) {
        await queryInterface.bulkInsert('recipients', recipientsToInsert, { transaction: t });
      }

      const campaigns = Array.from({ length: CAMPAIGN_COUNT }, (_, i) => {
        const adminId = adminIds[i % adminIds.length];
        const subject = SUBJECT_TEMPLATES[i % SUBJECT_TEMPLATES.length];
        const body = BODY_TEMPLATES[i % BODY_TEMPLATES.length];
        return {
          name: `Campaign ${String(i + 1).padStart(2, '0')}`,
          subject,
          body,
          status: 'draft',
          created_by: adminId,
          created_at: now,
          updated_at: now,
        };
      });

      await queryInterface.bulkInsert('campaigns', campaigns, { transaction: t });
    });
  },

  async down(queryInterface) {
    const adminEmails = Array.from({ length: ADMIN_COUNT }, (_, i) => adminEmail(i));
    const recipientEmails = Array.from({ length: RECIPIENT_COUNT }, (_, i) =>
      recipientEmail(i)
    );

    await queryInterface.sequelize.transaction(async (t) => {
      const [admins] = await queryInterface.sequelize.query(
        'SELECT id FROM users WHERE email IN (:emails)',
        { replacements: { emails: adminEmails }, transaction: t }
      );
      const adminIds = admins.map((u) => u.id);

      if (adminIds.length > 0) {
        await queryInterface.bulkDelete(
          'campaigns',
          { created_by: adminIds, status: 'draft' },
          { transaction: t }
        );
      }

      await queryInterface.bulkDelete('recipients', { email: recipientEmails }, { transaction: t });
      await queryInterface.bulkDelete('users', { email: adminEmails }, { transaction: t });
    });
  },
};
