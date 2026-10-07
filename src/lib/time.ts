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
