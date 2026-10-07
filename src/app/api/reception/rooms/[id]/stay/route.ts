import { NextResponse, type NextRequest } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db, stays } from "@/db";
import { requireReception } from "@/lib/auth";

/** Modifie le séjour en cours (petit-déjeuner offert ou non). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireReception();
  if (denied) return denied;
  const body = await req.json().catch(() => null);
  if (typeof body?.breakfastIncluded !== "boolean") return NextResponse.json({ error: "invalid" }, { status: 400 });

  const [s] = await db
    .update(stays)
    .set({ breakfastIncluded: body.breakfastIncluded })
    .where(and(eq(stays.roomId, (await params).id), isNull(stays.checkedOutAt)))
    .returning();
  if (!s) return NextResponse.json({ error: "no_stay" }, { status: 404 });
  return NextResponse.json(s);
}
