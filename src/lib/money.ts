/** "12", "12,5", "12.50 €" → 1250 (centimes). Renvoie null si illisible. */
export function parseEuros(input: string): number | null {
  const clean = input.replace(/[€\s]/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}

/** 1250 → "12,50" ; 1200 → "12" (pour pré-remplir un champ). */
export function centsToInput(cents: number): string {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2).replace(".", ",");
}
