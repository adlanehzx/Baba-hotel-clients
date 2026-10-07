import { defineConfig } from "drizzle-kit";

// Génère les migrations SQL (dossier migrations/), appliquées ensuite avec
//   npx wrangler d1 migrations apply DB --remote
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./migrations",
  dialect: "sqlite",
});
