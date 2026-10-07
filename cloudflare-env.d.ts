// Types des bindings Cloudflare (voir wrangler.jsonc).
// Écrit à la main plutôt qu'avec `wrangler types` : les types runtime complets
// remplaceraient les types DOM (fetch, Response…) utilisés par Next.js.
interface CloudflareEnv {
  DB: import("@cloudflare/workers-types").D1Database;
  ASSETS: import("@cloudflare/workers-types").Fetcher;
  /** Mot de passe de l'écran réception (secret du Worker) */
  RECEPTION_PASSWORD: string;
  /** Facultatif : adresse publique utilisée dans les QR codes */
  PUBLIC_BASE_URL?: string;
}
