import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, rooms } from "@/db";
import { requireReception } from "@/lib/auth";

/** Supprime une chambre, avec son historique de demandes. Son QR code ne marchera plus. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireReception();
  if (denied) return denied;
  const [deleted] = await db.delete(rooms).where(eq(rooms.id, (await params).id)).returning({ id: rooms.id });
  if (!deleted) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
