/** Types de demandes proposés au client (les libellés sont dans les traductions). */
export const CATEGORIES = [
  "towels",
  "toiletries",
  "cleaning",
  "problem",
  "lateCheckout",
  "taxi",
  "other",
] as const;

export type Category = (typeof CATEGORIES)[number];

/** Pour ces demandes, le client doit écrire un message. */
export const MESSAGE_REQUIRED: Category[] = ["problem", "other"];

/** Libellés côté réception (en français). */
export const CATEGORY_LABELS_FR: Record<Category, string> = {
  towels: "Serviettes / linge",
  toiletries: "Produits d'accueil",
  cleaning: "Ménage",
  problem: "Problème dans la chambre",
  lateCheckout: "Départ tardif",
  taxi: "Taxi",
  other: "Autre demande",
};

export const MAX_MESSAGE_LENGTH = 600;
/** Anti-abus : nombre max de demandes par chambre et par heure. */
export const MAX_REQUESTS_PER_HOUR = 8;
