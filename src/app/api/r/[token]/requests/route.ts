import { NextResponse, type NextRequest } from "next/server";
import { and, count, eq, gte, inArray } from "drizzle-orm";
import { db, requests } from "@/db";
import { findRoomByToken } from "@/lib/rooms";
import { CATEGORIES, MAX_MESSAGE_LENGTH, MAX_REQUESTS_PER_HOUR, MESSAGE_REQUIRED, type Category } from "@/config/requests";
import { isLocale } from "@/i18n";

type Ctx = { params: Promise<{ token: string }> };

/** Le client envoie une demande depuis sa chambre. */
export async function POST(req: NextRequest, { params }: Ctx) {
  const room = await findRoomByToken((await params).token);
  if (!room) return NextResponse.json({ error: "room_not_found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const category = body?.category as Category;
  const message = typeof body?.message === "string" ? body.message.trim().slice(0, MAX_MESSAGE_LENGTH) : "";
  const lang = isLocale(body?.lang) ? body.lang : "en";

  if (!CATEGORIES.includes(category)) return NextResponse.json({ error: "invalid_category" }, { status: 400 });
  if (MESSAGE_REQUIRED.includes(category) && message.length < 2) {
    return NextResponse.json({ error: "message_required" }, { status: 400 });
  }

  const oneHourAgo = new Date(Date.now() - 3600_000);
  const [{ n }] = await db
    .select({ n: count() })
    .from(requests)
    .where(and(eq(requests.roomId, room.id), gte(requests.createdAt, oneHourAgo)));
  if (n >= MAX_REQUESTS_PER_HOUR) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const [created] = await db
    .insert(requests)
    .values({ roomId: room.id, category, message: message || null, lang })
    .returning({ id: requests.id, category: requests.category, status: requests.status, createdAt: requests.createdAt });

  return NextResponse.json(created, { status: 201 });
}

/** Le client consulte l'état de ses demandes (identifiants gardés sur son téléphone). */
export async function GET(req: NextRequest, { params }: Ctx) {
  const room = await findRoomByToken((await params).token);
  if (!room) return NextResponse.json({ error: "room_not_found" }, { status: 404 });

  const ids = (req.nextUrl.searchParams.get("ids") ?? "").split(",").filter(Boolean).slice(0, 20);
  if (!ids.length) return NextResponse.json([]);

  const rows = await db
    .select({ id: requests.id, category: requests.category, status: requests.status, createdAt: requests.createdAt })
    .from(requests)
    .where(and(eq(requests.roomId, room.id), inArray(requests.id, ids)));

  return NextResponse.json(rows, { headers: { "Cache-Control": "no-store" } });
}
