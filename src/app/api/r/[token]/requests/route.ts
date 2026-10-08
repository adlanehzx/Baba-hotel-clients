import { NextResponse, type NextRequest } from "next/server";
import { and, count, eq, gte, inArray, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { db, products, requests, type RequestDetails } from "@/db";
import { currentStay, findRoomByToken } from "@/lib/rooms";
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
  // Les demandes et le minibar ne sont ouverts que pendant un séjour enregistré
  // (check-in fait dans Relais) : un ancien client qui a gardé le lien ne peut
  // plus rien envoyer, ni commander depuis l'extérieur.
  if (!(await currentStay(room.id))) return bad("not_checked_in", 403);

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

  // Minibar : on réserve le stock en même temps que la commande
  if (category === "minibar") {
    const wanted = new Map<string, number>();
    for (const it of Array.isArray(body?.items) ? body.items : []) {
      const qty = Number(it?.qty);
      if (typeof it?.productId === "string" && Number.isInteger(qty) && qty > 0 && qty <= MAX_QTY_PER_ITEM) {
        wanted.set(it.productId, (wanted.get(it.productId) ?? 0) + qty);
      }
    }
    if (!wanted.size) return bad("empty_order");

    // On vérifie d'abord les produits et le stock…
    const found = await db
      .select({ id: products.id, name: products.name, price: products.price, stock: products.stock, unlimited: products.unlimited })
      .from(products)
      .where(and(inArray(products.id, [...wanted.keys()]), eq(products.active, true)));
    const byId = new Map(found.map((p) => [p.id, p]));
    const items: Extract<RequestDetails, { kind: "minibar" }>["items"] = [];
    for (const [productId, qty] of wanted) {
      const p = byId.get(productId);
      if (!p || (!p.unlimited && p.stock < qty)) return bad("out_of_stock", 409);
      items.push({ productId, name: p.name, price: p.price, qty });
    }
    const total = items.reduce((sum, i) => sum + i.price * i.qty, 0);

    // …puis on décrémente le stock et on enregistre la commande en un seul lot
    // (D1 exécute un batch comme une transaction). Si un autre client vient de
    // prendre le dernier article, la contrainte « stock >= 0 » annule tout le lot.
    try {
      const statements = [
        // Les produits à stock illimité (café, thé…) ne sont jamais décomptés.
        ...items.filter((i) => !byId.get(i.productId)?.unlimited).map((i) =>
          db.update(products).set({ stock: sql`${products.stock} - ${i.qty}` }).where(eq(products.id, i.productId)),
        ),
        db
          .insert(requests)
          .values({ roomId: room.id, category, message: message || null, lang, details: { kind: "minibar", items, total } })
          .returning(returning),
      ];
      const results = await db.batch(statements as unknown as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
      const created = (results[results.length - 1] as { id: string }[])[0];
      return NextResponse.json(created, { status: 201 });
    } catch (e) {
      if (String((e as Error)?.message ?? e).includes("CHECK constraint")) return bad("out_of_stock", 409);
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
