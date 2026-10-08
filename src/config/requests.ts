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

/** Les commandes minibar passent par leur propre section, pas par la grille ci-dessus. */
export type Category = (typeof CATEGORIES)[number] | "minibar" | "desk";
/** "desk" : appel depuis le QR code posé à la réception (personne au comptoir). */
export const ALL_CATEGORIES: Category[] = [...CATEGORIES, "minibar", "desk"];

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
  minibar: "Commande minibar",
  desk: "Client à l'accueil",
};

export const MAX_MESSAGE_LENGTH = 600;
/** Anti-abus : nombre max de demandes par chambre et par heure. */
export const MAX_REQUESTS_PER_HOUR = 8;
/** Anti-abus : quantité max d'un même article par commande. */
export const MAX_QTY_PER_ITEM = 10;
