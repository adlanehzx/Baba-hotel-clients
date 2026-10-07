/**
 * Informations pratiques affichées aux clients.
 * ⚠️ Les valeurs marquées TODO sont à vérifier / compléter par l'hôtel.
 */
export const HOTEL = {
  name: "Baba Hotel",
  address: "15 rue du Roi d'Alger, 75018 Paris",
  phone: "+33 1 81 70 17 27",
  phoneHref: "tel:+33181701727",
  email: "reservation@baba-hotel.com",
  checkIn: "14:00",
  checkOut: "11:00",

  wifiName: "TODO-nom-du-wifi", // TODO
  wifiPassword: "TODO-mot-de-passe", // TODO
  breakfastHours: "7:30 – 10:30", // TODO : horaires réels du petit-déjeuner

  metro: "Simplon",
} as const;

/** Variables utilisables dans les textes traduits sous la forme {nom}. */
export const FACTS: Record<string, string> = {
  hotel: HOTEL.name,
  address: HOTEL.address,
  phone: HOTEL.phone,
  checkIn: HOTEL.checkIn,
  checkOut: HOTEL.checkOut,
  wifiName: HOTEL.wifiName,
  wifiPassword: HOTEL.wifiPassword,
  breakfastHours: HOTEL.breakfastHours,
  metro: HOTEL.metro,
};
