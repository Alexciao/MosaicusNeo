// MosaicusNeo — language.
//
// The whole app runs in the browser, so the language is picked once, when the page loads:
//  1. the choice made in the language menu (saved in this browser), otherwise
//  2. Italian if the device's primary language is Italian, otherwise
//  3. English.
// Changing language saves the choice and reloads the page: many labels (sensor catalog, quantities,
// fit models…) are built when their modules load, so a reload keeps everything consistent.
//
// In React components use `useTranslations` from next-intl; elsewhere (stores, engines, catalogs)
// use `t` from here. Both read the same messages.

import { createTranslator } from "next-intl";
import { en, it, type Messages } from "./messages";

export const LOCALES = ["en", "it"] as const;
export type Locale = (typeof LOCALES)[number];
export const LOCALE_NAMES: Record<Locale, string> = { en: "English", it: "Italiano" };

const STORAGE_KEY = "mosaicus.locale";

const isLocale = (v: unknown): v is Locale => typeof v === "string" && (LOCALES as readonly string[]).includes(v);

/** The language chosen in the menu, if any. */
export function savedLocale(): Locale | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return isLocale(v) ? v : null;
  } catch {
    return null;
  }
}

/** The device's language: Italian only if the primary language is Italian, English otherwise. */
export function deviceLocale(): Locale {
  if (typeof navigator === "undefined") return "en";
  const primary = navigator.languages?.[0] ?? navigator.language ?? "";
  return primary.toLowerCase().startsWith("it") ? "it" : "en";
}

function detect(): Locale {
  if (typeof window === "undefined") return "en";
  return savedLocale() ?? deviceLocale();
}

/** The language of this page load (fixed until reload). */
export const locale: Locale = detect();
/** BCP 47 tag for Intl formatters (numbers, dates, sorting). */
export const intlLocale = locale === "it" ? "it-IT" : "en-US";
export const messages: Messages = locale === "it" ? it : en;

/** Translator for code outside React. Keys are full paths, e.g. t("lab.toast.stopFirst"). */
export const t = createTranslator({ locale, messages });

/** Saves the chosen language and reloads the page to apply it. */
export function setLocale(next: Locale) {
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* storage not available: the choice lasts for this load only */
  }
  if (next !== locale) window.location.reload();
}
