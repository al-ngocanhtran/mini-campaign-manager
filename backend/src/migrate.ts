import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { sequelize } from "./db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, "../migrations");

async function migrate() {
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), "utf-8");
    await sequelize.query(sql);
    console.log(`Applied: ${file}`);
  }

  console.log("Migrations complete");
  await sequelize.close();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
