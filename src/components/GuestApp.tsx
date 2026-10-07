"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MESSAGES, LOCALES, fill, isLocale, type Locale, type Messages } from "@/i18n";
import { CATEGORIES, MAX_MESSAGE_LENGTH, MAX_QTY_PER_ITEM, MESSAGE_REQUIRED, type Category } from "@/config/requests";
import type { HotelSettings } from "@/config/hotel";
import type { RequestDetails } from "@/db/schema";
import { formatPrice, lateCheckoutOptions } from "@/lib/time";
import styles from "./guest.module.css";

type Product = { id: string; name: string; nameEn: string | null; price: number; stock: number };
type Props = {
  token: string;
  room: string;
  initialLocale: Locale;
  settings: HotelSettings;
  metro: string;
  breakfastIncluded: boolean;
  products: Product[];
};

type Status = "NEW" | "IN_PROGRESS" | "DONE" | "CANCELLED";
type Tracked = { id: string; category: Category; status: Status; createdAt: string; details: RequestDetails | null };

const LANG_KEY = "baba:lang";
const reqKey = (token: string) => `baba:requests:${token}`;
const KEEP_MS = 24 * 3600_000; // on oublie les demandes de plus de 24 h
const POLL_MS = 8000;

/* Le stockage local peut être indisponible (navigation privée) : on ne plante jamais. */
function readStore<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeStore(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

const ICONS: Record<(typeof CATEGORIES)[number], string> = {
  towels: "M4 6h16v3H4zM6 9v9h12V9M9 12h6",
  toiletries: "M9 3h6v3H9zM8 6h8l1 4v9a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-9z",
  cleaning: "M14 3l-4 9M7 12h10l2 9H5z",
  problem: "M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z",
  lateCheckout: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
  taxi: "M5 16V11l2-5h10l2 5v5M3 16h18v3H3zM7 19v2M17 19v2M5 11h14",
  other: "M4 5h16v11H8l-4 4z",
};

function Icon({ d, size = 22 }: { d: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/** Étapes affichées au client, selon le type de demande. */
function stepsFor(category: Category, t: Messages): { status: Status; label: string }[] {
  if (category === "minibar")
    return [
      { status: "NEW", label: t.ui.mb_NEW },
      { status: "IN_PROGRESS", label: t.ui.mb_IN_PROGRESS },
      { status: "DONE", label: t.ui.mb_DONE },
    ];
  if (category === "lateCheckout")
    return [
      { status: "NEW", label: t.ui.status_NEW },
      { status: "DONE", label: t.ui.late_DONE },
    ];
  return [
    { status: "NEW", label: t.ui.status_NEW },
    { status: "IN_PROGRESS", label: t.ui.status_IN_PROGRESS },
    { status: "DONE", label: t.ui.status_DONE },
  ];
}

export default function GuestApp({ token, room, initialLocale, settings, metro, breakfastIncluded, products }: Props) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const t = MESSAGES[locale];
  const price = useCallback((cents: number) => formatPrice(cents, locale), [locale]);

  const vars = useMemo(
    () => ({
      room,
      metro,
      phone: settings.phone,
      address: settings.address,
      checkIn: settings.checkIn,
      checkOut: settings.checkOut,
      breakfastStart: settings.breakfastStart,
      breakfastEnd: settings.breakfastEnd,
      breakfastPrice: price(settings.breakfastPrice),
      lateMax: settings.lateCheckoutMax,
      latePrice: price(settings.lateCheckoutHourly),
    }),
    [room, metro, settings, price],
  );
  const f = useCallback((s: string) => fill(s, vars), [vars]);
  const lateOptions = useMemo(
    () => lateCheckoutOptions(settings.checkOut, settings.lateCheckoutMax, settings.lateCheckoutHourly),
    [settings],
  );

  // Langue mémorisée sur le téléphone du client. Lue après le premier rendu
  // (le serveur ne connaît pas le localStorage), d'où le setState dans l'effet.
  useEffect(() => {
    const saved = readStore<string | null>(LANG_KEY, null);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isLocale(saved)) setLocale(saved);
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = t.dir;
  }, [locale, t.dir]);
  const changeLocale = (l: Locale) => {
    setLocale(l);
    writeStore(LANG_KEY, l);
  };

  /* ---------- Suivi des demandes ---------- */
  const [tracked, setTracked] = useState<Tracked[]>([]);
  const trackedRef = useRef(tracked);
  useEffect(() => {
    trackedRef.current = tracked;
  }, [tracked]);

  const remember = (next: Tracked[]) => {
    trackedRef.current = next;
    setTracked(next);
    writeStore(reqKey(token), next);
  };

  const refresh = useCallback(async () => {
    const list = trackedRef.current;
    if (!list.length) return;
    try {
      const res = await fetch(`/api/r/${token}/requests?ids=${list.map((r) => r.id).join(",")}`, { cache: "no-store" });
      if (!res.ok) return;
      const rows: Tracked[] = await res.json();
      const byId = new Map(rows.map((r) => [r.id, r]));
      const next = list.filter((r) => byId.has(r.id)).map((r) => ({ ...r, status: byId.get(r.id)!.status }));
      trackedRef.current = next;
      setTracked(next);
      writeStore(reqKey(token), next);
    } catch {}
  }, [token]);

  useEffect(() => {
    const saved = readStore<Tracked[]>(reqKey(token), []).filter((r) => Date.now() - Date.parse(r.createdAt) < KEEP_MS);
    // Même raison : les demandes suivies sont gardées sur le téléphone
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTracked(saved);
  }, [token]);

  const hasOpen = tracked.some((r) => r.status === "NEW" || r.status === "IN_PROGRESS");
  useEffect(() => {
    if (!hasOpen) return;
    refresh();
    const id = setInterval(() => document.visibilityState === "visible" && refresh(), POLL_MS);
    const onVis = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [hasOpen, refresh]);

  const post = async (body: Record<string, unknown>) => {
    const res = await fetch(`/api/r/${token}/requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, lang: locale }),
    });
    if (!res.ok) return { ok: false as const, status: res.status };
    const created: Tracked = await res.json();
    remember([created, ...trackedRef.current]);
    return { ok: true as const };
  };

  /* ---------- Formulaire de demande ---------- */
  const [category, setCategory] = useState<(typeof CATEGORIES)[number] | null>(null);
  const [message, setMessage] = useState("");
  const [lateTime, setLateTime] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error" | "rate">("idle");
  const [fieldError, setFieldError] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const needsMessage = category ? MESSAGE_REQUIRED.includes(category) : false;

  const pick = (c: (typeof CATEGORIES)[number]) => {
    setCategory(c);
    setState("idle");
    setFieldError(false);
    if (c === "lateCheckout" && !lateTime) setLateTime(lateOptions[0]?.time ?? null);
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      if (MESSAGE_REQUIRED.includes(c)) textRef.current?.focus({ preventScroll: true });
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!category) return;
    if (needsMessage && message.trim().length < 2) {
      setFieldError(true);
      textRef.current?.focus();
      return;
    }
    setState("sending");
    try {
      const r = await post({ category, message, time: category === "lateCheckout" ? lateTime : undefined });
      if (!r.ok) return setState(r.status === 429 ? "rate" : "error");
      setState("sent");
      setMessage("");
      setCategory(null);
    } catch {
      setState("error");
    }
  };

  /* ---------- Minibar ---------- */
  const [stock, setStock] = useState(() => new Map(products.map((p) => [p.id, p.stock])));
  const [cart, setCart] = useState<Record<string, number>>({});
  const [mbState, setMbState] = useState<"idle" | "sending" | "sent" | "error" | "stock" | "rate">("idle");
  const productName = (p: Product) => (locale !== "fr" && p.nameEn ? p.nameEn : p.name);
  const cartTotal = products.reduce((sum, p) => sum + (cart[p.id] ?? 0) * p.price, 0);
  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);

  const setQty = (p: Product, qty: number) => {
    const max = Math.min(stock.get(p.id) ?? 0, MAX_QTY_PER_ITEM);
    setCart((c) => ({ ...c, [p.id]: Math.max(0, Math.min(qty, max)) }));
    if (mbState !== "sending") setMbState("idle");
  };

  const order = async () => {
    const items = Object.entries(cart).filter(([, q]) => q > 0).map(([productId, qty]) => ({ productId, qty }));
    if (!items.length) return;
    setMbState("sending");
    try {
      const r = await post({ category: "minibar", items });
      if (!r.ok) return setMbState(r.status === 409 ? "stock" : r.status === 429 ? "rate" : "error");
      setStock((s) => {
        const next = new Map(s);
        items.forEach((i) => next.set(i.productId, (next.get(i.productId) ?? 0) - i.qty));
        return next;
      });
      setCart({});
      setMbState("sent");
    } catch {
      setMbState("error");
    }
  };

  const faqEntries = Object.entries(t.faq) as [keyof Messages["faq"], { q: string; a: string; aIncluded?: string }][];

  const detailLine = (r: Tracked) => {
    if (r.details?.kind === "lateCheckout") return `${r.details.time} · ${price(r.details.price)}`;
    if (r.details?.kind === "minibar") {
      const names = new Map(products.map((p) => [p.id, productName(p)]));
      return (
        r.details.items.map((i) => `${i.qty} × ${names.get(i.productId) ?? i.name}`).join(", ") + ` · ${price(r.details.total)}`
      );
    }
    return null;
  };

  return (
    <div className={styles.page} lang={locale} dir={t.dir}>
      {/* ---------- En-tête : la porte de la chambre ---------- */}
      <header className={styles.head}>
        <div className={styles.topbar}>
          <span className={`${styles.brand} serif`}>Baba <em>Hotel</em></span>
          <label className={styles.lang}>
            <span className={styles.srOnly}>{t.ui.language}</span>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18" />
            </svg>
            <select value={locale} onChange={(e) => changeLocale(e.target.value as Locale)}>
              {LOCALES.map((l) => (
                <option key={l} value={l} lang={l}>{MESSAGES[l].name}</option>
              ))}
            </select>
          </label>
        </div>
        <RoomDoor template={t.ui.room} room={room} />
        <h1 className={`${styles.hello} serif`}>{t.ui.hello}</h1>
        <p className={styles.intro}>{t.ui.intro}</p>
      </header>

      <main className={styles.main}>
        {/* ---------- Suivi ---------- */}
        {tracked.length > 0 && (
          <section className={styles.tracking} aria-live="polite">
            <h2 className={styles.h2}>{t.ui.yourRequests}</h2>
            <ul className={styles.trackList}>
              {tracked.map((r) => {
                const steps = stepsFor(r.category, t);
                const reachedIdx = steps.findIndex((s) => s.status === r.status);
                const detail = detailLine(r);
                return (
                  <li key={r.id} className={styles.trackItem} data-status={r.status}>
                    <div className={styles.trackTop}>
                      <span className={styles.trackName}>{t.categories[r.category] ?? r.category}</span>
                      <time className={styles.trackTime} dateTime={r.createdAt}>
                        {new Date(r.createdAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
                      </time>
                    </div>
                    {detail && <p className={styles.trackDetail}>{detail}</p>}
                    {r.status === "CANCELLED" ? (
                      <p className={styles.cancelled}>{r.category === "lateCheckout" ? t.ui.late_CANCELLED : t.ui.status_CANCELLED}</p>
                    ) : (
                      <ol className={styles.steps} style={{ gridTemplateColumns: `repeat(${steps.length}, 1fr)` }}>
                        {steps.map((s, i) => (
                          <li key={s.status} className={i <= reachedIdx ? styles.stepOn : styles.step} aria-current={r.status === s.status ? "step" : undefined}>
                            {s.label}
                          </li>
                        ))}
                      </ol>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* ---------- Horaires ---------- */}
        <section aria-labelledby="hours-t">
          <h2 id="hours-t" className={styles.h2}>{t.ui.hoursTitle}</h2>
          <dl className={styles.hours}>
            <div>
              <dt>{t.ui.checkInLabel}</dt>
              <dd>{settings.checkIn}</dd>
            </div>
            <div>
              <dt>{t.ui.checkOutLabel}</dt>
              <dd>{settings.checkOut}</dd>
            </div>
            <div className={styles.hoursWide}>
              <dt>{t.ui.breakfastLabel}</dt>
              <dd>
                {settings.breakfastStart} – {settings.breakfastEnd}
                <small data-included={breakfastIncluded || undefined}>
                  {breakfastIncluded ? t.ui.breakfastIncluded : fill(t.ui.perPerson, { price: price(settings.breakfastPrice) })}
                </small>
              </dd>
            </div>
            <div className={styles.hoursWide}>
              <dt>{t.ui.receptionLabel}</dt>
              <dd>{t.ui.allDay}</dd>
            </div>
          </dl>
        </section>

        {/* ---------- FAQ ---------- */}
        <section aria-labelledby="faq-t">
          <h2 id="faq-t" className={styles.h2}>{t.ui.faqTitle}</h2>
          <div className={styles.faq}>
            {faqEntries.map(([id, item]) => (
              <details key={id} className={styles.qa} name="faq">
                <summary className={styles.q}>
                  <span>{item.q}</span>
                  <span className={styles.plus} aria-hidden="true" />
                </summary>
                <div className={styles.a}>
                  <p>{f(id === "breakfast" && breakfastIncluded && item.aIncluded ? item.aIncluded : item.a)}</p>
                  {id === "wifi" && <WifiCard t={t} name={settings.wifiName} password={settings.wifiPassword} />}
                </div>
              </details>
            ))}
          </div>
        </section>

        {/* ---------- Demande ---------- */}
        <section aria-labelledby="ask-t" className={styles.ask}>
          <h2 id="ask-t" className={`${styles.askTitle} serif`}>{t.ui.askTitle}</h2>
          <p className={styles.askIntro}>{t.ui.askIntro}</p>

          {state === "sent" && <Sent title={t.ui.sentTitle} text={t.ui.sentText} />}

          <div className={styles.cats} role="radiogroup" aria-labelledby="ask-t">
            {CATEGORIES.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={category === c} className={styles.cat} onClick={() => pick(c)}>
                <Icon d={ICONS[c]} />
                <span>{t.categories[c]}</span>
              </button>
            ))}
          </div>

          <form ref={formRef} className={styles.form} data-open={category ? "" : undefined} onSubmit={submit} noValidate>
            <div className={styles.formInner}>
              {category === "lateCheckout" && lateOptions.length > 0 && (
                <fieldset className={styles.late}>
                  <legend className={styles.label}>{t.ui.lateQuestion}</legend>
                  <div className={styles.lateGrid}>
                    {lateOptions.map((o) => (
                      <label key={o.time} className={styles.lateOpt}>
                        <input type="radio" name="late" value={o.time} checked={lateTime === o.time} onChange={() => setLateTime(o.time)} />
                        <span className={styles.lateTime}>{o.time}</span>
                        <span className={styles.latePrice}>+{price(o.price)}</span>
                      </label>
                    ))}
                  </div>
                  <p className={styles.note}>
                    {fill(t.ui.lateNote, { price: price(settings.lateCheckoutHourly), max: settings.lateCheckoutMax })}
                  </p>
                </fieldset>
              )}
              <label className={styles.label} htmlFor="msg">
                {needsMessage ? t.ui.messageLabel : t.ui.messageOptional}
              </label>
              <textarea
                id="msg"
                ref={textRef}
                className={styles.textarea}
                rows={3}
                maxLength={MAX_MESSAGE_LENGTH}
                placeholder={t.ui.messagePlaceholder}
                value={message}
                aria-invalid={fieldError || undefined}
                aria-describedby={fieldError ? "msg-err" : undefined}
                onChange={(e) => {
                  setMessage(e.target.value);
                  if (fieldError) setFieldError(false);
                }}
                tabIndex={category ? 0 : -1}
              />
              {fieldError && <p id="msg-err" className={styles.fieldError}>{t.ui.messageRequired}</p>}
              {state === "error" && <p className={styles.fieldError} role="alert">{t.ui.error}</p>}
              {state === "rate" && <p className={styles.fieldError} role="alert">{t.ui.rateLimited}</p>}
              <button className={styles.send} type="submit" disabled={state === "sending"} tabIndex={category ? 0 : -1}>
                {state === "sending" ? t.ui.sending : t.ui.send}
              </button>
            </div>
          </form>
        </section>

        {/* ---------- Minibar ---------- */}
        <section aria-labelledby="mb-t" className={styles.minibar}>
          <h2 id="mb-t" className={`${styles.askTitle} serif`}>{t.ui.minibarTitle}</h2>
          <p className={styles.askIntro}>{t.ui.minibarIntro}</p>
          {mbState === "sent" && <Sent title={t.ui.mb_NEW} text={t.ui.mbSentText} />}

          {products.length === 0 ? (
            <p className={styles.note}>{t.ui.minibarEmpty}</p>
          ) : (
            <ul className={styles.products}>
              {products.map((p) => {
                const left = stock.get(p.id) ?? 0;
                const qty = cart[p.id] ?? 0;
                const max = Math.min(left, MAX_QTY_PER_ITEM);
                return (
                  <li key={p.id} className={styles.product} data-out={left <= 0 || undefined}>
                    <div className={styles.productInfo}>
                      <span className={styles.productName}>{productName(p)}</span>
                      <span className={styles.productPrice}>{left > 0 ? price(p.price) : t.ui.soldOut}</span>
                    </div>
                    {left > 0 && (
                      <div className={styles.stepper}>
                        <button type="button" onClick={() => setQty(p, qty - 1)} disabled={qty === 0} aria-label={`${t.ui.remove} : ${productName(p)}`}>
                          −
                        </button>
                        <output aria-live="polite">{qty}</output>
                        <button type="button" onClick={() => setQty(p, qty + 1)} disabled={qty >= max} aria-label={`${t.ui.add} : ${productName(p)}`}>
                          +
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {(mbState === "stock" || mbState === "error" || mbState === "rate") && (
            <p className={styles.fieldError} role="alert">
              {mbState === "stock" ? t.ui.stockError : mbState === "rate" ? t.ui.rateLimited : t.ui.error}
            </p>
          )}
          {cartCount > 0 && (
            <div className={styles.cartBar}>
              <span>
                {t.ui.total} <strong>{price(cartTotal)}</strong>
              </span>
              <button type="button" className={styles.send} onClick={order} disabled={mbState === "sending"}>
                {mbState === "sending" ? t.ui.sending : t.ui.order}
              </button>
            </div>
          )}
        </section>
      </main>

      <footer className={styles.foot}>
        <a className={styles.callBtn} href={`tel:${settings.phone.replace(/[^\d+]/g, "")}`}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
          </svg>
          {t.ui.call}
        </a>
        <p className={styles.address}>{settings.phone}</p>
        <p className={styles.address}>{settings.address}</p>
      </footer>
    </div>
  );
}

function Sent({ title, text }: { title: string; text: string }) {
  return (
    <div className={styles.sent} role="status">
      <svg viewBox="0 0 48 48" width="44" height="44" aria-hidden="true" className={styles.check}>
        <circle cx="24" cy="24" r="22" /><path d="M14 25l7 7 13-15" />
      </svg>
      <div>
        <p className={styles.sentTitle}>{title}</p>
        <p>{text}</p>
      </div>
    </div>
  );
}

/** « Chambre {room} » / « {room} 号房 » : le numéro en grand, le mot autour en petit. */
function RoomDoor({ template, room }: { template: string; room: string }) {
  const [before, after = ""] = template.split("{room}");
  return (
    <p className={styles.door} aria-label={template.replace("{room}", room)}>
      {before.trim() && <span className={styles.doorLabel}>{before.trim()}</span>}
      <span className={`${styles.doorNumber} serif`}>{room}</span>
      {after.trim() && <span className={styles.doorLabel}>{after.trim()}</span>}
    </p>
  );
}

function WifiCard({ t, name, password }: { t: Messages; name: string; password: string }) {
  return (
    <dl className={styles.wifi}>
      <div>
        <dt>{t.ui.wifiNetwork}</dt>
        <dd><CopyValue value={name} t={t} /></dd>
      </div>
      {password && (
        <div>
          <dt>{t.ui.wifiPassword}</dt>
          <dd><CopyValue value={password} t={t} /></dd>
        </div>
      )}
    </dl>
  );
}

function CopyValue({ value, t }: { value: string; t: Messages }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      setTimeout(() => setDone(false), 1800);
    } catch {}
  };
  return (
    <>
      <code dir="ltr">{value}</code>
      <button type="button" className={styles.copy} onClick={copy} data-done={done || undefined}>
        {done ? t.ui.copied : t.ui.copy}
      </button>
    </>
  );
}
