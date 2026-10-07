import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * Connexion de la réception : un mot de passe partagé (RECEPTION_PASSWORD).
 * La session est un cookie signé (HMAC) contenant sa date d'expiration.
 */
export const SESSION_COOKIE = "baba_reception";
const SESSION_DAYS = 30;

/**
 * Clé de signature des sessions. Si SESSION_SECRET n'est pas défini, elle est
 * dérivée du mot de passe de la réception : une variable de moins à configurer,
 * et changer le mot de passe déconnecte tous les écrans.
 */
function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return s;
  const pw = process.env.RECEPTION_PASSWORD;
  if (!pw) throw new Error("RECEPTION_PASSWORD manquant");
  return createHmac("sha256", pw).update("baba-reception-session").digest("base64url");
}

function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function checkPassword(input: string): boolean {
  const expected = process.env.RECEPTION_PASSWORD;
  if (!expected) throw new Error("RECEPTION_PASSWORD manquant");
  // Compare des empreintes de même longueur pour ne rien révéler par le temps de réponse
  return safeEqual(sign("pw:" + input), sign("pw:" + expected));
}

export function createSessionValue(): { value: string; maxAge: number } {
  const maxAge = SESSION_DAYS * 24 * 3600;
  const exp = String(Date.now() + maxAge * 1000);
  return { value: `${exp}.${sign(exp)}`, maxAge };
}

export function isValidSession(value: string | undefined): boolean {
  if (!value) return false;
  const [exp, sig] = value.split(".");
  if (!exp || !sig || !safeEqual(sig, sign(exp))) return false;
  return Number(exp) > Date.now();
}

export async function isReceptionLoggedIn(): Promise<boolean> {
  const store = await cookies();
  return isValidSession(store.get(SESSION_COOKIE)?.value);
}

/** Pour les routes API de la réception : renvoie une réponse 401 si non connecté. */
export async function requireReception(): Promise<Response | null> {
  if (await isReceptionLoggedIn()) return null;
  return Response.json({ error: "unauthorized" }, { status: 401 });
}
