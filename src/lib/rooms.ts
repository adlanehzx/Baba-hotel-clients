import "server-only";
import { eq } from "drizzle-orm";
import { db, rooms } from "@/db";

export async function findRoomByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{10,64}$/.test(token)) return null;
  const [room] = await db.select().from(rooms).where(eq(rooms.token, token)).limit(1);
  return room ?? null;
}
