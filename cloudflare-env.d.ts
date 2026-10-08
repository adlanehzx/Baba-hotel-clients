// Types des bindings Cloudflare (voir wrangler.jsonc).
// Écrit à la main plutôt qu'avec `wrangler types` : les types runtime complets
// remplaceraient les types DOM (fetch, Response…) utilisés par Next.js.
interface CloudflareEnv {
  DB: import("@cloudflare/workers-types").D1Database;
  ASSETS: import("@cloudflare/workers-types").Fetcher;
  /** Notifications push vers les téléphones de la réception (secrets posés par le workflow de Relais) */
  VAPID_PRIVATE_KEY?: string;
  VAPID_PUBLIC_KEY?: string;
  /** Facultatif : adresse publique utilisée dans les QR codes */
  PUBLIC_BASE_URL?: string;
}
