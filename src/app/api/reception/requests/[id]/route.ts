import { NextResponse, type NextRequest } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db, products, requests, requestStatus, type RequestStatus } from "@/db";
import { requireReception } from "@/lib/auth";

/**
 * La réception change le statut d'une demande.
 * Annuler une commande minibar remet les articles en stock ;
 * une demande annulée ne peut plus être rouverte.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireReception();
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const status = body?.status as RequestStatus;
  if (!requestStatus.enumValues.includes(status)) {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  }
  const id = (await params).id;

  const result = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(requests).where(eq(requests.id, id)).for("update").limit(1);
    if (!current) return { error: "not_found", code: 404 } as const;
    if (current.status === "CANCELLED") return { error: "already_cancelled", code: 409 } as const;

    if (status === "CANCELLED" && current.details?.kind === "minibar") {
      for (const it of current.details.items) {
        await tx.update(products).set({ stock: sql`${products.stock} + ${it.qty}` }).where(eq(products.id, it.productId));
      }
    }
    const [updated] = await tx
      .update(requests)
      .set({ status, doneAt: status === "DONE" || status === "CANCELLED" ? new Date() : null })
      .where(eq(requests.id, id))
      .returning({ id: requests.id, status: requests.status });
    return { updated } as const;
  });

  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.code });
  return NextResponse.json(result.updated);
}
