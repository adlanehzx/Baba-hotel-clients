import { NextResponse, type NextRequest } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { confirmPayment } from "@/lib/orders";

type Ctx = { params: Promise<{ secret: string }> };

/** Comparaison à temps constant (évite de deviner le secret par chronométrage). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Première valeur non vide d'un objet pour une liste de clés. */
function pick(o: Record<string, unknown> | null | undefined, keys: string[]): string | null {
  if (!o) return null;
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v) return v;
    if (typeof v === "number") return String(v);
  }
  return null;
}

/**
 * Récupère (notice, order_id) de la notification Paytweak, quelle que soit sa forme :
 * query (GET), corps JSON objet, corps JSON tableau (format documenté « tableau JSON »),
 * ou formulaire. Le champ `notice` vaut PAYMENT / EMAIL / SMS / CLIC / SEPA / SYSTEM.
 */
async function extract(req: NextRequest): Promise<{ notice: string | null; orderId: string | null }> {
  const sp = req.nextUrl.searchParams;
  const qOrder = sp.get("order_id") ?? sp.get("orderId");
  if (qOrder) return { notice: sp.get("notice"), orderId: qOrder };

  const ct = req.headers.get("content-type") ?? "";
  try {
    if (ct.includes("application/json")) {
      const parsed = (await req.json()) as unknown;
      const row = (Array.isArray(parsed) ? parsed[parsed.length - 1] : parsed) as Record<string, unknown> | null;
      const inner = (row?.data as Record<string, unknown> | undefined) ?? row;
      return { notice: pick(inner, ["notice", "Notice"]), orderId: pick(inner, ["order_id", "orderId", "ref"]) };
    }
    const form = await req.formData();
    const obj = Object.fromEntries([...form.entries()].map(([k, v]) => [k, typeof v === "string" ? v : ""]));
    return { notice: pick(obj, ["notice", "Notice"]), orderId: pick(obj, ["order_id", "orderId", "ref"]) };
  } catch {
    return { notice: null, orderId: null };
  }
}

/**
 * Webhook (callback) Paytweak. Non signé : simple déclencheur, protégé par un secret
 * imprévisible dans l'URL. La confirmation passe TOUJOURS par une revérification auprès
 * de Paytweak (reporting : Status 9 + montant exact), jamais par le contenu reçu ici.
 * Paytweak peut appeler en GET ou POST et pour tout type d'événement (`notice`) : on ne
 * traite que les notifications de paiement, et on répond 200 sans rien divulguer.
 */
async function handle(req: NextRequest, secret: string): Promise<NextResponse> {
  const env = getCloudflareContext().env as unknown as { PAYTWEAK_WEBHOOK_SECRET?: string };
  const expected = env.PAYTWEAK_WEBHOOK_SECRET ?? "";
  if (!expected || !safeEqual(secret, expected)) return NextResponse.json({ ok: false }, { status: 404 });

  const { notice, orderId } = await extract(req);
  // On ne déclenche la revérification que pour un paiement (ou si le type n'est pas précisé,
  // ex. test manuel). Les autres notices (EMAIL, SMS, CLIC, SEPA, SYSTEM) sont juste acquittées.
  if (orderId && (!notice || notice.toUpperCase() === "PAYMENT")) {
    try {
      await confirmPayment(orderId);
    } catch (e) {
      console.error("webhook confirmPayment failed", e);
    }
  }
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  return handle(req, (await params).secret);
}

export async function GET(req: NextRequest, { params }: Ctx) {
  return handle(req, (await params).secret);
}
