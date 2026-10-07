import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, requests, requestStatus, type RequestStatus } from "@/db";
import { isReceptionLoggedIn } from "@/lib/auth";

/** La réception change le statut d'une demande. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isReceptionLoggedIn())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const status = body?.status as RequestStatus;
  if (!requestStatus.enumValues.includes(status)) {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  }

  const [updated] = await db
    .update(requests)
    .set({ status, doneAt: status === "DONE" ? new Date() : null })
    .where(eq(requests.id, (await params).id))
    .returning({ id: requests.id, status: requests.status });

  if (!updated) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(updated);
}
