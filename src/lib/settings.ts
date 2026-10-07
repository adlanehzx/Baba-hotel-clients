import "server-only";
import { eq } from "drizzle-orm";
import { db, settings } from "@/db";
import { DEFAULT_SETTINGS, type HotelSettings } from "@/config/hotel";
import { TIME_RE } from "@/lib/time";

const ID = "hotel";

export async function getSettings(): Promise<HotelSettings> {
  const [row] = await db.select().from(settings).where(eq(settings.id, ID)).limit(1);
  return { ...DEFAULT_SETTINGS, ...((row?.data as Partial<HotelSettings>) ?? {}) };
}

/** Valide les réglages envoyés par la réception. Renvoie un message d'erreur ou null. */
export function validateSettings(input: unknown): { value: HotelSettings } | { error: string } {
  if (!input || typeof input !== "object") return { error: "Données invalides." };
  const v = { ...DEFAULT_SETTINGS, ...(input as Partial<HotelSettings>) };

  for (const k of ["checkIn", "checkOut", "breakfastStart", "breakfastEnd", "lateCheckoutMax"] as const) {
    if (!TIME_RE.test(String(v[k]))) return { error: "Les heures doivent être au format HH:MM (par exemple 07:30)." };
  }
  for (const k of ["breakfastPrice", "lateCheckoutHourly"] as const) {
    const n = Number(v[k]);
    if (!Number.isInteger(n) || n < 0 || n > 100000) return { error: "Les prix doivent être des montants positifs." };
    v[k] = n;
  }
  for (const k of ["wifiName", "wifiPassword", "phone", "address"] as const) {
    v[k] = String(v[k] ?? "").trim().slice(0, 200);
  }
  if (v.lateCheckoutMax <= v.checkOut) return { error: "L'heure maximale du départ tardif doit être après l'heure de départ." };
  if (v.breakfastEnd <= v.breakfastStart) return { error: "La fin du petit-déjeuner doit être après son début." };
  return { value: v };
}

export async function saveSettings(value: HotelSettings) {
  await db
    .insert(settings)
    .values({ id: ID, data: value })
    .onConflictDoUpdate({ target: settings.id, set: { data: value, updatedAt: new Date() } });
}
