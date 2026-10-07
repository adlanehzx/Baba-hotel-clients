import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, products } from "@/db";
import { requireReception } from "@/lib/auth";
import { parseProduct } from "@/lib/products";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const denied = await requireReception();
  if (denied) return denied;
  const parsed = parseProduct(await req.json().catch(() => null), true);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (!Object.keys(parsed.value).length) return NextResponse.json({ error: "Rien à modifier." }, { status: 400 });
  const [row] = await db.update(products).set(parsed.value).where(eq(products.id, (await params).id)).returning();
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(row);
}

/** Les anciennes commandes gardent le nom et le prix du produit (copiés dans la commande). */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const denied = await requireReception();
  if (denied) return denied;
  await db.delete(products).where(eq(products.id, (await params).id));
  return NextResponse.json({ ok: true });
}
