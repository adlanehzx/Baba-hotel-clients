import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// Toutes les pages dépendent de la requête (cookie de la réception, jeton de chambre,
// langue du navigateur) : pas de pré-rendu, donc pas de Cache Components.
const nextConfig: NextConfig = {
  poweredByHeader: false,
};

export default nextConfig;

// En développement (`npm run dev`), donne accès à la base D1 locale via getCloudflareContext()
initOpenNextCloudflareForDev();
