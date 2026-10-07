import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import { normalizeDbUrl } from "@/lib/db-url";

const globalForDb = globalThis as unknown as { pool?: Pool };

function makePool() {
  // Pas d'erreur ici si DATABASE_URL manque : la connexion n'est ouverte
  // qu'à la première requête (le build Next.js importe ce fichier sans base).
  return new Pool({ connectionString: normalizeDbUrl(process.env.DATABASE_URL), max: 5 });
}

// Une seule connexion réutilisée (évite d'ouvrir un pool à chaque rechargement en dev)
const pool = globalForDb.pool ?? makePool();
if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;

export const db = drizzle(pool, { schema });
export * from "./schema";
