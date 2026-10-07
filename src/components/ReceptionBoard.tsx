"use client";

import { useEffect, useState } from "react";
import { CATEGORY_LABELS_FR } from "@/config/requests";
import { formatPrice } from "@/lib/time";
import { useRequests, type Row, type Status } from "./ReceptionShell";
import styles from "./reception.module.css";

const LATE_MIN = 10; // une demande non prise en charge depuis 10 min passe en alerte

const COLUMNS: { key: string; statuses: Status[]; title: string; empty: string }[] = [
  { key: "NEW", statuses: ["NEW"], title: "Nouvelles", empty: "Aucune nouvelle demande." },
  { key: "IN_PROGRESS", statuses: ["IN_PROGRESS"], title: "En cours", empty: "Rien en cours." },
  { key: "DONE", statuses: ["DONE", "CANCELLED"], title: "Terminées (12 h)", empty: "Aucune demande terminée récemment." },
];

const eur = (cents: number) => formatPrice(cents, "fr-FR");

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

/** Boutons proposés selon le type de demande et son statut. */
function actionsFor(r: Row): { to: Status; label: string; primary?: boolean }[] {
  if (r.status === "CANCELLED") return [];
  if (r.category === "minibar") {
    if (r.status === "NEW") return [{ to: "IN_PROGRESS", label: "Commande prête", primary: true }, { to: "CANCELLED", label: "Annuler la commande" }];
    if (r.status === "IN_PROGRESS") return [{ to: "DONE", label: "Récupérée par le client", primary: true }, { to: "CANCELLED", label: "Annuler la commande" }];
    return [];
  }
  if (r.category === "lateCheckout") {
    if (r.status === "DONE") return [];
    return [{ to: "DONE", label: "Accepter", primary: true }, { to: "CANCELLED", label: "Refuser" }];
  }
  if (r.status === "NEW") return [{ to: "IN_PROGRESS", label: "Prendre en charge", primary: true }, { to: "DONE", label: "Marquer comme traitée" }];
  if (r.status === "IN_PROGRESS") return [{ to: "DONE", label: "Marquer comme traitée", primary: true }];
  return [{ to: "IN_PROGRESS", label: "Rouvrir" }];
}

const endLabel = (r: Row) => {
  if (r.status === "CANCELLED") return r.category === "lateCheckout" ? "Refusée" : "Annulée";
  if (r.category === "minibar") return "Récupérée";
  if (r.category === "lateCheckout") return "Acceptée";
  return "Traitée";
};

export default function ReceptionBoard() {
  const { rows, loaded, fresh, reload, setRows } = useRequests();
  const [now, setNow] = useState(() => Date.now());
  const [confirm, setConfirm] = useState<string | null>(null); // id en attente de confirmation d'annulation

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(tick);
  }, []);

  const setStatus = async (id: string, status: Status) => {
    setConfirm(null);
    // Mise à jour immédiate à l'écran, corrigée au prochain rafraîchissement si besoin
    const end = status === "DONE" || status === "CANCELLED";
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status, doneAt: end ? new Date().toISOString() : null } : r)));
    await fetch(`/api/reception/requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }).catch(() => null);
    reload();
  };

  return (
    <div className={styles.columns}>
      {COLUMNS.map((col) => {
        const list = rows.filter((r) => col.statuses.includes(r.status));
        if (col.key === "DONE") list.sort((a, b) => Date.parse(b.doneAt ?? b.updatedAt) - Date.parse(a.doneAt ?? a.updatedAt));
        else list.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)); // les plus anciennes d'abord
        return (
          <section key={col.key} className={styles.column} data-status={col.key} aria-labelledby={`col-${col.key}`}>
            <h2 id={`col-${col.key}`}>
              {col.title} <span className={styles.count}>{list.length}</span>
            </h2>
            {loaded && !list.length && <p className={styles.empty}>{col.empty}</p>}
            <ul>
              {list.map((r) => {
                const late = r.status === "NEW" && now - Date.parse(r.createdAt) > LATE_MIN * 60000;
                return (
                  <li
                    key={r.id}
                    className={styles.card}
                    data-fresh={fresh.has(r.id) || undefined}
                    data-late={late || undefined}
                    data-cancelled={r.status === "CANCELLED" || undefined}
                  >
                    <div className={styles.cardHead}>
                      <span className={`${styles.room} serif`}>
                        <small>Ch.</small> {r.room}
                      </span>
                      <span className={styles.time} title={new Date(r.createdAt).toLocaleString("fr-FR")}>
                        {ago(r.createdAt, now)}
                      </span>
                    </div>
                    <p className={styles.cat}>
                      {CATEGORY_LABELS_FR[r.category] ?? r.category}
                      {col.key === "DONE" && <span className={styles.endTag}>{endLabel(r)}</span>}
                    </p>

                    {r.details?.kind === "lateCheckout" && (
                      <p className={styles.detail}>
                        Départ à <strong>{r.details.time}</strong> · supplément {eur(r.details.price)}
                      </p>
                    )}
                    {r.details?.kind === "minibar" && (
                      <table className={styles.order}>
                        <tbody>
                          {r.details.items.map((i) => (
                            <tr key={i.productId}>
                              <td>{i.qty} ×</td>
                              <td>{i.name}</td>
                              <td>{eur(i.price * i.qty)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr>
                            <td colSpan={2}>Total</td>
                            <td>{eur(r.details.total)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    )}

                    {r.message && (
                      <blockquote className={styles.msg} lang={r.lang}>
                        {r.message}
                      </blockquote>
                    )}
                    {r.lang !== "fr" && (
                      <p className={styles.lang}>
                        Client en {langNameFr(r.lang)}
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
                      {confirm === r.id ? (
                        <>
                          <span className={styles.confirmText}>
                            {r.category === "minibar" ? "Annuler cette commande ? Les articles reviennent en stock." : "Confirmer ?"}
                          </span>
                          <button className={styles.danger} onClick={() => setStatus(r.id, "CANCELLED")}>
                            Oui, {r.category === "lateCheckout" ? "refuser" : "annuler"}
                          </button>
                          <button className={styles.ghost} onClick={() => setConfirm(null)}>Non</button>
                        </>
                      ) : (
                        actionsFor(r).map((a) => (
                          <button
                            key={a.to}
                            className={a.primary ? styles.primary : styles.ghost}
                            onClick={() => (a.to === "CANCELLED" ? setConfirm(r.id) : setStatus(r.id, a.to))}
                          >
                            {a.label}
                          </button>
                        ))
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
  );
}
