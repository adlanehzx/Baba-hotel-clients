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

/** Récupère notre `order_id` dans un corps JSON, un formulaire ou la query. */
async function extractOrderId(req: NextRequest): Promise<string | null> {
  const fromQuery = req.nextUrl.searchParams.get("order_id") ?? req.nextUrl.searchParams.get("orderId");
  if (fromQuery) return fromQuery;
  const ct = req.headers.get("content-type") ?? "";
  try {
    if (ct.includes("application/json")) {
      const b = (await req.json()) as Record<string, unknown> | null;
      const v = b?.order_id ?? b?.orderId ?? b?.ref ?? (b?.data as Record<string, unknown> | undefined)?.order_id;
      return typeof v === "string" && v ? v : null;
    }
    const form = await req.formData();
    const v = form.get("order_id") ?? form.get("orderId") ?? form.get("ref");
    return typeof v === "string" && v ? v : null;
  } catch {
    return null;
  }
}

/**
 * Webhook Paytweak. Il n'est PAS signé : il ne sert que de déclencheur. Deux gardes :
 *   1. un secret imprévisible dans l'URL (anti-usurpation) ;
 *   2. la confirmation passe par une REVÉRIFICATION auprès de Paytweak (reporting) —
 *      c'est elle, et le montant calculé côté serveur, qui valident la commande.
 * On répond 200 dans tous les cas pour éviter les relances, sans jamais divulguer
 * d'information sur l'existence ou l'état réel d'une commande.
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const { secret } = await params;
  const env = getCloudflareContext().env as unknown as { PAYTWEAK_WEBHOOK_SECRET?: string };
  const expected = env.PAYTWEAK_WEBHOOK_SECRET ?? "";
  if (!expected || !safeEqual(secret, expected)) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  const orderId = await extractOrderId(req);
  if (orderId) {
    try {
      await confirmPayment(orderId);
    } catch (e) {
      console.error("webhook confirmPayment failed", e);
    }
  }
  return NextResponse.json({ ok: true });
}

// Certaines plateformes testent le webhook en GET : on accuse réception sans rien exposer.
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { secret } = await params;
  const env = getCloudflareContext().env as unknown as { PAYTWEAK_WEBHOOK_SECRET?: string };
  const expected = env.PAYTWEAK_WEBHOOK_SECRET ?? "";
  if (!expected || !safeEqual(secret, expected)) return NextResponse.json({ ok: false }, { status: 404 });
  return NextResponse.json({ ok: true });
}
