import "server-only";
// Les réglages sont modifiés depuis Relais (onglet Clients → Réglages clients).
import { eq } from "drizzle-orm";
import { db, settings } from "@/db";
import { DEFAULT_SETTINGS, type HotelSettings } from "@/config/hotel";

const ID = "hotel";

export async function getSettings(): Promise<HotelSettings> {
  const [row] = await db.select().from(settings).where(eq(settings.id, ID)).limit(1);
  return { ...DEFAULT_SETTINGS, ...((row?.data as Partial<HotelSettings>) ?? {}) };
}
