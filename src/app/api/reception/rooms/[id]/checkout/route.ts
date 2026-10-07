import { NextResponse, type NextRequest } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db, stays } from "@/db";
import { requireReception } from "@/lib/auth";

/** Check-out : ferme le séjour en cours. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireReception();
  if (denied) return denied;
  await db
    .update(stays)
    .set({ checkedOutAt: new Date() })
    .where(and(eq(stays.roomId, (await params).id), isNull(stays.checkedOutAt)));
  return NextResponse.json({ ok: true });
}
