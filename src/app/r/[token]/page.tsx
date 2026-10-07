import { headers } from "next/headers";
import { asc, eq } from "drizzle-orm";
import { db, products } from "@/db";
import { currentStay, findRoomByToken } from "@/lib/rooms";
import { getSettings } from "@/lib/settings";
import { MESSAGES, pickLocale } from "@/i18n";
import { METRO_STATION } from "@/config/hotel";
import GuestApp from "@/components/GuestApp";
import styles from "@/components/guest.module.css";

/** Page ouverte en scannant le QR code d'une chambre. */
export default async function RoomPage({ params }: PageProps<"/r/[token]">) {
  const { token } = await params;
  const [room, h] = await Promise.all([findRoomByToken(token), headers()]);
  const locale = pickLocale(h.get("accept-language"));

  if (!room) {
    const t = MESSAGES[locale];
    const { phone } = await getSettings();
    return (
      <main className={styles.invalid} lang={locale} dir={t.dir}>
        <h1 className="serif">{t.ui.invalidTitle}</h1>
        <p>{t.ui.invalidText}</p>
        <p className={styles.callBtn}>{phone}</p>
      </main>
    );
  }

  const [settings, stay, minibar] = await Promise.all([
    getSettings(),
    currentStay(room.id),
    db
      .select({ id: products.id, name: products.name, nameEn: products.nameEn, price: products.price, stock: products.stock })
      .from(products)
      .where(eq(products.active, true))
      .orderBy(asc(products.name)),
  ]);

  return (
    <GuestApp
      token={token}
      room={room.number}
      initialLocale={locale}
      settings={settings}
      metro={METRO_STATION}
      breakfastIncluded={stay?.breakfastIncluded ?? false}
      products={minibar}
    />
  );
}
