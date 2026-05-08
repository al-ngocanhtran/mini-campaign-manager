'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
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

    await queryInterface.sequelize.query(
      "ALTER TABLE campaign_recipients ADD CONSTRAINT campaign_recipients_status_check CHECK (status IN ('pending', 'sent', 'failed'))"
    );

    await queryInterface.addIndex('campaign_recipients', {
      name: 'idx_campaign_recipients_recipient_id',
      fields: ['recipient_id'],
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('campaign_recipients');
  },
};
