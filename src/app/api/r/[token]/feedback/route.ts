import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, feedback, FEEDBACK_TAGS, type FeedbackTag } from "@/db";
import { currentStay, findRoomByToken } from "@/lib/rooms";
import { isLocale } from "@/i18n";

type Ctx = { params: Promise<{ token: string }> };
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

const MAX_COMMENT = 1000;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;

const tags = (v: unknown): FeedbackTag[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is FeedbackTag => (FEEDBACK_TAGS as readonly string[]).includes(x)))] : [];

const view = (f: typeof feedback.$inferSelect | undefined) =>
  f
    ? { rating: f.rating, liked: f.liked, disliked: f.disliked, comment: f.comment ?? "", email: f.email ?? "", wantsReceipt: f.wantsReceipt, marketing: f.marketing }
    : null;

/** Avis du séjour en cours (pour le modifier) et canal de réservation (pour l'invitation à laisser un avis public). */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const room = await findRoomByToken((await params).token);
  if (!room) return bad("room_not_found", 404);
  const stay = await currentStay(room.id);
  if (!stay) return bad("not_checked_in", 403);
  const [row] = await db.select().from(feedback).where(eq(feedback.stayId, stay.id)).limit(1);
  return NextResponse.json({ feedback: view(row), source: stay.source }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * Le client enregistre (ou modifie) son avis : note, points forts et à améliorer,
 * commentaire, e-mail facultatif et consentements. Un seul avis par séjour.
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const room = await findRoomByToken((await params).token);
  if (!room) return bad("room_not_found", 404);
  const stay = await currentStay(room.id);
  if (!stay) return bad("not_checked_in", 403);

  const body = await req.json().catch(() => null);
  const rating = body?.rating === null || body?.rating === undefined ? null : Number(body.rating);
  if (rating !== null && !(Number.isInteger(rating) && rating >= 1 && rating <= 5)) return bad("invalid_rating");
  const liked = tags(body?.liked);
  const disliked = tags(body?.disliked);
  const comment = typeof body?.comment === "string" ? body.comment.trim().slice(0, MAX_COMMENT) : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (email && (email.length > 254 || !EMAIL.test(email))) return bad("invalid_email");
  // Sans e-mail, aucun usage n'est possible : les consentements sont ignorés.
  const wantsReceipt = !!email && body?.wantsReceipt === true;
  const marketing = !!email && body?.marketing === true;
  const lang = isLocale(body?.lang) ? body.lang : "en";
  if (rating === null && !liked.length && !disliked.length && !comment && !email) return bad("empty");

  const [prev] = await db.select({ marketing: feedback.marketing, marketingAt: feedback.marketingAt }).from(feedback).where(eq(feedback.stayId, stay.id)).limit(1);
  const marketingAt = marketing ? (prev?.marketing && prev.marketingAt ? prev.marketingAt : new Date()) : null;
  const values = { rating, liked, disliked, comment: comment || null, email: email || null, wantsReceipt, marketing, marketingAt, lang };

  const [saved] = await db
    .insert(feedback)
    .values({ stayId: stay.id, roomId: room.id, ...values })
    .onConflictDoUpdate({ target: feedback.stayId, set: { ...values, updatedAt: new Date() } })
    .returning();
  return NextResponse.json({ feedback: view(saved), source: stay.source }, { status: prev ? 200 : 201 });
}
