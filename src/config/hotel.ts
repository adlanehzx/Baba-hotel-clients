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
  lateCheckoutMax: string; // heure de départ la plus tardive possible
  lateCheckoutHourly: number; // en centimes, par heure supplémentaire
  phone: string;
  address: string;
};

export const DEFAULT_SETTINGS: HotelSettings = {
  wifiName: "Baba Hotel",
  wifiPassword: "",
  checkIn: "14:00",
  checkOut: "11:00",
  breakfastStart: "07:30",
  breakfastEnd: "11:00",
  breakfastPrice: 1200,
  lateCheckoutMax: "13:30",
  lateCheckoutHourly: 1000,
  phone: "+33 1 81 70 17 27",
  address: "15 rue du Roi d'Alger, 75018 Paris",
};

export const METRO_STATION = "Simplon";
