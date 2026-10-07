"use client";

import { useCallback, useEffect, useState } from "react";
import type { HotelSettings } from "@/config/hotel";
import { centsToInput, parseEuros } from "@/lib/money";
import { formatPrice, lateCheckoutOptions, TIME_RE } from "@/lib/time";
import styles from "./reception.module.css";

/** Version « formulaire » des réglages : les prix sont saisis en euros. */
type Form = Omit<HotelSettings, "breakfastPrice" | "lateCheckoutHourly"> & { breakfastPrice: string; lateCheckoutHourly: string };
type RoomRow = { id: string; number: string; stay: unknown };

const toForm = (s: HotelSettings): Form => ({
  ...s,
  breakfastPrice: centsToInput(s.breakfastPrice),
  lateCheckoutHourly: centsToInput(s.lateCheckoutHourly),
});

/** Toutes les informations affichées aux clients, et la liste des chambres. */
export default function SettingsForm() {
  const [form, setForm] = useState<Form | null>(null);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/reception/settings", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((s: HotelSettings) => setForm(toForm(s)))
      .catch(() => setError("Impossible de charger les réglages. Vérifiez la connexion."));
  }, []);

  if (!form) return <p className={styles.empty}>{error || "Chargement des réglages…"}</p>;

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [k]: e.target.value });
    setState("idle");
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const breakfastPrice = parseEuros(form.breakfastPrice);
    const lateCheckoutHourly = parseEuros(form.lateCheckoutHourly);
    if (breakfastPrice === null || lateCheckoutHourly === null) return setError("Les prix doivent être des montants, par exemple 12 ou 12,50.");
    setState("saving");
    const res = await fetch("/api/reception/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, breakfastPrice, lateCheckoutHourly }),
    }).catch(() => null);
    if (!res?.ok) {
      const data = await res?.json().catch(() => ({}));
      setError(data?.error ?? "Enregistrement impossible. Vérifiez la connexion.");
      return setState("idle");
    }
    setError("");
    setForm(toForm(await res.json()));
    setState("saved");
  };

  // Aperçu des créneaux de départ tardif proposés aux clients
  const hourly = parseEuros(form.lateCheckoutHourly);
  const preview =
    hourly !== null && TIME_RE.test(form.checkOut) && TIME_RE.test(form.lateCheckoutMax)
      ? lateCheckoutOptions(form.checkOut, form.lateCheckoutMax, hourly)
      : [];

  const time = (k: keyof Form, label: string) => (
    <label htmlFor={`s-${k}`}>
      {label}
      <input
        id={`s-${k}`}
        inputMode="numeric"
        placeholder="07:30"
        pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
        title="Format HH:MM, par exemple 07:30"
        maxLength={5}
        value={form[k]}
        onChange={set(k)}
        required
      />
    </label>
  );
  const text = (k: keyof Form, label: string, extra?: React.InputHTMLAttributes<HTMLInputElement>) => (
    <label htmlFor={`s-${k}`}>
      {label}
      <input id={`s-${k}`} value={form[k]} onChange={set(k)} {...extra} />
    </label>
  );

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <div>
          <h2 className="serif">Réglages</h2>
          <p>Ces informations s&apos;affichent sur la page des clients, dans toutes les langues, dès que vous enregistrez.</p>
        </div>
      </div>

      <form className={styles.settings} onSubmit={save}>
        <fieldset>
          <legend>Wi-Fi</legend>
          <div className={styles.fields}>
            {text("wifiName", "Nom du réseau", { required: true })}
            {text("wifiPassword", "Mot de passe", { autoComplete: "off" })}
          </div>
        </fieldset>

        <fieldset>
          <legend>Arrivée et départ</legend>
          <div className={styles.fields}>
            {time("checkIn", "Check-in à partir de")}
            {time("checkOut", "Check-out avant")}
          </div>
        </fieldset>

        <fieldset>
          <legend>Petit-déjeuner</legend>
          <div className={styles.fields}>
            {time("breakfastStart", "De")}
            {time("breakfastEnd", "À")}
            {text("breakfastPrice", "Prix par personne (€)", { inputMode: "decimal", required: true })}
          </div>
          <p className={styles.help}>Les clients dont le petit-déjeuner est offert (cochés dans Chambres) ne voient pas le prix.</p>
        </fieldset>

        <fieldset>
          <legend>Départ tardif</legend>
          <div className={styles.fields}>
            {text("lateCheckoutHourly", "Prix par heure supplémentaire (€)", { inputMode: "decimal", required: true })}
            {time("lateCheckoutMax", "Jusqu'à")}
          </div>
          {preview.length > 0 && (
            <p className={styles.help}>
              Proposé aux clients :{" "}
              {preview.map((o) => `${o.time} (+${formatPrice(o.price, "fr-FR")})`).join(", ")}
            </p>
          )}
        </fieldset>

        <fieldset>
          <legend>Contact</legend>
          <div className={styles.fields}>
            {text("phone", "Téléphone de la réception", { inputMode: "tel", required: true })}
            {text("address", "Adresse", { required: true })}
          </div>
        </fieldset>

        {error && <p className={styles.error} role="alert">{error}</p>}
        <div className={styles.saveBar}>
          <button className={styles.primary} disabled={state === "saving"}>
            {state === "saving" ? "Enregistrement…" : "Enregistrer"}
          </button>
          {state === "saved" && <span className={styles.saved} role="status">Enregistré. Les clients voient déjà les nouvelles informations.</span>}
        </div>
      </form>

      <RoomsList />
    </div>
  );
}

/** Ajout et suppression de chambres (chaque chambre a son propre QR code). */
function RoomsList() {
  const [rooms, setRooms] = useState<RoomRow[] | null>(null);
  const [number, setNumber] = useState("");
  const [error, setError] = useState("");
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/reception/rooms", { cache: "no-store" }).catch(() => null);
    if (res?.ok) setRooms(await res.json());
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/reception/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ number }),
    }).catch(() => null);
    if (!res?.ok) {
      const data = await res?.json().catch(() => ({}));
      return setError(data?.error ?? "Ajout impossible. Vérifiez la connexion.");
    }
    setError("");
    setNumber("");
    load();
  };

  const remove = async (id: string) => {
    setConfirmDel(null);
    await fetch(`/api/reception/rooms/${id}`, { method: "DELETE" }).catch(() => null);
    load();
  };

  return (
    <section className={styles.settings} aria-labelledby="rooms-t">
      <fieldset>
        <legend id="rooms-t">Chambres</legend>
        <p className={styles.help}>
          Chaque chambre a son QR code. Après un ajout, imprimez son étiquette depuis « QR codes ». Supprimer une chambre
          efface son historique et désactive son QR code.
        </p>
        {rooms && (
          <ul className={styles.roomChips}>
            {rooms.map((r) => (
              <li key={r.id}>
                {confirmDel === r.id ? (
                  <>
                    <span>Supprimer la {r.number} ?</span>
                    <button className={styles.danger} onClick={() => remove(r.id)}>Oui</button>
                    <button className={styles.ghost} onClick={() => setConfirmDel(null)}>Non</button>
                  </>
                ) : (
                  <>
                    <span className="serif">{r.number}</span>
                    <button className={styles.chipX} aria-label={`Supprimer la chambre ${r.number}`} onClick={() => setConfirmDel(r.id)}>
                      ×
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        <form className={styles.inlineAdd} onSubmit={add}>
          <label htmlFor="new-room" className="sr-only">Numéro de la nouvelle chambre</label>
          <input id="new-room" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Numéro, ex. 35" required />
          <button className={styles.primary}>Ajouter la chambre</button>
        </form>
        {error && <p className={styles.error} role="alert">{error}</p>}
      </fieldset>
    </section>
  );
}
