import { NextResponse, type NextRequest } from "next/server";
import { asc } from "drizzle-orm";
import { db, products } from "@/db";
import { requireReception } from "@/lib/auth";
import { parseProduct } from "@/lib/products";

export async function GET() {
  const denied = await requireReception();
  if (denied) return denied;
  const rows = await db.select().from(products).orderBy(asc(products.name));
  return NextResponse.json(rows, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const denied = await requireReception();
  if (denied) return denied;
  const parsed = parseProduct(await req.json().catch(() => null));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const v = parsed.value;
  const [row] = await db
    .insert(products)
    .values({ name: v.name!, nameEn: v.nameEn ?? null, price: v.price!, stock: v.stock ?? 0 })
    .returning();
  return NextResponse.json(row, { status: 201 });
}
