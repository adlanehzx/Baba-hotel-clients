"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { Category } from "@/config/requests";
import type { RequestDetails } from "@/db/schema";
import styles from "./reception.module.css";

export type Status = "NEW" | "IN_PROGRESS" | "DONE" | "CANCELLED";
export type Row = {
  id: string;
  room: string;
  category: Category;
  message: string | null;
  details: RequestDetails | null;
  lang: string;
  status: Status;
  createdAt: string;
  updatedAt: string;
  doneAt: string | null;
};

type Ctx = {
  rows: Row[];
  loaded: boolean;
  fresh: Set<string>;
  reload: () => Promise<void>;
  setRows: React.Dispatch<React.SetStateAction<Row[]>>;
};
const RequestsContext = createContext<Ctx | null>(null);
export const useRequests = () => {
  const ctx = useContext(RequestsContext);
  if (!ctx) throw new Error("useRequests doit être utilisé dans ReceptionShell");
  return ctx;
};

const POLL_MS = 4000;

/** Petit carillon à deux notes, joué à l'arrivée d'une demande. */
function chime(ctx: AudioContext) {
  const t0 = ctx.currentTime;
  [880, 1318.5].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    const t = t0 + i * 0.18;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.25, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 1);
  });
}

const NAV = [
  { href: "/reception", label: "Demandes" },
  { href: "/reception/chambres", label: "Chambres" },
  { href: "/reception/minibar", label: "Minibar" },
  { href: "/reception/reglages", label: "Réglages" },
  { href: "/reception/qr", label: "QR codes" },
];

/**
 * Cadre commun à toutes les pages de la réception. Il interroge le serveur en
 * continu : le signal sonore et le compteur de nouvelles demandes fonctionnent
 * quelle que soit la page ouverte.
 */
export default function ReceptionShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [rows, setRows] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [offline, setOffline] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const known = useRef<Set<string> | null>(null);
  const audio = useRef<AudioContext | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/reception/requests", { cache: "no-store" });
      if (res.status === 401) return router.refresh();
      if (!res.ok) throw new Error();
      const data: Row[] = await res.json();
      setOffline(false);

      // Repère les demandes arrivées depuis le dernier passage
      if (known.current) {
        const arrived = data.filter((r) => !known.current!.has(r.id) && r.status === "NEW").map((r) => r.id);
        if (arrived.length) {
          setFresh((prev) => new Set([...prev, ...arrived]));
          if (audio.current) chime(audio.current);
          setTimeout(
            () =>
              setFresh((prev) => {
                const next = new Set(prev);
                arrived.forEach((id) => next.delete(id));
                return next;
              }),
            6000,
          );
        }
      }
      known.current = new Set(data.map((r) => r.id));
      setRows(data);
      setLoaded(true);
    } catch {
      setOffline(true);
    }
  }, [router]);

  useEffect(() => {
    // reload() est asynchrone : l'état n'est mis à jour qu'après la réponse du serveur
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
    const poll = setInterval(reload, POLL_MS);
    return () => clearInterval(poll);
  }, [reload]);

  const newCount = rows.filter((r) => r.status === "NEW").length;
  useEffect(() => {
    document.title = newCount ? `(${newCount}) Réception — Baba Hotel` : "Réception — Baba Hotel";
  }, [newCount]);

  const enableSound = () => {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audio.current = new Ctx();
    chime(audio.current);
    setSoundOn(true);
  };

  const logout = async () => {
    await fetch("/api/reception/logout", { method: "POST" });
    router.refresh();
  };

  return (
    <RequestsContext.Provider value={{ rows, loaded, fresh, reload, setRows }}>
      <div className={styles.board}>
        <header className={styles.bar}>
          <h1 className="serif">Réception <span>Baba Hotel</span></h1>
          <nav className={styles.nav} aria-label="Réception">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} aria-current={pathname === n.href ? "page" : undefined}>
                {n.label}
                {n.href === "/reception" && newCount > 0 && <span className={styles.navBadge}>{newCount}</span>}
              </Link>
            ))}
          </nav>
          <div className={styles.barActions}>
            {offline && <span className={styles.offline} role="status">Connexion perdue, nouvel essai…</span>}
            {soundOn ? (
              <span className={styles.soundOn}>Son activé</span>
            ) : (
              <button className={styles.primary} onClick={enableSound}>Activer le son</button>
            )}
            <button className={styles.ghost} onClick={logout}>Se déconnecter</button>
          </div>
        </header>
        {!soundOn && (
          <p className={styles.hint}>
            Cliquez sur « Activer le son » pour entendre un signal à chaque nouvelle demande, quelle que soit la page ouverte.
          </p>
        )}
        {children}
      </div>
    </RequestsContext.Provider>
  );
}
