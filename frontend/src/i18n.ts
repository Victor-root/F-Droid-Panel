import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import enCommon from "./locales/en/common.json";
import frCommon from "./locales/fr/common.json";
import { STORAGE_KEYS, writeStorage } from "./storage";

export const resources = {
  en: { common: enCommon },
  fr: { common: frCommon },
} as const;

export type Language = keyof typeof resources;
export const LANGUAGES = Object.keys(resources) as Language[];

i18n.on("languageChanged", (language) => {
  document.documentElement.lang = language;
});

await i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    defaultNS: "common",
    supportedLngs: LANGUAGES,
    fallbackLng: "en",
    load: "languageOnly",
    // An explicit choice is remembered; otherwise the browser languages decide on every visit.
    detection: { order: ["localStorage", "navigator"], lookupLocalStorage: STORAGE_KEYS.language, caches: [] },
    interpolation: { escapeValue: false },
  });

/** Switches language on an explicit user choice; null goes back to following the browser. */
export async function chooseLanguage(language: Language | null): Promise<void> {
  writeStorage(STORAGE_KEYS.language, language);
  // Without a language, i18next runs the detector again.
  await i18n.changeLanguage(language ?? undefined);
}

export default i18n;
