import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db, rooms, stays } from "@/db";

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
