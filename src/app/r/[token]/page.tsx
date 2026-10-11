import { headers } from "next/headers";
import { asc, eq } from "drizzle-orm";
import { db, products } from "@/db";
import { currentStay, findRoomByToken } from "@/lib/rooms";
import { getSettings } from "@/lib/settings";
import { MESSAGES, pickLocale } from "@/i18n";
import { METRO_STATION, HOTEL_TZ } from "@/config/hotel";
import { linkLifeSeconds, lateCheckoutOptions } from "@/lib/time";
import { paytweakConfigured } from "@/lib/paytweak";
import GuestApp from "@/components/GuestApp";
import DeskCall from "@/components/DeskCall";
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

  // QR code du comptoir : prévenir la réception quand personne n'est là.
  if (room.kind === "desk") {
    const { phone } = await getSettings();
    return <DeskCall token={token} initialLocale={locale} phone={phone} />;
  }

  const [settings, stay, minibar] = await Promise.all([
    getSettings(),
    currentStay(room.id),
    db
      .select({ id: products.id, name: products.name, nameEn: products.nameEn, price: products.price, stock: products.stock, unlimited: products.unlimited })
      .from(products)
      .where(eq(products.active, true))
      .orderBy(asc(products.name)),
  ]);

  // Paiement en ligne actif seulement si les secrets Paytweak sont configurés.
  // Sinon l'app garde son comportement actuel (minibar/départ tardif sans paiement).
  const paymentEnabled = paytweakConfigured();
  const breakfastOrderable =
    paymentEnabled &&
    !(stay?.breakfastIncluded ?? false) &&
    linkLifeSeconds(settings.breakfastOrderUntil, HOTEL_TZ) > 0;
  const lateCheckoutOrderable =
    linkLifeSeconds(settings.lateCheckoutOrderUntil, HOTEL_TZ) > 0 &&
    lateCheckoutOptions(settings.checkOut, settings.lateCheckoutMax, settings.lateCheckoutHourly).length > 0;

  return (
    <GuestApp
      token={token}
      room={room.number}
      initialLocale={locale}
      settings={settings}
      metro={METRO_STATION}
      breakfastIncluded={stay?.breakfastIncluded ?? false}
      checkedIn={!!stay}
      source={stay?.source ?? ""}
      paymentEnabled={paymentEnabled}
      breakfastOrderable={breakfastOrderable}
      lateCheckoutOrderable={lateCheckoutOrderable}
      // Stock illimité : toujours disponible pour le client (le nombre restant n'est jamais affiché).
      products={minibar.map(({ unlimited, ...p }) => (unlimited ? { ...p, stock: 999 } : p))}
    />
  );
}
