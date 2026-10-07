import { NextResponse, type NextRequest } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db, stays } from "@/db";
import { requireReception } from "@/lib/auth";

/** Check-in : ouvre un séjour. Un éventuel séjour oublié est fermé au passage. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireReception();
  if (denied) return denied;
  const roomId = (await params).id;
  const body = await req.json().catch(() => null);

  const stay = await db.transaction(async (tx) => {
    await tx
      .update(stays)
      .set({ checkedOutAt: new Date() })
      .where(and(eq(stays.roomId, roomId), isNull(stays.checkedOutAt)));
    const [s] = await tx.insert(stays).values({ roomId, breakfastIncluded: body?.breakfastIncluded === true }).returning();
    return s;
  });
  return NextResponse.json(stay, { status: 201 });
}
