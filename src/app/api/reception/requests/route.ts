import { NextResponse } from "next/server";
import { and, desc, eq, gte, ne, or } from "drizzle-orm";
import { db, requests, rooms } from "@/db";
import { isReceptionLoggedIn } from "@/lib/auth";

/** File des demandes pour l'écran de la réception : en attente + traitées depuis 12 h. */
export async function GET() {
  if (!(await isReceptionLoggedIn())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const since = new Date(Date.now() - 12 * 3600_000);
  const rows = await db
    .select({
      id: requests.id,
      room: rooms.number,
      category: requests.category,
      message: requests.message,
      lang: requests.lang,
      status: requests.status,
      createdAt: requests.createdAt,
      updatedAt: requests.updatedAt,
      doneAt: requests.doneAt,
    })
    .from(requests)
    .innerJoin(rooms, eq(rooms.id, requests.roomId))
    .where(or(ne(requests.status, "DONE"), and(eq(requests.status, "DONE"), gte(requests.doneAt, since))))
    .orderBy(desc(requests.createdAt))
    .limit(200);

  return NextResponse.json(rows, { headers: { "Cache-Control": "no-store" } });
}
