"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./reception.module.css";

type RoomRow = {
  id: string;
  number: string;
  stay: { id: string; breakfastIncluded: boolean; checkedInAt: string } | null;
  openRequests: number;
};

const since = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Check-in / check-out et petit-déjeuner offert, chambre par chambre. */
export default function RoomsManager() {
  const [rooms, setRooms] = useState<RoomRow[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmOut, setConfirmOut] = useState<string | null>(null);
  // Case « petit-déj offert » cochée avant le check-in, par chambre
  const [bfDraft, setBfDraft] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    const res = await fetch("/api/reception/rooms", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return setError("Impossible de charger les chambres. Vérifiez la connexion.");
    setError("");
    setRooms(await res.json());
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);

  const act = async (roomId: string, path: string, method: string, body?: unknown) => {
    setBusy(roomId);
    const res = await fetch(`/api/reception/rooms/${roomId}/${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    }).catch(() => null);
    setBusy(null);
    if (!res?.ok) setError("L'action n'a pas abouti. Réessayez.");
    await load();
  };

  if (!rooms) return <p className={styles.empty}>{error || "Chargement des chambres…"}</p>;

  const occupied = rooms.filter((r) => r.stay);
  const breakfasts = occupied.filter((r) => r.stay!.breakfastIncluded).length;

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <div>
          <h2 className="serif">Chambres</h2>
          <p>
            Au check-in, indiquez si le petit-déjeuner est offert (réservation sur le site officiel). Le client le voit
            directement sur sa page.
          </p>
        </div>
        <dl className={styles.summary}>
          <div><dt>Occupées</dt><dd>{occupied.length} / {rooms.length}</dd></div>
          <div><dt>Petits-déj offerts</dt><dd>{breakfasts}</dd></div>
        </dl>
      </div>
      {error && <p className={styles.error} role="alert">{error}</p>}

      <ul className={styles.roomGrid}>
        {rooms.map((r) => (
          <li key={r.id} className={styles.roomCard} data-occupied={r.stay ? "" : undefined}>
            <div className={styles.roomTop}>
              <span className={`${styles.roomNum} serif`}>{r.number}</span>
              <span className={styles.roomState}>{r.stay ? "Occupée" : "Libre"}</span>
            </div>
            {r.stay && <p className={styles.roomSince}>Arrivée {since(r.stay.checkedInAt)}</p>}
            {r.openRequests > 0 && (
              <p className={styles.roomOpen}>
                {r.openRequests} demande{r.openRequests > 1 ? "s" : ""} en attente
              </p>
            )}

            <label className={styles.switch}>
              <input
                type="checkbox"
                checked={r.stay ? r.stay.breakfastIncluded : !!bfDraft[r.id]}
                disabled={busy === r.id}
                onChange={(e) =>
                  r.stay
                    ? act(r.id, "stay", "PATCH", { breakfastIncluded: e.target.checked })
                    : setBfDraft((d) => ({ ...d, [r.id]: e.target.checked }))
                }
              />
              <span>Petit-déj offert</span>
            </label>

            <div className={styles.actions}>
              {!r.stay && (
                <button
                  className={styles.primary}
                  disabled={busy === r.id}
                  onClick={async () => {
                    await act(r.id, "checkin", "POST", { breakfastIncluded: !!bfDraft[r.id] });
                    setBfDraft((d) => ({ ...d, [r.id]: false }));
                  }}
                >
                  Check-in
                </button>
              )}
              {r.stay &&
                (confirmOut === r.id ? (
                  <>
                    <button
                      className={styles.danger}
                      disabled={busy === r.id}
                      onClick={async () => {
                        setConfirmOut(null);
                        await act(r.id, "checkout", "POST");
                      }}
                    >
                      Confirmer le check-out
                    </button>
                    <button className={styles.ghost} onClick={() => setConfirmOut(null)}>Annuler</button>
                  </>
                ) : (
                  <button className={styles.ghost} disabled={busy === r.id} onClick={() => setConfirmOut(r.id)}>
                    Check-out
                  </button>
                ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
