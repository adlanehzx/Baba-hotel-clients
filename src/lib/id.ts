import { randomBytes } from "node:crypto";

/** Identifiant court, triable par date (préfixe horodaté). */
export function createId(): string {
  return Date.now().toString(36) + randomBytes(6).toString("base64url");
}

/** Jeton imprévisible pour les QR codes (~128 bits). */
export function createToken(): string {
  return randomBytes(16).toString("base64url");
}
