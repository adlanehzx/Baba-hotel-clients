import { boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createId } from "@/lib/id";

const ts = (name: string) => timestamp(name, { withTimezone: true });

/**
 * Une chambre de l'hôtel. Le jeton (token) est encodé dans le QR code :
 * il est imprévisible, pour qu'on ne puisse pas envoyer de demande au nom
 * d'une autre chambre en devinant l'URL.
 */
export const rooms = pgTable("rooms", {
  id: text("id").primaryKey().$defaultFn(createId),
  number: text("number").notNull().unique(),
  token: text("token").notNull().unique(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

/**
 * Un séjour : créé au check-in par la réception, fermé au check-out.
 * Une chambre a au plus un séjour en cours (checkedOutAt vide).
 */
export const stays = pgTable(
  "stays",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    breakfastIncluded: boolean("breakfast_included").notNull().default(false),
    checkedInAt: ts("checked_in_at").notNull().defaultNow(),
    checkedOutAt: ts("checked_out_at"),
  },
  (t) => [index("stays_room_idx").on(t.roomId, t.checkedOutAt)],
);

export const requestStatus = pgEnum("request_status", ["NEW", "IN_PROGRESS", "DONE", "CANCELLED"]);

/** Détails propres à certains types de demande. */
export type RequestDetails =
  | { kind: "lateCheckout"; time: string; price: number }
  | { kind: "minibar"; items: { productId: string; name: string; price: number; qty: number }[]; total: number };

export const requests = pgTable(
  "requests",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    message: text("message"),
    details: jsonb("details").$type<RequestDetails>(),
    lang: text("lang").notNull(),
    status: requestStatus("status").notNull().default("NEW"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    doneAt: ts("done_at"),
  },
  (t) => [
    index("requests_status_created_idx").on(t.status, t.createdAt),
    index("requests_room_created_idx").on(t.roomId, t.createdAt),
  ],
);

/** Produits du minibar (gérés par la réception). Prix en centimes. */
export const products = pgTable("products", {
  id: text("id").primaryKey().$defaultFn(createId),
  name: text("name").notNull(),
  nameEn: text("name_en"),
  price: integer("price").notNull(),
  stock: integer("stock").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: ts("created_at").notNull().defaultNow(),
});

/** Réglages de l'hôtel modifiables à la réception (une seule ligne, id = "hotel"). */
export const settings = pgTable("settings", {
  id: text("id").primaryKey(),
  data: jsonb("data").notNull().$type<Record<string, unknown>>(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export type Room = typeof rooms.$inferSelect;
export type Stay = typeof stays.$inferSelect;
export type Product = typeof products.$inferSelect;
export type GuestRequest = typeof requests.$inferSelect;
export type RequestStatus = (typeof requestStatus.enumValues)[number];
