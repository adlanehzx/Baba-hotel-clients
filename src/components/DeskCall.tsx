"use client";

import { useCallback, useEffect, useState } from "react";
import { MESSAGES, LOCALES, isLocale, type Locale } from "@/i18n";
import styles from "./guest.module.css";

const LANG_KEY = "baba:lang";
const CALL_KEY = (token: string) => `baba:desk:${token}`;
const POLL_MS = 5000;

type Call = { id: string; status: "NEW" | "IN_PROGRESS" | "DONE" | "CANCELLED"; at: number };

function readCall(token: string): Call | null {
  try {
    const c = JSON.parse(localStorage.getItem(CALL_KEY(token)) ?? "null") as Call | null;
    return c && Date.now() - c.at < 30 * 60_000 ? c : null;
  } catch {
    return null;
  }
}
function writeCall(token: string, c: Call | null) {
  try {
    if (c) localStorage.setItem(CALL_KEY(token), JSON.stringify(c));
    else localStorage.removeItem(CALL_KEY(token));
  } catch {}
}

/**
 * QR code posé au comptoir de la réception : quand personne n'est là, le client
 * appuie sur un bouton et la personne de service est prévenue sur son téléphone.
 */
export default function DeskCall({ token, initialLocale, phone }: { token: string; initialLocale: Locale; phone: string }) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const t = MESSAGES[locale];
  const [name, setName] = useState("");
  const [call, setCall] = useState<Call | null>(null);
  const [state, setState] = useState<"idle" | "sending" | "error" | "rate">("idle");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LANG_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- préférences lues après le premier rendu
      if (isLocale(saved)) setLocale(saved);
    } catch {}
    setCall(readCall(token));
  }, [token]);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = t.dir;
  }, [locale, t.dir]);

  const refresh = useCallback(async () => {
    const c = readCall(token);
    if (!c || c.status === "DONE" || c.status === "CANCELLED") return;
    try {
      const r = await fetch(`/api/r/${token}/requests?ids=${c.id}`, { cache: "no-store" });
      if (!r.ok) return;
      const [row] = (await r.json()) as { id: string; status: Call["status"] }[];
      if (!row) return;
      const next = { ...c, status: row.status };
      writeCall(token, next);
      setCall(next);
    } catch {}
  }, [token]);

  const waiting = call?.status === "NEW" || call?.status === "IN_PROGRESS";
  useEffect(() => {
    if (!waiting) return;
    const id = setInterval(() => document.visibilityState === "visible" && refresh(), POLL_MS);
    return () => clearInterval(id);
  }, [waiting, refresh]);

  const send = async () => {
    setState("sending");
    try {
      const r = await fetch(`/api/r/${token}/requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: "desk", message: name, lang: locale }),
      });
      if (!r.ok) return setState(r.status === 429 ? "rate" : "error");
      const row = (await r.json()) as { id: string; status: Call["status"] };
      const next = { id: row.id, status: row.status, at: Date.now() };
      writeCall(token, next);
      setCall(next);
      setState("idle");
    } catch {
      setState("error");
    }
  };

  const changeLocale = (l: Locale) => {
    setLocale(l);
    try {
      localStorage.setItem(LANG_KEY, l);
    } catch {}
  };

  return (
    <div className={styles.page} lang={locale} dir={t.dir}>
      <header className={`${styles.head} ${styles.deskHead}`}>
        <div className={styles.topbar}>
          <span className={`${styles.brand} serif`}>Baba <em>Hotel</em></span>
          <label className={styles.lang}>
            <span className={styles.srOnly}>{t.ui.language}</span>
            <select value={locale} onChange={(e) => changeLocale(e.target.value as Locale)}>
              {LOCALES.map((l) => <option key={l} value={l} lang={l}>{MESSAGES[l].name}</option>)}
            </select>
          </label>
        </div>
        <svg className={styles.deskBell} viewBox="0 0 64 64" width="72" height="72" aria-hidden="true">
          <path d="M10 46h44M14 46a18 18 0 0 1 36 0M32 22v-6M27 16h10" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
        <h1 className={`${styles.hello} serif`}>{t.ui.deskTitle}</h1>
        <p className={styles.intro}>{t.ui.deskAway}</p>
      </header>

      <main className={styles.main}>
        <section className={styles.ask} aria-live="polite">
          {waiting ? (
            <div className={styles.deskWaiting} data-coming={call?.status === "IN_PROGRESS" || undefined}>
              <span className={styles.deskPulse} aria-hidden="true" />
              <h2 className={`${styles.askTitle} serif`}>{call?.status === "IN_PROGRESS" ? t.ui.deskComing : t.ui.deskSent}</h2>
              <p className={styles.askIntro}>{t.ui.deskSentText}</p>
              <button type="button" className={styles.deskAgain} onClick={send} disabled={state === "sending"}>{t.ui.deskAgain}</button>
            </div>
          ) : (
            <div className={styles.deskForm}>
              <p className={styles.askIntro}>{t.ui.deskIntro}</p>
              <label className={styles.label} htmlFor="desk-name">{t.ui.deskName}</label>
              <input id="desk-name" className={styles.input} maxLength={120} value={name} placeholder={t.ui.deskNamePlaceholder} onChange={(e) => setName(e.target.value)} />
              <button type="button" className={`${styles.send} ${styles.deskButton}`} onClick={send} disabled={state === "sending"}>
                {state === "sending" ? t.ui.sending : t.ui.deskButton}
              </button>
            </div>
          )}
          {state === "error" && <p className={styles.fieldError} role="alert">{t.ui.error}</p>}
          {state === "rate" && <p className={styles.fieldError} role="alert">{t.ui.rateLimited}</p>}
        </section>
      </main>

      <footer className={styles.foot}>
        <a className={styles.callBtn} href={`tel:${phone.replace(/[^\d+]/g, "")}`}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
          </svg>
          {t.ui.call}
        </a>
        <p className={styles.address}>{phone}</p>
      </footer>
    </div>
  );
}
