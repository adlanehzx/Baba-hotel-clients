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

  const [, inserted] = await db.batch([
    db.update(stays).set({ checkedOutAt: new Date() }).where(and(eq(stays.roomId, roomId), isNull(stays.checkedOutAt))),
    db.insert(stays).values({ roomId, breakfastIncluded: body?.breakfastIncluded === true }).returning(),
  ] as const);
  return NextResponse.json(inserted[0], { status: 201 });
}
