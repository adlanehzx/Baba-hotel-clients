import "server-only";
import { and, count, eq, isNull } from "drizzle-orm";
import { db, rooms, stays } from "@/db";
import { ROOM_NUMBERS } from "@/config/rooms";
import { createToken } from "@/lib/id";

export async function findRoomByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{10,64}$/.test(token)) return null;
  const [room] = await db.select().from(rooms).where(eq(rooms.token, token)).limit(1);
  return room ?? null;
}

/** Séjour en cours dans la chambre (ou null si la chambre est libre). */
export async function currentStay(roomId: string) {
  const [stay] = await db
    .select()
    .from(stays)
    .where(and(eq(stays.roomId, roomId), isNull(stays.checkedOutAt)))
    .limit(1);
  return stay ?? null;
}

/** Tri naturel des numéros de chambre : 01, 10, 11… */
export const byRoomNumber = (a: { number: string }, b: { number: string }) =>
  a.number.localeCompare(b.number, "fr", { numeric: true });

/**
 * Premier démarrage : si la base n'a encore aucune chambre, crée celles de
 * src/config/rooms.ts, chacune avec un jeton de QR code aléatoire.
 * (Les jetons ne sont jamais écrits dans le dépôt, qui est public.)
 */
export async function ensureRooms() {
  const [{ n }] = await db.select({ n: count() }).from(rooms);
  if (n > 0) return;
  await db
    .insert(rooms)
    .values(ROOM_NUMBERS.map((number) => ({ number, token: createToken() })))
    .onConflictDoNothing();
}
