import "dotenv/config";
import { defineConfig } from "drizzle-kit";
import { normalizeDbUrl } from "./src/lib/db-url";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: normalizeDbUrl(process.env.DATABASE_URL)! },
});
