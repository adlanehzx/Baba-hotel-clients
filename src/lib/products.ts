/** Validation d'un produit minibar saisi à la réception. Prix en centimes. */
export function parseProduct(body: unknown, partial = false) {
  const b = (body ?? {}) as Record<string, unknown>;
  const out: { name?: string; nameEn?: string | null; price?: number; stock?: number; active?: boolean } = {};

  if (!partial || "name" in b) {
    const name = String(b.name ?? "").trim().slice(0, 80);
    if (!name) return { error: "Donnez un nom au produit." } as const;
    out.name = name;
  }
  if ("nameEn" in b) out.nameEn = String(b.nameEn ?? "").trim().slice(0, 80) || null;
  if (!partial || "price" in b) {
    const price = Number(b.price);
    if (!Number.isInteger(price) || price < 0 || price > 100000) return { error: "Prix invalide." } as const;
    out.price = price;
  }
  if (!partial || "stock" in b) {
    const stock = Number(b.stock ?? 0);
    if (!Number.isInteger(stock) || stock < 0 || stock > 10000) return { error: "Le stock doit être un nombre entier positif." } as const;
    out.stock = stock;
  }
  if ("active" in b) out.active = b.active === true;
  return { value: out } as const;
}
