import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import * as schema from "./schema";

type Db = DrizzleD1Database<typeof schema>;

/**
 * Base D1 de la requête en cours (binding `DB` défini dans wrangler.jsonc).
 * Une instance par requête : c'est léger, D1 ne garde pas de connexion ouverte.
 */
export function getDb(): Db {
  const { env } = getCloudflareContext();
  return drizzle(env.DB, { schema });
}

/**
 * Raccourci : `db.select()…` résout la base de la requête en cours au moment de l'appel.
 * (Sur Workers, la base n'est connue qu'à l'intérieur d'une requête.)
 */
export const db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export * from "./schema";
