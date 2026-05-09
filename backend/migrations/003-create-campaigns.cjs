'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();

    if (!tables.includes('campaigns')) {
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
    }

    // Idempotent CHECK constraint: only add if not already present. Skips
    // cleanly on pre-sequelize-cli volumes that carried this constraint
    // inline from the legacy schema.
    const [existing] = await queryInterface.sequelize.query(
      "SELECT 1 FROM pg_constraint WHERE conname = 'campaigns_status_check' AND conrelid = 'campaigns'::regclass"
    );
    if (existing.length === 0) {
      await queryInterface.sequelize.query(
        "ALTER TABLE campaigns ADD CONSTRAINT campaigns_status_check CHECK (status IN ('draft', 'scheduled', 'sending', 'sent'))"
      );
    }

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_campaigns_created_by_created_at
        ON campaigns (created_by, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_campaigns_status
        ON campaigns (status);
      CREATE INDEX IF NOT EXISTS idx_campaigns_scheduled_at
        ON campaigns (scheduled_at)
        WHERE status = 'scheduled';
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('campaigns');
  },
};
