import { NextResponse } from "next/server";
import { and, desc, eq, gte, inArray, or } from "drizzle-orm";
import { db, requests, rooms } from "@/db";
import { requireReception } from "@/lib/auth";

/** File des demandes pour l'écran de la réception : en attente + terminées depuis 12 h. */
export async function GET() {
  const denied = await requireReception();
  if (denied) return denied;

  const since = new Date(Date.now() - 12 * 3600_000);
  const rows = await db
    .select({
      id: requests.id,
      room: rooms.number,
      category: requests.category,
      message: requests.message,
      details: requests.details,
      lang: requests.lang,
      status: requests.status,
      createdAt: requests.createdAt,
      updatedAt: requests.updatedAt,
      doneAt: requests.doneAt,
    })
    .from(requests)
    .innerJoin(rooms, eq(rooms.id, requests.roomId))
    .where(
      or(
        inArray(requests.status, ["NEW", "IN_PROGRESS"]),
        and(inArray(requests.status, ["DONE", "CANCELLED"]), gte(requests.doneAt, since)),
      ),
    )
    .orderBy(desc(requests.createdAt))
    .limit(200);

  return NextResponse.json(rows, { headers: { "Cache-Control": "no-store" } });
}
