import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// Toutes les pages dépendent de la requête (cookie de la réception, jeton de chambre,
// langue du navigateur) : pas de pré-rendu, donc pas de Cache Components.
// La réception se fait désormais dans Relais (connexion personnelle, check-in /
// check-out, demandes, minibar, réglages, QR codes) : l'ancienne adresse y renvoie.
const RELAIS_URL = "https://relais-hotel.adlane-relais.workers.dev/";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async redirects() {
    return [
      { source: "/reception", destination: RELAIS_URL, permanent: false },
      { source: "/reception/:path*", destination: RELAIS_URL, permanent: false },
    ];
  },
};

export default nextConfig;

// En développement (`npm run dev`), donne accès à la base D1 locale via getCloudflareContext()
initOpenNextCloudflareForDev();
