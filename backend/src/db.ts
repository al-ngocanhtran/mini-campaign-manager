import { Sequelize } from "sequelize";

const databaseUrl =
  process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/campaign_manager";

export const sequelize = new Sequelize(databaseUrl, {
  dialect: "postgres",
  logging: process.env.NODE_ENV === "test" ? false : (msg) => console.debug(msg),
  pool: { max: 10, min: 0, acquire: 30_000, idle: 10_000 },
});

export default sequelize;
