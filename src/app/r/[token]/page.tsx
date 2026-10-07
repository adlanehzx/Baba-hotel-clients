import { headers } from "next/headers";
import { findRoomByToken } from "@/lib/rooms";
import { MESSAGES, pickLocale } from "@/i18n";
import { FACTS, HOTEL } from "@/config/hotel";
import GuestApp from "@/components/GuestApp";
import styles from "@/components/guest.module.css";


/** Page ouverte en scannant le QR code d'une chambre. */
export default async function RoomPage({ params }: PageProps<"/r/[token]">) {
  const { token } = await params;
  const [room, h] = await Promise.all([findRoomByToken(token), headers()]);
  const locale = pickLocale(h.get("accept-language"));

  if (!room) {
    const t = MESSAGES[locale];
    return (
      <main className={styles.invalid} lang={locale} dir={t.dir}>
        <h1 className="serif">{t.ui.invalidTitle}</h1>
        <p>{t.ui.invalidText}</p>
        <a className={styles.callBtn} href={HOTEL.phoneHref}>{t.ui.call}</a>
      </main>
    );
  }

  return (
    <GuestApp
      token={token}
      room={room.number}
      initialLocale={locale}
      facts={FACTS}
      phoneHref={HOTEL.phoneHref}
      wifi={{ name: HOTEL.wifiName, password: HOTEL.wifiPassword }}
    />
  );
}
