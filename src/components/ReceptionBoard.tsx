"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CATEGORY_LABELS_FR, type Category } from "@/config/requests";
import styles from "./reception.module.css";

type Status = "NEW" | "IN_PROGRESS" | "DONE";
type Row = {
  id: string;
  room: string;
  category: Category;
  message: string | null;
  lang: string;
  status: Status;
  createdAt: string;
  updatedAt: string;
  doneAt: string | null;
};

const POLL_MS = 4000;
const LATE_MIN = 10; // une demande non prise en charge depuis 10 min passe en alerte

const COLUMNS: { status: Status; title: string; empty: string }[] = [
  { status: "NEW", title: "Nouvelles", empty: "Aucune nouvelle demande." },
  { status: "IN_PROGRESS", title: "En cours", empty: "Rien en cours." },
  { status: "DONE", title: "Traitées (12 h)", empty: "Aucune demande traitée récemment." },
];

function ago(iso: string, now: number) {
  const min = Math.floor((now - Date.parse(iso)) / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  return `il y a ${h} h ${String(min % 60).padStart(2, "0")}`;
}

/** Nom de la langue en français : « anglais », « japonais »… */
function langNameFr(code: string) {
  try {
    return new Intl.DisplayNames(["fr"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** Petit carillon à deux notes, joué à l'arrivée d'une demande. */
function chime(ctx: AudioContext) {
  const t0 = ctx.currentTime;
  [880, 1318.5].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
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

export default function ReceptionBoard() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [offline, setOffline] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [soundOn, setSoundOn] = useState(false);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const known = useRef<Set<string> | null>(null);
  const audio = useRef<AudioContext | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/reception/requests", { cache: "no-store" });
      if (res.status === 401) return router.refresh();
      if (!res.ok) throw new Error();
      const data: Row[] = await res.json();
      setOffline(false);

      // Repère les demandes arrivées depuis le dernier passage
      const ids = new Set(data.map((r) => r.id));
      if (known.current) {
        const arrived = data.filter((r) => !known.current!.has(r.id) && r.status === "NEW").map((r) => r.id);
        if (arrived.length) {
          setFresh((prev) => new Set([...prev, ...arrived]));
          if (audio.current) chime(audio.current);
          setTimeout(() => setFresh((prev) => {
            const next = new Set(prev);
            arrived.forEach((id) => next.delete(id));
            return next;
          }), 6000);
        }
      }
      known.current = ids;
      setRows(data);
      setLoaded(true);
    } catch {
      setOffline(true);
    }
  }, [router]);

  useEffect(() => {
    // load() est asynchrone : l'état n'est mis à jour qu'après la réponse du serveur
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const poll = setInterval(load, POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [load]);

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

  const setStatus = async (id: string, status: Status) => {
    // Mise à jour immédiate à l'écran, corrigée au prochain rafraîchissement si besoin
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status, doneAt: status === "DONE" ? new Date().toISOString() : null } : r)));
    await fetch(`/api/reception/requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }).catch(() => null);
    load();
  };

  const logout = async () => {
    await fetch("/api/reception/logout", { method: "POST" });
    router.refresh();
  };

  return (
    <div className={styles.board}>
      <header className={styles.bar}>
        <h1 className="serif">Réception <span>Baba Hotel</span></h1>
        <div className={styles.barActions}>
          {offline && <span className={styles.offline} role="status">Connexion perdue, nouvel essai…</span>}
          {soundOn ? (
            <span className={styles.soundOn}>Son activé</span>
          ) : (
            <button className={styles.primary} onClick={enableSound}>Activer le son</button>
          )}
          <a className={styles.ghost} href="/reception/qr">QR codes</a>
          <button className={styles.ghost} onClick={logout}>Se déconnecter</button>
        </div>
      </header>

      {!soundOn && (
        <p className={styles.hint}>
          Cliquez sur « Activer le son » pour entendre un signal à chaque nouvelle demande. Laissez cette page ouverte.
        </p>
      )}

      <div className={styles.columns}>
        {COLUMNS.map((col) => {
          const list = rows.filter((r) => r.status === col.status);
          if (col.status === "DONE") list.sort((a, b) => Date.parse(b.doneAt ?? b.updatedAt) - Date.parse(a.doneAt ?? a.updatedAt));
          else list.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)); // les plus anciennes d'abord
          return (
            <section key={col.status} className={styles.column} data-status={col.status} aria-labelledby={`col-${col.status}`}>
              <h2 id={`col-${col.status}`}>
                {col.title} <span className={styles.count}>{list.length}</span>
              </h2>
              {loaded && !list.length && <p className={styles.empty}>{col.empty}</p>}
              <ul>
                {list.map((r) => {
                  const late = r.status === "NEW" && now - Date.parse(r.createdAt) > LATE_MIN * 60000;
                  const langName = langNameFr(r.lang);
                  return (
                    <li key={r.id} className={styles.card} data-fresh={fresh.has(r.id) || undefined} data-late={late || undefined}>
                      <div className={styles.cardHead}>
                        <span className={`${styles.room} serif`}>
                          <small>Ch.</small> {r.room}
                        </span>
                        <span className={styles.time} title={new Date(r.createdAt).toLocaleString("fr-FR")}>
                          {ago(r.createdAt, now)}
                        </span>
                      </div>
                      <p className={styles.cat}>{CATEGORY_LABELS_FR[r.category] ?? r.category}</p>
                      {r.message && (
                        <blockquote className={styles.msg} lang={r.lang}>
                          {r.message}
                        </blockquote>
                      )}
                      {r.lang !== "fr" && (
                        <p className={styles.lang}>
                          Client en {langName}
                          {r.message && (
                            <>
                              {" · "}
                              <a
                                href={`https://translate.google.com/?sl=auto&tl=fr&op=translate&text=${encodeURIComponent(r.message)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Traduire
                              </a>
                            </>
                          )}
                        </p>
                      )}
                      <div className={styles.actions}>
                        {r.status === "NEW" && (
                          <button className={styles.primary} onClick={() => setStatus(r.id, "IN_PROGRESS")}>Prendre en charge</button>
                        )}
                        {r.status !== "DONE" && (
                          <button className={r.status === "NEW" ? styles.ghost : styles.primary} onClick={() => setStatus(r.id, "DONE")}>
                            Marquer comme traitée
                          </button>
                        )}
                        {r.status === "DONE" && (
                          <button className={styles.ghost} onClick={() => setStatus(r.id, "IN_PROGRESS")}>Rouvrir</button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
