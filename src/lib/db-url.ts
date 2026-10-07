/**
 * Prépare l'URL de la base pour le pilote `pg`.
 * Les serveurs Supabase utilisent un certificat signé par leur propre autorité :
 * on chiffre la connexion sans vérifier le certificat (comme `sslmode=require`
 * de PostgreSQL), sauf si l'URL précise déjà un sslmode.
 */
export function normalizeDbUrl(raw: string | undefined): string | undefined {
  if (!raw) return raw;
  try {
    const url = new URL(raw);
    const isSupabase = /\.supabase\.(com|co)$/.test(url.hostname);
    if (isSupabase && !url.searchParams.has("sslmode")) url.searchParams.set("sslmode", "no-verify");
    if (isSupabase && url.searchParams.get("sslmode") === "require") url.searchParams.set("sslmode", "no-verify");
    return url.toString();
  } catch {
    return raw;
  }
}
