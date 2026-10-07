import { NextResponse, type NextRequest } from "next/server";
import { and, count, eq, gte, inArray, sql } from "drizzle-orm";
import { db, products, requests, type RequestDetails } from "@/db";
import { findRoomByToken } from "@/lib/rooms";
import { getSettings } from "@/lib/settings";
import { lateCheckoutOptions } from "@/lib/time";
import {
  ALL_CATEGORIES,
  MAX_MESSAGE_LENGTH,
  MAX_QTY_PER_ITEM,
  MAX_REQUESTS_PER_HOUR,
  MESSAGE_REQUIRED,
  type Category,
} from "@/config/requests";
import { isLocale } from "@/i18n";

type Ctx = { params: Promise<{ token: string }> };
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** Le client envoie une demande (ou une commande minibar) depuis sa chambre. */
export async function POST(req: NextRequest, { params }: Ctx) {
  const room = await findRoomByToken((await params).token);
  if (!room) return bad("room_not_found", 404);

  const body = await req.json().catch(() => null);
  const category = body?.category as Category;
  const message = typeof body?.message === "string" ? body.message.trim().slice(0, MAX_MESSAGE_LENGTH) : "";
  const lang = isLocale(body?.lang) ? body.lang : "en";

  if (!ALL_CATEGORIES.includes(category)) return bad("invalid_category");
  if (MESSAGE_REQUIRED.includes(category) && message.length < 2) return bad("message_required");

  const oneHourAgo = new Date(Date.now() - 3600_000);
  const [{ n }] = await db
    .select({ n: count() })
    .from(requests)
    .where(and(eq(requests.roomId, room.id), gte(requests.createdAt, oneHourAgo)));
  if (n >= MAX_REQUESTS_PER_HOUR) return bad("rate_limited", 429);

  const returning = { id: requests.id, category: requests.category, status: requests.status, createdAt: requests.createdAt, details: requests.details };

  // Départ tardif : l'heure choisie doit faire partie des créneaux proposés
  if (category === "lateCheckout") {
    const s = await getSettings();
    const option = lateCheckoutOptions(s.checkOut, s.lateCheckoutMax, s.lateCheckoutHourly).find((o) => o.time === body?.time);
    if (!option) return bad("invalid_time");
    const details: RequestDetails = { kind: "lateCheckout", time: option.time, price: option.price };
    const [created] = await db
      .insert(requests)
      .values({ roomId: room.id, category, message: message || null, lang, details })
      .returning(returning);
    return NextResponse.json(created, { status: 201 });
  }

  // Minibar : on réserve le stock dans la même transaction que la commande
  if (category === "minibar") {
    const wanted = new Map<string, number>();
    for (const it of Array.isArray(body?.items) ? body.items : []) {
      const qty = Number(it?.qty);
      if (typeof it?.productId === "string" && Number.isInteger(qty) && qty > 0 && qty <= MAX_QTY_PER_ITEM) {
        wanted.set(it.productId, (wanted.get(it.productId) ?? 0) + qty);
      }
    }
    if (!wanted.size) return bad("empty_order");

    try {
      const created = await db.transaction(async (tx) => {
        const items: Extract<RequestDetails, { kind: "minibar" }>["items"] = [];
        for (const [productId, qty] of wanted) {
          // Décrément conditionnel : échoue si le stock est insuffisant ou le produit retiré
          const [p] = await tx
            .update(products)
            .set({ stock: sql`${products.stock} - ${qty}` })
            .where(and(eq(products.id, productId), eq(products.active, true), gte(products.stock, qty)))
            .returning({ name: products.name, price: products.price });
          if (!p) throw new Error("out_of_stock");
          items.push({ productId, name: p.name, price: p.price, qty });
        }
        const total = items.reduce((sum, i) => sum + i.price * i.qty, 0);
        const [row] = await tx
          .insert(requests)
          .values({ roomId: room.id, category, message: message || null, lang, details: { kind: "minibar", items, total } })
          .returning(returning);
        return row;
      });
      return NextResponse.json(created, { status: 201 });
    } catch (e) {
      if (e instanceof Error && e.message === "out_of_stock") return bad("out_of_stock", 409);
      throw e;
    }
  }

  const [created] = await db
    .insert(requests)
    .values({ roomId: room.id, category, message: message || null, lang })
    .returning(returning);
  return NextResponse.json(created, { status: 201 });
}

/** Le client consulte l'état de ses demandes (identifiants gardés sur son téléphone). */
export async function GET(req: NextRequest, { params }: Ctx) {
  const room = await findRoomByToken((await params).token);
  if (!room) return bad("room_not_found", 404);

  const ids = (req.nextUrl.searchParams.get("ids") ?? "").split(",").filter(Boolean).slice(0, 20);
  if (!ids.length) return NextResponse.json([]);

  const rows = await db
    .select({ id: requests.id, category: requests.category, status: requests.status, createdAt: requests.createdAt, details: requests.details })
    .from(requests)
    .where(and(eq(requests.roomId, room.id), inArray(requests.id, ids)));

  return NextResponse.json(rows, { headers: { "Cache-Control": "no-store" } });
}
