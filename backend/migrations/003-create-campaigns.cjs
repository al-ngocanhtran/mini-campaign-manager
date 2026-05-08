'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('campaigns', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      subject: {
        type: Sequelize.STRING(500),
        allowNull: false,
      },
      body: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      status: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'draft',
      },
      scheduled_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      created_by: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      created_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('NOW()'),
      },
      updated_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('NOW()'),
      },
    });

    await queryInterface.sequelize.query(
      "ALTER TABLE campaigns ADD CONSTRAINT campaigns_status_check CHECK (status IN ('draft', 'scheduled', 'sending', 'sent'))"
    );

    await queryInterface.addIndex('campaigns', {
      name: 'idx_campaigns_created_by_created_at',
      fields: ['created_by', { name: 'created_at', order: 'DESC' }],
    });

    await queryInterface.addIndex('campaigns', {
      name: 'idx_campaigns_status',
      fields: ['status'],
    });

    await queryInterface.addIndex('campaigns', {
      name: 'idx_campaigns_scheduled_at',
      fields: ['scheduled_at'],
      where: { status: 'scheduled' },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('campaigns');
  },
};
