import { NextResponse, type NextRequest } from "next/server";
import { eq, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { db, products, requests, REQUEST_STATUSES, type RequestStatus } from "@/db";
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
  if (!REQUEST_STATUSES.includes(status)) {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  }
  const id = (await params).id;

  const [current] = await db.select().from(requests).where(eq(requests.id, id)).limit(1);
  if (!current) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (current.status === "CANCELLED") return NextResponse.json({ error: "already_cancelled" }, { status: 409 });

  const done = status === "DONE" || status === "CANCELLED" ? new Date() : null;
  // Mise à jour conditionnelle (statut inchangé depuis la lecture) : deux clics
  // simultanés sur « Annuler » ne remettent pas deux fois le stock.
  const update = db
    .update(requests)
    .set({ status, doneAt: done, updatedAt: new Date() })
    .where(sql`${requests.id} = ${id} AND ${requests.status} = ${current.status}`)
    .returning({ id: requests.id, status: requests.status });

  if (status === "CANCELLED" && current.details?.kind === "minibar") {
    const restock = current.details.items.map((it) =>
      db
        .update(products)
        .set({ stock: sql`${products.stock} + ${it.qty}` })
        // changes() = 1 : l'instruction précédente du lot a bien modifié une ligne.
        // Si l'annulation n'a rien changé (déjà faite par un autre clic), rien n'est remis en stock.
        .where(sql`${products.id} = ${it.productId} AND changes() = 1`),
    );
    const [updated] = (await db.batch([update, ...restock] as unknown as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]])) as unknown as [
      { id: string; status: RequestStatus }[],
    ];
    if (!updated.length) return NextResponse.json({ error: "conflict" }, { status: 409 });
    return NextResponse.json(updated[0]);
  }

  const [updated] = await update;
  if (!updated) return NextResponse.json({ error: "conflict" }, { status: 409 });
  return NextResponse.json(updated);
}
