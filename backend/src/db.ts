import { Sequelize } from "sequelize";
import { config } from "./config/index.js";

export const sequelize = new Sequelize(config.databaseUrl, {
  dialect: "postgres",
  logging: config.isTest ? false : (msg) => console.debug(msg),
  pool: { max: 10, min: 0, acquire: 30_000, idle: 10_000 },
});

export default sequelize;
