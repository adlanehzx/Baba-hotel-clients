import { NextResponse, type NextRequest } from "next/server";
import { findRoomByToken, currentStay } from "@/lib/rooms";
import { createOrder, orderViews, sweepExpired, OrderError, type NewOrderInput } from "@/lib/orders";
import { isLocale } from "@/i18n";

type Ctx = { params: Promise<{ token: string }> };
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** Codes d'erreur métier → statut HTTP présenté au client. */
const STATUS: Record<string, number> = {
  not_configured: 503,
  window_closed: 409,
  out_of_stock: 409,
  empty: 400,
  invalid: 400,
  link_failed: 502,
};

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;

/** Le client crée une commande payable (minibar / petit-déj / départ tardif) et reçoit l'URL de paiement. */
export async function POST(req: NextRequest, { params }: Ctx) {
  const room = await findRoomByToken((await params).token);
  if (!room) return bad("room_not_found", 404);
  // Commandes réservées à un séjour en cours (jamais depuis le QR de la réception).
  if (room.kind === "desk") return bad("invalid", 400);
  if (!(await currentStay(room.id))) return bad("not_checked_in", 403);

  const body = await req.json().catch(() => null);
  const kind = body?.kind;
  const lang = isLocale(body?.lang) ? body.lang : "fr";
  const email = typeof body?.email === "string" && EMAIL_RE.test(body.email.trim()) ? body.email.trim() : undefined;

  let input: NewOrderInput;
  if (kind === "minibar") {
    const items = Array.isArray(body?.items) ? body.items : [];
    input = { kind: "minibar", items };
  } else if (kind === "breakfast") {
    input = { kind: "breakfast", people: Number(body?.people) };
  } else if (kind === "lateCheckout") {
    input = { kind: "lateCheckout", time: String(body?.time ?? "") };
  } else {
    return bad("invalid", 400);
  }

  try {
    const created = await createOrder({ roomId: room.id, input, lang, email });
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    if (e instanceof OrderError) return bad(e.code, STATUS[e.code] ?? 400);
    console.error("createOrder failed", e);
    return bad("error", 502);
  }
}

/** Le client consulte l'état de paiement de ses commandes (et on nettoie les liens expirés au passage). */
export async function GET(req: NextRequest, { params }: Ctx) {
  const room = await findRoomByToken((await params).token);
  if (!room) return bad("room_not_found", 404);

  // Nettoyage paresseux : commandes expirées de cette chambre (stock rendu, lien désactivé).
  await sweepExpired(room.id).catch(() => {});

  const ids = (req.nextUrl.searchParams.get("ids") ?? "").split(",").filter(Boolean).slice(0, 20);
  const rows = await orderViews(room.id, ids);
  return NextResponse.json(rows, { headers: { "Cache-Control": "no-store" } });
}
