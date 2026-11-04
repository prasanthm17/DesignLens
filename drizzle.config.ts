import { defineConfig } from "drizzle-kit";

const dbPath = process.env.DATABASE_URL || "./dev.db";

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "sqlite",
  dbCredentials: {
    url: dbPath,
  },
});
