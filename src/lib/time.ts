/** Petits utilitaires d'heures "HH:MM" et de prix, partagés client / serveur. */

export const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const toMinutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
export const fromMinutes = (n: number) =>
  `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;

/** Prix en centimes → "12,00 €" / "€12.00" selon la langue. */
export function formatPrice(cents: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

/**
 * Créneaux de départ tardif : toutes les 30 min après l'heure de départ normale,
 * jusqu'à l'heure maximale. Prix au prorata du tarif horaire.
 */
export function lateCheckoutOptions(checkOut: string, max: string, hourly: number) {
  const start = toMinutes(checkOut);
  const end = toMinutes(max);
  const options: { time: string; price: number }[] = [];
  for (let t = start + 30; t <= end; t += 30) {
    options.push({ time: fromMinutes(t), price: Math.round(((t - start) / 60) * hourly) });
  }
  return options;
}

/**
 * Minutes écoulées depuis minuit dans le fuseau donné (ex. "Europe/Paris"),
 * à l'instant `at`. Les Workers tournent en UTC : on reconstruit l'heure locale
 * avec Intl pour comparer aux heures limites ("07:00", "10:30"…).
 */
export function minutesOfDayInTz(tz: string, at: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return (h % 24) * 60 + m;
}

/**
 * Validité d'un lien de paiement, en secondes : au plus `maxMinutes` (30 min par
 * défaut) et jamais au-delà de l'heure limite du service `untilHHMM` (fuseau `tz`).
 * Renvoie 0 si l'heure limite est déjà passée (commande impossible).
 */
export function linkLifeSeconds(untilHHMM: string, tz: string, maxMinutes = 30, at: Date = new Date()): number {
  const nowMin = minutesOfDayInTz(tz, at);
  const untilMin = toMinutes(untilHHMM);
  const minutesLeft = untilMin - nowMin;
  if (minutesLeft <= 0) return 0;
  return Math.min(maxMinutes, minutesLeft) * 60;
}
