import fr, { type Messages } from "./messages/fr";
import en from "./messages/en";
import es from "./messages/es";
import de from "./messages/de";
import it from "./messages/it";
import pt from "./messages/pt";
import nl from "./messages/nl";
import ar from "./messages/ar";
import zh from "./messages/zh";
import ja from "./messages/ja";
import ko from "./messages/ko";
import ru from "./messages/ru";

/** Pour ajouter une langue : créer messages/xx.ts (copie de en.ts) et l'ajouter ici. */
export const MESSAGES = { fr, en, es, de, it, pt, nl, ar, zh, ja, ko, ru } satisfies Record<string, Messages>;

export type Locale = keyof typeof MESSAGES;
export const LOCALES = Object.keys(MESSAGES) as Locale[];
export const DEFAULT_LOCALE: Locale = "en";

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && v in MESSAGES;
}

/** Choisit la langue du client à partir de l'en-tête Accept-Language du navigateur. */
export function pickLocale(acceptLanguage: string | null): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const prefs = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { base: tag.toLowerCase().split("-")[0], q: q ? Number(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);
  return prefs.find((p) => isLocale(p.base))?.base as Locale ?? DEFAULT_LOCALE;
}

/** Remplace les {variables} d'un texte. */
export function fill(text: string, vars: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
}

export type { Messages };
