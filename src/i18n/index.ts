import i18next, { type i18n } from "i18next";
import en from "./locales/en.json";
import ua from "./locales/ua.json";

export type Language = "ua" | "en";
export const LANGUAGES: readonly Language[] = ["ua", "en"] as const;
const STORAGE_KEY = "fuzzy.lang";
const DEFAULT_LANG: Language = "ua";

function loadStoredLang(): Language {
  if (typeof localStorage === "undefined") return DEFAULT_LANG;
  const v = localStorage.getItem(STORAGE_KEY);
  return v === "ua" || v === "en" ? v : DEFAULT_LANG;
}

let initialized = false;

export async function initI18n(): Promise<i18n> {
  if (initialized) return i18next;
  await i18next.init({
    lng: loadStoredLang(),
    fallbackLng: "en",
    returnNull: false,
    resources: {
      ua: { translation: ua },
      en: { translation: en },
    },
    interpolation: { escapeValue: false },
  });
  initialized = true;
  return i18next;
}

export function t(key: string, options?: Record<string, unknown>): string {
  return i18next.t(key, options);
}

export function getLang(): Language {
  return (i18next.language as Language) ?? DEFAULT_LANG;
}

export async function setLang(lang: Language): Promise<void> {
  if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, lang);
  await i18next.changeLanguage(lang);
}

export function onLanguageChange(cb: (lang: Language) => void): () => void {
  const handler = (lng: string) => cb(lng as Language);
  i18next.on("languageChanged", handler);
  return () => i18next.off("languageChanged", handler);
}
