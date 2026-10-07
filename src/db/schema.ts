import { index, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createId } from "@/lib/id";

/**
 * Une chambre de l'hôtel. Le jeton (token) est encodé dans le QR code :
 * il est imprévisible, pour qu'on ne puisse pas envoyer de demande au nom
 * d'une autre chambre en devinant l'URL.
 */
export const rooms = pgTable("rooms", {
  id: text("id").primaryKey().$defaultFn(createId),
  number: text("number").notNull().unique(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const requestStatus = pgEnum("request_status", ["NEW", "IN_PROGRESS", "DONE"]);

export const requests = pgTable(
  "requests",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    message: text("message"),
    lang: text("lang").notNull(),
    status: requestStatus("status").notNull().default("NEW"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    doneAt: timestamp("done_at", { withTimezone: true }),
  },
  (t) => [
    index("requests_status_created_idx").on(t.status, t.createdAt),
    index("requests_room_created_idx").on(t.roomId, t.createdAt),
  ],
);

export type Room = typeof rooms.$inferSelect;
export type GuestRequest = typeof requests.$inferSelect;
export type RequestStatus = (typeof requestStatus.enumValues)[number];
