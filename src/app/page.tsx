import styles from "./home.module.css";

/** Page d'accueil neutre : les clients arrivent normalement par le QR code de leur chambre. */
export default function Home() {
  return (
    <main className={styles.main}>
      <h1 className={`${styles.title} serif`}>Baba Hotel</h1>
      <p lang="fr">Scannez le QR code de votre chambre.</p>
      <p lang="en">Scan the QR code in your room.</p>
      <p lang="es">Escanee el código QR de su habitación.</p>
      <a className={styles.staff} href="/reception">Accès réception</a>
    </main>
  );
}
