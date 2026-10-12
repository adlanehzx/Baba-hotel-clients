import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Client de l'API Paytweak (lien de paiement / Pay-by-link).
 *
 * Les identifiants ne sont JAMAIS dans le code : ils viennent des secrets du
 * Worker Cloudflare (voir `wrangler secret put`), lus ici via l'environnement.
 *   - PAYTWEAK_SECRET  : jeton secret (TOKEN) — sert à s'authentifier
 *   - PAYTWEAK_PUBLIC  : jeton public — identifiant du compte
 *   - PAYTWEAK_BASE    : (optionnel) URL de base de l'API — bascule prod / sandbox
 *   - PAYTWEAK_WEBHOOK_SECRET : jeton secret dans l'URL du webhook (anti-usurpation)
 *
 * Deux points restent à confirmer sur le sandbox Paytweak (mercredi). Ils sont
 * isolés et balisés « SEAM » pour qu'une correction tienne en une ligne :
 *   1. la séquence de connexion (hello / verify / quit) et le nom du jeton rendu ;
 *   2. le format du montant envoyé (euros décimaux « 12.00 » vs centimes « 1200 »).
 * Tout le reste (création, désactivation, remboursement, reporting, revérification
 * du webhook, calcul des montants, durée de vie des liens) est définitif.
 */

export type PaytweakEnv = {
  PAYTWEAK_PUBLIC?: string;
  PAYTWEAK_SECRET?: string;
  PAYTWEAK_BASE?: string;
  PAYTWEAK_WEBHOOK_SECRET?: string;
};

const DEFAULT_BASE = "https://api.paytweak.com/v1/";

function env(): PaytweakEnv {
  return getCloudflareContext().env as unknown as PaytweakEnv;
}

/** Le paiement en ligne est-il configuré (secrets présents) ? */
export function paytweakConfigured(): boolean {
  const e = env();
  return Boolean(e.PAYTWEAK_SECRET && e.PAYTWEAK_PUBLIC);
}

function baseUrl(): string {
  const b = env().PAYTWEAK_BASE || DEFAULT_BASE;
  return b.endsWith("/") ? b : b + "/";
}

/** Erreur renvoyée par l'API Paytweak, avec le code et le message bruts. */
export class PaytweakError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "PaytweakError";
  }
}

/** Récupère un jeton de session dans une réponse, quel que soit son nom de champ. */
function pickToken(data: unknown): string | null {
  if (typeof data === "string" && data) return data;
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    for (const k of ["token", "session", "session_token", "sessionToken", "access_token"]) {
      if (typeof o[k] === "string" && o[k]) return o[k] as string;
    }
    if (o.data) return pickToken(o.data);
    if (o.result) return pickToken(o.result);
  }
  return null;
}

async function parse(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Détecte un corps d'erreur `{ code, message }` même sur un HTTP 200. */
function errorIn(data: unknown): { code?: string; message?: string } | null {
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    const code = typeof o.code === "string" ? o.code : undefined;
    const message = typeof o.message === "string" ? o.message : undefined;
    // Paytweak renvoie un code applicatif ("402", "4xx"…) sur erreur ; "200"/"0" = ok.
    if (code && !["200", "0", "ok", "OK"].includes(code)) return { code, message };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Connexion (handshake) — SEAM n°1                                   */
/* ------------------------------------------------------------------ */

/**
 * Négocie un jeton de session à placer dans l'en-tête `Paytweak-Token`.
 *
 * SEAM : séquence hello → verify → quit à confirmer sur le sandbox. On tente
 * d'abord le handshake ; si l'endpoint `hello` n'existe pas (404), on se rabat
 * sur l'usage direct du jeton secret comme en-tête `Paytweak-Token` (certaines
 * intégrations Paytweak fonctionnent ainsi). La revérification de paiement ne
 * dépend donc pas du détail exact du handshake.
 */
async function connect(): Promise<string> {
  const e = env();
  const pub = e.PAYTWEAK_PUBLIC ?? "";
  const secret = e.PAYTWEAK_SECRET ?? "";

  try {
    const res = await fetch(baseUrl() + "hello", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ public: pub, token: secret }),
    });
    if (res.status === 404) return secret; // pas de handshake : jeton direct
    const data = await parse(res);
    const err = errorIn(data);
    if (!res.ok || err) throw new PaytweakError(err?.message ?? `hello ${res.status}`, res.status, err?.code);
    const token = pickToken(data);
    if (!token) throw new PaytweakError("handshake sans jeton de session", res.status);

    // verify : confirme la session (best-effort — certaines versions la fusionnent avec hello)
    const vr = await fetch(baseUrl() + "verify", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "Paytweak-Token": token },
      body: JSON.stringify({ public: pub, token: secret }),
    }).catch(() => null);
    if (vr && vr.ok) {
      const vdata = await parse(vr);
      return pickToken(vdata) ?? token;
    }
    return token;
  } catch (err) {
    if (err instanceof PaytweakError) throw err;
    // Réseau indisponible pendant le handshake : on tente le jeton direct.
    return secret;
  }
}

/** Ferme la session (best-effort, jamais bloquant). */
async function quit(token: string): Promise<void> {
  try {
    await fetch(baseUrl() + "quit", {
      method: "POST",
      headers: { Accept: "application/json", "Paytweak-Token": token },
    });
  } catch {
    /* sans effet sur l'opération déjà faite */
  }
}

/** Appel authentifié : connecte, exécute, ferme la session. */
async function call<T = unknown>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const token = await connect();
  try {
    const res = await fetch(baseUrl() + path, {
      method,
      headers: {
        Accept: "application/json",
        "Paytweak-Token": token,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await parse(res);
    const err = errorIn(data);
    if (!res.ok || err) {
      throw new PaytweakError(err?.message ?? `${method} ${path} → ${res.status}`, res.status, err?.code);
    }
    return data as T;
  } finally {
    await quit(token);
  }
}

/* ------------------------------------------------------------------ */
/*  Montant — SEAM n°2                                                 */
/* ------------------------------------------------------------------ */

/**
 * Montant envoyé à Paytweak. Stocké partout en centimes ; Paytweak attend
 * (vraisemblablement) des euros décimaux. SEAM : à confirmer sur le sandbox —
 * si l'API veut des centimes, renvoyer `String(cents)` ici.
 */
export function formatAmount(cents: number): string {
  return (cents / 100).toFixed(2);
}

/* ------------------------------------------------------------------ */
/*  Opérations                                                         */
/* ------------------------------------------------------------------ */

export type CreateLinkInput = {
  orderId: string;
  /** Montant en centimes (calculé côté serveur). */
  amountCents: number;
  currency: string;
  /** Durée de vie du lien en secondes (au plus 30 min / heure limite du service). */
  lifeSeconds: number;
  lang?: string;
  email?: string;
  label?: string;
};

export type CreatedLink = { linkId: string; url: string; raw: unknown };

/** Récupère l'URL de paiement et l'identifiant du lien dans une réponse Paytweak. */
function pickLink(data: unknown): { linkId: string; url: string } | null {
  const seek = (o: Record<string, unknown>): { linkId: string; url: string } | null => {
    const url =
      (typeof o.url === "string" && o.url) ||
      (typeof o.link === "string" && o.link) ||
      (typeof o.paypage === "string" && o.paypage) ||
      (typeof o.payment_url === "string" && o.payment_url) ||
      "";
    const linkId =
      (typeof o.id === "string" && o.id) ||
      (typeof o.link_id === "string" && o.link_id) ||
      (typeof o.linkId === "string" && o.linkId) ||
      (typeof o.ref === "string" && o.ref) ||
      (typeof o.order_id === "string" && o.order_id) ||
      "";
    if (url || linkId) return { linkId: String(linkId), url: String(url) };
    return null;
  };
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    return seek(o) ?? (o.data ? pickLink(o.data) : null) ?? (o.result ? pickLink(o.result) : null);
  }
  return null;
}

/** Crée un lien de paiement. `life` suit le format Paytweak : entier + unité (ex. "30m", "600s"). */
export async function createPaymentLink(input: CreateLinkInput): Promise<CreatedLink> {
  const body: Record<string, unknown> = {
    order_id: input.orderId,
    amount: formatAmount(input.amountCents),
    cur: input.currency,
    life: `${Math.max(1, Math.round(input.lifeSeconds))}s`,
    operation: "SAL",
  };
  if (input.lang) body.lng = input.lang;
  if (input.email) body.email = input.email;
  if (input.label) body.freetext = input.label;

  const data = await call("POST", "links", body);
  const link = pickLink(data);
  if (!link || !link.url) throw new PaytweakError("réponse sans URL de paiement", 502);
  return { linkId: link.linkId, url: link.url, raw: data };
}

/** Désactive un lien (PUT) — côté Paytweak, le lien ne peut plus être payé. */
export async function disablePaymentLink(linkId: string): Promise<void> {
  if (!linkId) return;
  await call("PUT", `links/disable/${encodeURIComponent(linkId)}`);
}

/** Rembourse un lien payé. `amountCents` omis = remboursement total. */
export async function refundPaymentLink(linkId: string, amountCents?: number): Promise<unknown> {
  const qs = new URLSearchParams({ id: linkId });
  if (typeof amountCents === "number") qs.set("amount", formatAmount(amountCents));
  return call("POST", `refund/?${qs.toString()}`);
}

export type ReportStatus = {
  /** Statut Paytweak : 9 = payé. */
  status: number | null;
  paid: boolean;
  /** Montant constaté (centimes), en supposant des euros décimaux côté Paytweak. */
  amountCents: number | null;
  /** Montant brut tel que renvoyé (pour lever l'ambiguïté euros / centimes). */
  amountRaw: number | null;
  raw: unknown;
};

/** Numéro de statut Paytweak ; 9 = paiement accepté. */
const PAID_STATUS = 9;

function numberish(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

/** Extrait statut + montant d'une ligne de reporting, quelle que soit sa forme. */
function readReport(data: unknown): ReportStatus {
  const flatten = (d: unknown): Record<string, unknown> | null => {
    if (Array.isArray(d)) return d.length ? flatten(d[d.length - 1]) : null;
    if (d && typeof d === "object") {
      const o = d as Record<string, unknown>;
      if (o.data) return flatten(o.data);
      if (o.result) return flatten(o.result);
      if (o.links && Array.isArray(o.links)) return flatten(o.links);
      return o;
    }
    return null;
  };
  const o = flatten(data);
  if (!o) return { status: null, paid: false, amountCents: null, amountRaw: null, raw: data };
  // La doc webhook nomme le champ « Status » (majuscule) ; on accepte les deux.
  const status = numberish(o.Status ?? o.status ?? o.state ?? o.payment_status);
  const amountRaw = numberish(o.amount ?? o.amount_paid ?? o.paid_amount);
  // Montant exprimé en euros décimaux → centimes. (Cohérent avec SEAM n°2.)
  const amountCents = amountRaw === null ? null : Math.round(amountRaw * 100);
  return { status, paid: status === PAID_STATUS, amountCents, amountRaw, raw: data };
}

/**
 * Reporting d'un lien par notre `order_id`. Sert à REVÉRIFIER un paiement :
 * le webhook n'est qu'un déclencheur, c'est ce reporting (source Paytweak) qui
 * fait foi pour confirmer qu'une commande est bien payée et du bon montant.
 */
export async function reportByOrderId(orderId: string): Promise<ReportStatus> {
  const qs = new URLSearchParams({ order_id: orderId });
  const data = await call("GET", `links?${qs.toString()}`);
  return readReport(data);
}

export { PAID_STATUS };
