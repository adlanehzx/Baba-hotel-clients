import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { eq, inArray } from "drizzle-orm";
import { db, pushSubscriptions, requests } from "@/db";

/**
 * Notifications Web Push vers les téléphones de la réception (abonnés depuis Relais).
 *
 * Envoi « sans contenu » (seul l'en-tête VAPID est signé) : rien de personnel ne
 * transite par les serveurs de Google ou d'Apple ; le téléphone affiche
 * l'alerte puis va chercher le détail dans Relais, derrière la connexion.
 *
 * Clés : VAPID_PRIVATE_KEY (JWK P-256) et VAPID_PUBLIC_KEY (base64url), secrets du
 * Worker posés par le workflow « Notifications » du dépôt Relais. Sans elles, rien n'est envoyé.
 */

const b64url = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const text = (s: string) => b64url(new TextEncoder().encode(s));

async function vapidHeader(endpoint: string, privateJwk: string, publicKey: string) {
  const key = await crypto.subtle.importKey("jwk", JSON.parse(privateJwk), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const unsigned = `${text(JSON.stringify({ typ: "JWT", alg: "ES256" }))}.${text(
    JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: "mailto:reservation@baba-hotel.com" }),
  )}`;
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(unsigned));
  return `vapid t=${unsigned}.${b64url(sig)}, k=${publicKey}`;
}

/** Prévient tous les téléphones abonnés. Les abonnements expirés sont supprimés. */
export async function notifyReception(): Promise<void> {
  const { env } = getCloudflareContext();
  if (!env.VAPID_PRIVATE_KEY || !env.VAPID_PUBLIC_KEY) return;
  const subs = await db.select().from(pushSubscriptions);
  if (!subs.length) return;
  const gone: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        const res = await fetch(s.endpoint, {
          method: "POST",
          headers: { TTL: "600", Urgency: "high", "Content-Length": "0", Authorization: await vapidHeader(s.endpoint, env.VAPID_PRIVATE_KEY!, env.VAPID_PUBLIC_KEY!) },
        });
        if (res.status === 404 || res.status === 410) gone.push(s.endpoint);
        else if (!res.ok) console.error("push", res.status, await res.text().catch(() => ""));
      } catch (e) {
        console.error("push", e);
      }
    }),
  );
  if (gone.length) await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.endpoint, gone));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const stillWaiting = async (requestId: string) =>
  (await db.select({ status: requests.status }).from(requests).where(eq(requests.id, requestId)).limit(1))[0]?.status === "NEW";

/**
 * Lance l'envoi sans retarder la réponse au client.
 * Appel du comptoir (deskCall) : rafale de 3 notifications à 8 s d'intervalle, pour que
 * le téléphone sonne plusieurs fois (même sur iPhone) ; arrêtée dès que quelqu'un répond.
 */
export function notifyReceptionLater(deskCall?: string) {
  const run = async () => {
    await notifyReception();
    if (!deskCall) return;
    for (let i = 0; i < 2; i++) {
      await sleep(8000);
      if (!(await stillWaiting(deskCall))) return;
      await notifyReception();
    }
  };
  try {
    const { ctx } = getCloudflareContext();
    ctx.waitUntil(run().catch((e) => console.error("push", e)));
  } catch (e) {
    console.error("push", e);
  }
}
