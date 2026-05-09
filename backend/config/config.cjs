const common = {
  use_env_variable: 'DATABASE_URL',
  dialect: 'postgres',
  // Track applied seeders in a SequelizeData table (parallel to SequelizeMeta
  // for migrations). Without this, db:seed:all re-runs every seed on every
  // invocation and trips unique-constraint violations on re-seed.
  seederStorage: 'sequelize',
};

module.exports = {
  development: { ...common },
  test: { ...common },
  production: { ...common },
};
