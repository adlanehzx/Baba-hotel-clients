/**
 * Crée une chambre (avec son jeton de QR code) pour chaque numéro de
 * src/config/rooms.ts. Les chambres déjà présentes ne sont pas modifiées.
 *   npm run db:seed
 */
import "dotenv/config";
import { db, rooms } from "../src/db";
import { ROOM_NUMBERS } from "../src/config/rooms";
import { createToken } from "../src/lib/id";

async function main() {
  const existing = new Set((await db.select({ n: rooms.number }).from(rooms)).map((r) => r.n));
  const toCreate = ROOM_NUMBERS.filter((n) => !existing.has(n));
  if (toCreate.length) {
    await db.insert(rooms).values(toCreate.map((number) => ({ number, token: createToken() })));
  }
  console.log(`${toCreate.length} chambre(s) créée(s), ${existing.size} déjà présente(s).`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
