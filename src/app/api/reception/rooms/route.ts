import { NextResponse, type NextRequest } from "next/server";
import { count, eq, inArray, isNull } from "drizzle-orm";
import { db, requests, rooms, stays } from "@/db";
import { requireReception } from "@/lib/auth";
import { byRoomNumber } from "@/lib/rooms";
import { createToken } from "@/lib/id";

/** Chambres avec leur séjour en cours et le nombre de demandes ouvertes. */
export async function GET() {
  const denied = await requireReception();
  if (denied) return denied;

  const [roomRows, stayRows, openRows] = await Promise.all([
    db.select({ id: rooms.id, number: rooms.number }).from(rooms),
    db.select().from(stays).where(isNull(stays.checkedOutAt)),
    db
      .select({ roomId: requests.roomId, n: count() })
      .from(requests)
      .where(inArray(requests.status, ["NEW", "IN_PROGRESS"]))
      .groupBy(requests.roomId),
  ]);
  const stayBy = new Map(stayRows.map((s) => [s.roomId, s]));
  const openBy = new Map(openRows.map((o) => [o.roomId, o.n]));

  const list = roomRows.sort(byRoomNumber).map((r) => {
    const s = stayBy.get(r.id);
    return {
      ...r,
      stay: s ? { id: s.id, breakfastIncluded: s.breakfastIncluded, checkedInAt: s.checkedInAt } : null,
      openRequests: openBy.get(r.id) ?? 0,
    };
  });
  return NextResponse.json(list, { headers: { "Cache-Control": "no-store" } });
}

/** Ajoute une chambre (un QR code est créé pour elle). */
export async function POST(req: NextRequest) {
  const denied = await requireReception();
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const number = String(body?.number ?? "").trim();
  if (!/^[A-Za-z0-9-]{1,10}$/.test(number)) {
    return NextResponse.json({ error: "Numéro invalide : lettres, chiffres ou tiret, 10 caractères maximum." }, { status: 400 });
  }
  const [exists] = await db.select({ id: rooms.id }).from(rooms).where(eq(rooms.number, number)).limit(1);
  if (exists) return NextResponse.json({ error: `La chambre ${number} existe déjà.` }, { status: 409 });

  const [room] = await db.insert(rooms).values({ number, token: createToken() }).returning({ id: rooms.id, number: rooms.number });
  return NextResponse.json(room, { status: 201 });
}

