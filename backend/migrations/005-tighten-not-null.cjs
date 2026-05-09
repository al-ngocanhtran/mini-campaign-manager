'use strict';

// Bring production schema in line with the model definitions, which already
// declare these columns as NOT NULL. The earlier table-create migrations
// only set DEFAULT NOW() and relied on that to populate timestamps, leaving
// the NOT NULL constraint off the column itself.

module.exports = {
  async up(queryInterface) {
    await queryInterface.changeColumn('users', 'created_at', {
      type: 'TIMESTAMP WITH TIME ZONE',
      allowNull: false,
    });
    await queryInterface.changeColumn('recipients', 'created_at', {
      type: 'TIMESTAMP WITH TIME ZONE',
      allowNull: false,
    });
    await queryInterface.changeColumn('campaigns', 'created_at', {
      type: 'TIMESTAMP WITH TIME ZONE',
      allowNull: false,
    });
    await queryInterface.changeColumn('campaigns', 'updated_at', {
      type: 'TIMESTAMP WITH TIME ZONE',
      allowNull: false,
    });
  },

  async down(queryInterface) {
    await queryInterface.changeColumn('users', 'created_at', {
      type: 'TIMESTAMP WITH TIME ZONE',
      allowNull: true,
    });
    await queryInterface.changeColumn('recipients', 'created_at', {
      type: 'TIMESTAMP WITH TIME ZONE',
      allowNull: true,
    });
    await queryInterface.changeColumn('campaigns', 'created_at', {
      type: 'TIMESTAMP WITH TIME ZONE',
      allowNull: true,
    });
    await queryInterface.changeColumn('campaigns', 'updated_at', {
      type: 'TIMESTAMP WITH TIME ZONE',
      allowNull: true,
    });
  },
};
