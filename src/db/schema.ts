import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createId } from "@/lib/id";
import type { FeedbackTag } from "@/config/feedback";

/** Dates stockées en millisecondes (entier), relues en objets Date. */
const ts = (name: string) => integer(name, { mode: "timestamp_ms" });
const now = () => new Date();

/**
 * Une chambre de l'hôtel. Le jeton (token) est encodé dans le QR code :
 * il est imprévisible, pour qu'on ne puisse pas envoyer de demande au nom
 * d'une autre chambre en devinant l'URL.
 */
export const rooms = sqliteTable("rooms", {
  id: text("id").primaryKey().$defaultFn(createId),
  number: text("number").notNull().unique(),
  token: text("token").notNull().unique(),
  /** "room" (chambre) ou "desk" (QR code posé à la réception : prévenir quand personne n'est au comptoir). */
  kind: text("kind").notNull().default("room"),
  createdAt: ts("created_at").notNull().$defaultFn(now),
});

/**
 * Un séjour : créé au check-in par la réception, fermé au check-out.
 * Une chambre a au plus un séjour en cours (checkedOutAt vide).
 */
export const stays = sqliteTable(
  "stays",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    breakfastIncluded: integer("breakfast_included", { mode: "boolean" }).notNull().default(false),
    /** Canal de réservation saisi au check-in : "direct" (site officiel), "booking", "expedia", "airbnb", "phone", "other" ou "". */
    source: text("source").notNull().default(""),
    checkedInAt: ts("checked_in_at").notNull().$defaultFn(now),
    checkedOutAt: ts("checked_out_at"),
  },
  (t) => [index("stays_room_idx").on(t.roomId, t.checkedOutAt)],
);

export const REQUEST_STATUSES = ["NEW", "IN_PROGRESS", "DONE", "CANCELLED"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/** Détails propres à certains types de demande. */
export type RequestDetails =
  | { kind: "lateCheckout"; time: string; price: number }
  | { kind: "minibar"; items: { productId: string; name: string; price: number; qty: number }[]; total: number };

export const requests = sqliteTable(
  "requests",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    message: text("message"),
    details: text("details", { mode: "json" }).$type<RequestDetails>(),
    lang: text("lang").notNull(),
    status: text("status", { enum: REQUEST_STATUSES }).notNull().default("NEW"),
    createdAt: ts("created_at").notNull().$defaultFn(now),
    updatedAt: ts("updated_at").notNull().$defaultFn(now).$onUpdate(now),
    doneAt: ts("done_at"),
  },
  (t) => [
    index("requests_status_created_idx").on(t.status, t.createdAt),
    index("requests_room_created_idx").on(t.roomId, t.createdAt),
  ],
);

/**
 * Produits du minibar (gérés par la réception). Prix en centimes.
 * La contrainte « stock >= 0 » fait échouer une commande qui viderait le stock
 * en dessous de zéro, même si deux clients commandent au même instant.
 */
export const products = sqliteTable(
  "products",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    name: text("name").notNull(),
    nameEn: text("name_en"),
    price: integer("price").notNull(),
    stock: integer("stock").notNull().default(0),
    /** Stock illimité (ex. café, thé) : jamais épuisé, jamais décompté. */
    unlimited: integer("unlimited", { mode: "boolean" }).notNull().default(false),
    /** Seuil d'alerte côté réception (Relais) : stock <= seuil → à réapprovisionner. 0 = pas d'alerte. */
    alertAt: integer("alert_at").notNull().default(0),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: ts("created_at").notNull().$defaultFn(now),
  },
  (t) => [check("products_stock_non_negative", sql`${t.stock} >= 0`)],
);

export { FEEDBACK_TAGS, type FeedbackTag } from "@/config/feedback";

/**
 * Avis du client pendant son séjour (un seul par séjour, modifiable).
 * L'e-mail est facultatif ; les deux usages ont chacun leur consentement :
 * envoi de la facture / du reçu, et offres de l'hôtel (case jamais pré-cochée).
 */
export const feedback = sqliteTable(
  "feedback",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    stayId: text("stay_id")
      .notNull()
      .unique()
      .references(() => stays.id, { onDelete: "cascade" }),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    rating: integer("rating"),
    liked: text("liked", { mode: "json" }).notNull().$type<FeedbackTag[]>().default([]),
    disliked: text("disliked", { mode: "json" }).notNull().$type<FeedbackTag[]>().default([]),
    comment: text("comment"),
    email: text("email"),
    wantsReceipt: integer("wants_receipt", { mode: "boolean" }).notNull().default(false),
    marketing: integer("marketing", { mode: "boolean" }).notNull().default(false),
    /** Date du consentement aux offres (preuve RGPD), vide si refusé. */
    marketingAt: ts("marketing_at"),
    lang: text("lang").notNull(),
    createdAt: ts("created_at").notNull().$defaultFn(now),
    updatedAt: ts("updated_at").notNull().$defaultFn(now).$onUpdate(now),
  },
  (t) => [index("feedback_created_idx").on(t.createdAt), check("feedback_rating_range", sql`${t.rating} IS NULL OR (${t.rating} BETWEEN 1 AND 5)`)],
);

/**
 * Téléphones de la réception abonnés aux notifications (Web Push), enregistrés
 * depuis Relais. Notifications sans contenu : le téléphone va chercher le détail
 * dans Relais, derrière la connexion de l'équipe.
 */
export const pushSubscriptions = sqliteTable("push_subscriptions", {
  endpoint: text("endpoint").primaryKey(),
  staff: text("staff").notNull(),
  createdAt: ts("created_at").notNull().$defaultFn(now),
});

/** Réglages de l'hôtel modifiables à la réception (une seule ligne, id = "hotel"). */
export const settings = sqliteTable("settings", {
  id: text("id").primaryKey(),
  data: text("data", { mode: "json" }).notNull().$type<Record<string, unknown>>(),
  updatedAt: ts("updated_at").notNull().$defaultFn(now),
});

export type Room = typeof rooms.$inferSelect;
export type Stay = typeof stays.$inferSelect;
export type Product = typeof products.$inferSelect;
export type GuestRequest = typeof requests.$inferSelect;
export type Feedback = typeof feedback.$inferSelect;
