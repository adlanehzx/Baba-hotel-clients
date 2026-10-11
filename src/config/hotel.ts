/**
 * Valeurs par défaut des informations de l'hôtel.
 * Elles sont toutes modifiables depuis la réception (Réglages) : ce fichier ne sert
 * qu'au premier démarrage, tant que rien n'a été enregistré.
 */
export type HotelSettings = {
  wifiName: string;
  wifiPassword: string;
  checkIn: string; // "HH:MM"
  checkOut: string;
  breakfastStart: string;
  breakfastEnd: string;
  breakfastPrice: number; // en centimes, par personne
  /** Heure limite pour commander le petit-déjeuner à la carte (ex. "07:00"). */
  breakfastOrderUntil: string;
  lateCheckoutMax: string; // heure de départ la plus tardive possible
  lateCheckoutHourly: number; // en centimes, par heure supplémentaire
  /** Heure limite pour commander un départ tardif (ex. "10:30"). */
  lateCheckoutOrderUntil: string;
  phone: string;
  address: string;
  /** Lien « Laisser un avis » Google de l'hôtel, proposé aux clients ayant réservé en direct ("" = pas proposé). */
  googleReviewUrl: string;
};

export const DEFAULT_SETTINGS: HotelSettings = {
  wifiName: "Baba Hotel",
  wifiPassword: "",
  checkIn: "14:00",
  checkOut: "11:00",
  breakfastStart: "07:30",
  breakfastEnd: "11:00",
  breakfastPrice: 1200,
  breakfastOrderUntil: "07:00",
  lateCheckoutMax: "13:30",
  lateCheckoutHourly: 1000,
  lateCheckoutOrderUntil: "10:30",
  phone: "+33 1 81 70 17 27",
  address: "15 rue du Roi d'Alger, 75018 Paris",
  googleReviewUrl: "",
};

export const METRO_STATION = "Simplon";

/** Fuseau de l'hôtel : les heures limites ("07:00", "10:30"…) sont comprises dans ce fuseau. */
export const HOTEL_TZ = "Europe/Paris";

/** Devise des paiements en ligne (code ISO). */
export const CURRENCY = "EUR";
