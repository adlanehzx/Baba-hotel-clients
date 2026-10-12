import "server-only";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import {
  db,
  orders,
  products,
  requests,
  type OrderDetails,
  type OrderKind,
  type RequestDetails,
} from "@/db";
import { getSettings } from "@/lib/settings";
import { CURRENCY, HOTEL_TZ } from "@/config/hotel";
import { lateCheckoutOptions, linkLifeSeconds } from "@/lib/time";
import { notifyReceptionLater } from "@/lib/push";
import {
  createPaymentLink,
  disablePaymentLink,
  paytweakConfigured,
  reportByOrderId,
} from "@/lib/paytweak";

/** Durée de vie maximale d'un lien, même loin de l'heure limite : 30 minutes. */
const MAX_LINK_MINUTES = 30;
const MAX_PEOPLE = 20;
const MAX_QTY_PER_ITEM = 10;

export const ORDER_ERRORS = [
  "not_configured",
  "invalid",
  "window_closed",
  "empty",
  "out_of_stock",
  "link_failed",
] as const;
export type OrderErrorCode = (typeof ORDER_ERRORS)[number];

export class OrderError extends Error {
  constructor(readonly code: OrderErrorCode) {
    super(code);
    this.name = "OrderError";
  }
}

export type NewOrderInput =
  | { kind: "minibar"; items: { productId: string; qty: number }[] }
  | { kind: "breakfast"; people: number }
  | { kind: "lateCheckout"; time: string };

export type CreatedOrder = {
  orderId: string;
  payUrl: string;
  amount: number;
  currency: string;
  expiresAt: string;
};

/** Montant (centimes), détails et durée de vie du lien, calculés côté serveur. */
async function priceOrder(
  input: NewOrderInput,
): Promise<{ amount: number; details: OrderDetails; lifeSeconds: number; label: string }> {
  const s = await getSettings();

  if (input.kind === "breakfast") {
    const people = Number(input.people);
    if (!Number.isInteger(people) || people < 1 || people > MAX_PEOPLE) throw new OrderError("invalid");
    const life = linkLifeSeconds(s.breakfastOrderUntil, HOTEL_TZ, MAX_LINK_MINUTES);
    if (life <= 0) throw new OrderError("window_closed");
    return {
      amount: people * s.breakfastPrice,
      details: { kind: "breakfast", people, unitPrice: s.breakfastPrice },
      lifeSeconds: life,
      label: `Petit-déjeuner × ${people}`,
    };
  }

  if (input.kind === "lateCheckout") {
    const life = linkLifeSeconds(s.lateCheckoutOrderUntil, HOTEL_TZ, MAX_LINK_MINUTES);
    if (life <= 0) throw new OrderError("window_closed");
    const option = lateCheckoutOptions(s.checkOut, s.lateCheckoutMax, s.lateCheckoutHourly).find(
      (o) => o.time === input.time,
    );
    if (!option) throw new OrderError("invalid");
    return {
      amount: option.price,
      details: { kind: "lateCheckout", time: option.time },
      lifeSeconds: life,
      label: `Départ tardif ${option.time}`,
    };
  }

  // minibar : regrouper les quantités demandées
  const wanted = new Map<string, number>();
  for (const it of Array.isArray(input.items) ? input.items : []) {
    const qty = Number(it?.qty);
    if (typeof it?.productId === "string" && Number.isInteger(qty) && qty > 0 && qty <= MAX_QTY_PER_ITEM) {
      wanted.set(it.productId, (wanted.get(it.productId) ?? 0) + qty);
    }
  }
  if (!wanted.size) throw new OrderError("empty");

  const found = await db
    .select({ id: products.id, name: products.name, price: products.price, stock: products.stock, unlimited: products.unlimited })
    .from(products)
    .where(and(inArray(products.id, [...wanted.keys()]), eq(products.active, true)));
  const byId = new Map(found.map((p) => [p.id, p]));
  const items: Extract<OrderDetails, { kind: "minibar" }>["items"] = [];
  for (const [productId, qty] of wanted) {
    const p = byId.get(productId);
    if (!p || (!p.unlimited && p.stock < qty)) throw new OrderError("out_of_stock");
    items.push({ productId, name: p.name, price: p.price, qty });
  }
  const amount = items.reduce((sum, i) => sum + i.price * i.qty, 0);
  const label = items.map((i) => `${i.qty}×${i.name}`).join(", ").slice(0, 120);
  return { amount, details: { kind: "minibar", items }, lifeSeconds: MAX_LINK_MINUTES * 60, label };
}

/**
 * Crée une commande payable : réserve le stock (minibar), enregistre la commande
 * en attente de paiement, génère le lien Paytweak et renvoie l'URL de paiement.
 * Le stock réservé est rendu si le lien expire sans paiement (voir sweepExpired).
 */
export async function createOrder(args: {
  roomId: string;
  input: NewOrderInput;
  lang: string;
  email?: string;
}): Promise<CreatedOrder> {
  if (!paytweakConfigured()) throw new OrderError("not_configured");

  const { amount, details, lifeSeconds, label } = await priceOrder(args.input);
  if (amount <= 0) throw new OrderError("invalid");

  const kind: OrderKind = args.input.kind;
  const expiresAt = new Date(Date.now() + lifeSeconds * 1000);

  // 1) Réserver le stock (minibar) + insérer la commande en attente, en un seul
  //    lot atomique : si le dernier article vient de partir, la contrainte
  //    « stock >= 0 » annule tout et on renvoie out_of_stock.
  //    Les produits illimités (café, thé) ne sont pas décomptés.
  let orderId: string;
  try {
    const stockStatements =
      details.kind === "minibar"
        ? details.items.map((i) =>
            db
              .update(products)
              .set({ stock: sql`${products.stock} - ${i.qty}` })
              .where(and(eq(products.id, i.productId), eq(products.unlimited, false))),
          )
        : [];
    const insert = db
      .insert(orders)
      .values({ roomId: args.roomId, kind, details, amount, currency: CURRENCY, expiresAt })
      .returning({ id: orders.id });
    const statements = [...stockStatements, insert];
    const results = await db.batch(statements as unknown as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
    orderId = (results[results.length - 1] as { id: string }[])[0].id;
  } catch (e) {
    if (String((e as Error)?.message ?? e).includes("CHECK constraint")) throw new OrderError("out_of_stock");
    throw e;
  }

  // 2) Créer le lien de paiement Paytweak.
  try {
    const link = await createPaymentLink({
      orderId,
      amountCents: amount,
      currency: CURRENCY,
      lifeSeconds,
      lang: args.lang,
      email: args.email,
      label,
    });
    await db.update(orders).set({ linkId: link.linkId || null, payUrl: link.url }).where(eq(orders.id, orderId));
    return { orderId, payUrl: link.url, amount, currency: CURRENCY, expiresAt: expiresAt.toISOString() };
  } catch (e) {
    // Échec de création du lien : on annule la commande et on rend le stock.
    await cancelAndRestore(orderId).catch(() => {});
    throw e instanceof OrderError ? e : new OrderError("link_failed");
  }
}

/** Annule une commande en attente et rend le stock réservé (minibar). */
async function cancelAndRestore(orderId: string, status: "CANCELLED" | "EXPIRED" = "CANCELLED") {
  const [o] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!o || o.status !== "PENDING_PAYMENT") return;
  const statements: BatchItem<"sqlite">[] = [];
  if (o.details.kind === "minibar") {
    for (const i of o.details.items) {
      statements.push(
        db
          .update(products)
          .set({ stock: sql`${products.stock} + ${i.qty}` })
          .where(and(eq(products.id, i.productId), eq(products.unlimited, false))) as unknown as BatchItem<"sqlite">,
      );
    }
  }
  statements.push(
    db.update(orders).set({ status }).where(and(eq(orders.id, orderId), eq(orders.status, "PENDING_PAYMENT"))) as unknown as BatchItem<"sqlite">,
  );
  await db.batch(statements as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
}

/**
 * Passe en EXPIRED les commandes en attente dont le lien a expiré, rend le stock
 * et désactive le lien côté Paytweak (ceinture + bretelles : le lien a déjà une
 * durée de vie Paytweak). Appelé paresseusement à chaque passage du client.
 */
export async function sweepExpired(roomId?: string): Promise<void> {
  const now = new Date();
  const where = roomId
    ? and(eq(orders.status, "PENDING_PAYMENT"), lt(orders.expiresAt, now), eq(orders.roomId, roomId))
    : and(eq(orders.status, "PENDING_PAYMENT"), lt(orders.expiresAt, now));
  const expired = await db.select().from(orders).where(where).limit(25);
  for (const o of expired) {
    await cancelAndRestore(o.id, "EXPIRED").catch(() => {});
    if (o.linkId) await disablePaymentLink(o.linkId).catch(() => {});
  }
}

/**
 * Confirme le paiement d'une commande : REVÉRIFIE auprès de Paytweak (reporting)
 * — statut payé (9) ET montant exactement égal au montant calculé côté serveur —
 * puis matérialise la demande à la réception. Idempotent : une commande déjà
 * payée n'est pas retraitée (anti-rejeu).
 *
 * @returns true si la commande vient d'être confirmée (ou l'était déjà), false sinon.
 */
export async function confirmPayment(orderId: string): Promise<boolean> {
  const [o] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!o) return false;
  if (o.status === "PAID") return true; // déjà traité
  if (o.status !== "PENDING_PAYMENT") return false; // expirée / annulée : on ne ressuscite pas

  // Source de vérité : le reporting Paytweak, pas le contenu du webhook.
  const report = await reportByOrderId(orderId);
  if (!report.paid) return false;
  // Montant : si Paytweak renvoie un montant exploitable, il doit correspondre au centime près.
  if (report.amountCents !== null && report.amountCents !== o.amount) return false;

  const paidDetails: RequestDetails =
    o.details.kind === "minibar"
      ? { kind: "minibar", items: o.details.items, total: o.amount, paid: true }
      : o.details.kind === "breakfast"
        ? { kind: "breakfast", people: o.details.people, unitPrice: o.details.unitPrice, total: o.amount, paid: true }
        : { kind: "lateCheckout", time: o.details.time, price: o.amount, paid: true };

  // Matérialiser la demande + marquer la commande payée, en un lot atomique.
  const insertReq = db
    .insert(requests)
    .values({ roomId: o.roomId, category: o.kind, message: null, lang: "fr", details: paidDetails, status: "NEW" })
    .returning({ id: requests.id });
  const [reqRows, updRows] = (await db.batch([
    insertReq,
    db
      .update(orders)
      .set({ status: "PAID", paidAt: new Date() })
      .where(and(eq(orders.id, orderId), eq(orders.status, "PENDING_PAYMENT")))
      .returning({ id: orders.id }),
  ] as unknown as [BatchItem<"sqlite">, BatchItem<"sqlite">])) as [{ id: string }[], { id: string }[]];

  // Course gagnée par un autre appel concurrent : il a déjà tout fait.
  if (!updRows.length) return true;

  const requestId = reqRows[0]?.id;
  if (requestId) await db.update(orders).set({ requestId }).where(eq(orders.id, orderId));
  notifyReceptionLater();
  return true;
}

/**
 * Revérifie auprès de Paytweak les commandes encore en attente parmi celles que
 * le client suit, et les confirme si elles sont payées. Filet de sécurité qui
 * rend la validation indépendante du webhook : même si le webhook n'arrive pas,
 * la commande passe dès que le client rouvre sa page. Borné aux commandes de sa
 * chambre (≤ 20), et sans effet si le paiement en ligne n'est pas configuré.
 */
export async function reconcilePending(roomId: string, ids: string[]): Promise<void> {
  if (!ids.length || !paytweakConfigured()) return;
  const pending = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.roomId, roomId), eq(orders.status, "PENDING_PAYMENT"), inArray(orders.id, ids.slice(0, 20))));
  for (const o of pending) await confirmPayment(o.id).catch(() => {});
}

export type OrderView = { id: string; kind: OrderKind; status: string; amount: number; payUrl: string | null };

/** État des commandes suivies par le client (identifiants gardés sur son téléphone). */
export async function orderViews(roomId: string, ids: string[]): Promise<OrderView[]> {
  if (!ids.length) return [];
  const rows = await db
    .select({ id: orders.id, kind: orders.kind, status: orders.status, amount: orders.amount, payUrl: orders.payUrl })
    .from(orders)
    .where(and(eq(orders.roomId, roomId), inArray(orders.id, ids.slice(0, 20))));
  return rows;
}
