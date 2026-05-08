'use strict';

const bcrypt = require('bcrypt');

const DEMO_EMAIL = 'demo@example.com';
const RECIPIENT_EMAILS = [
  'alice@example.com',
  'bob@example.com',
  'carol@example.com',
  'dave@example.com',
  'eve@example.com',
];

module.exports = {
  async up(queryInterface) {
    const password_hash = await bcrypt.hash('passworD@123', 12);
    const now = new Date();

    const [user] = await queryInterface.bulkInsert(
      'users',
      [{ email: DEMO_EMAIL, name: 'Demo User', password_hash, created_at: now }],
      { returning: ['id'] }
    );
    const userId = user.id;

    const recipientRows = await queryInterface.bulkInsert(
      'recipients',
      RECIPIENT_EMAILS.map((email) => ({
        email,
        name: email.split('@')[0],
        created_at: now,
      })),
      { returning: ['id'] }
    );
    const recipientIds = recipientRows.map((r) => r.id);

    const [draft] = await queryInterface.bulkInsert(
      'campaigns',
      [
        {
          name: 'Spring Sale',
          subject: "Don't miss our spring sale!",
          body: 'Big discounts await you...',
          status: 'draft',
          created_by: userId,
          created_at: now,
          updated_at: now,
        },
      ],
      { returning: ['id'] }
    );

    const [sent] = await queryInterface.bulkInsert(
      'campaigns',
      [
        {
          name: 'Welcome Email',
          subject: 'Welcome aboard!',
          body: 'Thanks for joining us...',
          status: 'sent',
          created_by: userId,
          created_at: now,
          updated_at: now,
        },
      ],
      { returning: ['id'] }
    );

    await queryInterface.bulkInsert(
      'campaign_recipients',
      recipientIds.map((rid) => ({
        campaign_id: draft.id,
        recipient_id: rid,
        status: 'pending',
        sent_at: null,
        opened_at: null,
      }))
    );

    await queryInterface.bulkInsert(
      'campaign_recipients',
      recipientIds.map((rid, i) => {
        const delivered = i < 4;
        const opened = delivered && i < 3;
        return {
          campaign_id: sent.id,
          recipient_id: rid,
          status: delivered ? 'sent' : 'failed',
          sent_at: delivered ? now : null,
          opened_at: opened ? now : null,
        };
      })
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('campaign_recipients', null, {});
    await queryInterface.bulkDelete(
      'campaigns',
      { name: ['Spring Sale', 'Welcome Email'] },
      {}
    );
    await queryInterface.bulkDelete('recipients', { email: RECIPIENT_EMAILS }, {});
    await queryInterface.bulkDelete('users', { email: DEMO_EMAIL }, {});
  },
};
