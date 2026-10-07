import type { Metadata } from "next";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { db, rooms } from "@/db";
import { isReceptionLoggedIn } from "@/lib/auth";
import { byRoomNumber } from "@/lib/rooms";
import PrintButton from "@/components/PrintButton";
import styles from "@/components/reception.module.css";

export const metadata: Metadata = { title: "QR codes — Baba Hotel" };

/** Adresse publique du site (à fixer dans PUBLIC_BASE_URL en production). */
async function baseUrl() {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

export default async function QrPage() {
  if (!(await isReceptionLoggedIn())) return null; // le layout affiche la connexion

  const [base, list] = await Promise.all([baseUrl(), db.select().from(rooms)]);
  list.sort(byRoomNumber);

  const cards = await Promise.all(
    list.map(async (room) => ({
      number: room.number,
      svg: await QRCode.toString(`${base}/r/${room.token}`, {
        type: "svg",
        margin: 0,
        errorCorrectionLevel: "M",
        color: { dark: "#17201c", light: "#00000000" },
      }),
    })),
  );

  return (
    <div className={styles.qrPage}>
      <div className={styles.qrBar}>
        <div>
          <h2 className="serif">QR codes des chambres</h2>
          <p>
            Un code par chambre : il ouvre la page d&apos;aide avec le numéro de chambre déjà rempli.
            Imprimez sur A4 (9 étiquettes par page) et découpez le long des pointillés.
          </p>
        </div>
        <div className={styles.barActions}>
          <PrintButton className={styles.primary} />
        </div>
      </div>

      {!cards.length && (
        <p className={styles.empty}>
          Aucune chambre en base. Lancez <code>npm run db:seed</code> après avoir renseigné les numéros dans{" "}
          <code>src/config/rooms.ts</code>.
        </p>
      )}

      <div className={styles.qrGrid}>
        {cards.map((c) => (
          <article key={c.number} className={styles.qrCard}>
            <p className={styles.qrHotel}>Baba Hotel</p>
            <p className={styles.qrLine}>
              Une question, une demande ?<br />
              <span lang="en">Questions or requests?</span>
            </p>
            <div className={styles.qrCode} dangerouslySetInnerHTML={{ __html: c.svg }} role="img" aria-label={`QR code chambre ${c.number}`} />
            <p className={styles.qrRoom}>
              <small>Chambre · Room</small>
              {c.number}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}
