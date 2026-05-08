const common = {
  use_env_variable: 'DATABASE_URL',
  dialect: 'postgres',
};

module.exports = {
  development: { ...common },
  test: { ...common },
  production: { ...common },
};
