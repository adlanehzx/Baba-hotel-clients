import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Toutes les pages sont dynamiques (cookie de la réception, jeton de chambre) :
// aucun cache de rendu n'est nécessaire.
export default defineCloudflareConfig();
