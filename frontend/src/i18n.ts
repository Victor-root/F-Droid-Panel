import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import enCommon from "./locales/en/common.json";
import frCommon from "./locales/fr/common.json";

export const resources = {
  en: { common: enCommon },
  fr: { common: frCommon },
} as const;

i18n.on("languageChanged", (language) => {
  document.documentElement.lang = language;
});

await i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    defaultNS: "common",
    supportedLngs: Object.keys(resources),
    fallbackLng: "en",
    load: "languageOnly",
    detection: { order: ["navigator"], caches: [] },
    interpolation: { escapeValue: false },
  });

export default i18n;
