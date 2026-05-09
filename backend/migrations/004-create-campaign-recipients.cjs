'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();

    if (!tables.includes('campaign_recipients')) {
      await queryInterface.createTable('campaign_recipients', {
        campaign_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          primaryKey: true,
          references: { model: 'campaigns', key: 'id' },
          onDelete: 'CASCADE',
        },
        recipient_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          primaryKey: true,
          references: { model: 'recipients', key: 'id' },
          onDelete: 'CASCADE',
        },
        status: {
          type: Sequelize.STRING(20),
          allowNull: false,
          defaultValue: 'pending',
        },
        sent_at: {
          type: Sequelize.DATE,
          allowNull: true,
        },
        opened_at: {
          type: Sequelize.DATE,
          allowNull: true,
        },
      });
    }

    const [existing] = await queryInterface.sequelize.query(
      "SELECT 1 FROM pg_constraint WHERE conname = 'campaign_recipients_status_check' AND conrelid = 'campaign_recipients'::regclass"
    );
    if (existing.length === 0) {
      await queryInterface.sequelize.query(
        "ALTER TABLE campaign_recipients ADD CONSTRAINT campaign_recipients_status_check CHECK (status IN ('pending', 'sent', 'failed'))"
      );
    }

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_campaign_recipients_recipient_id
        ON campaign_recipients (recipient_id);
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('campaign_recipients');
  },
};
