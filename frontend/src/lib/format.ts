import { useTranslation } from "react-i18next";

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
  ["second", 1],
];

/** Dates, durations and sizes in the current interface language. */
export function useFormat() {
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? "en";

  const dateTime = (iso: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

  const date = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(iso));

  const relative = (iso: string) => {
    const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
    const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    for (const [unit, size] of UNITS) {
      if (Math.abs(seconds) >= size || unit === "second") {
        return formatter.format(Math.round(seconds / size), unit);
      }
    }
    return formatter.format(0, "second");
  };

  const duration = (startIso: string, endIso: string) => {
    const seconds = Math.max(0, Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 1000));
    const minutes = Math.floor(seconds / 60);
    const unit = (value: number, name: "minute" | "second") =>
      new Intl.NumberFormat(locale, { style: "unit", unit: name, unitDisplay: "narrow" }).format(value);
    return minutes > 0 ? `${unit(minutes, "minute")} ${unit(seconds % 60, "second")}` : unit(seconds, "second");
  };

  const bytes = (value: number) => {
    const units = ["byte", "kilobyte", "megabyte", "gigabyte", "terabyte"] as const;
    let size = value;
    let index = 0;
    while (size >= 1024 && index < units.length - 1) {
      size /= 1024;
      index += 1;
    }
    return new Intl.NumberFormat(locale, {
      style: "unit",
      unit: units[index],
      unitDisplay: "short",
      maximumFractionDigits: size < 10 && index > 0 ? 1 : 0,
    }).format(size);
  };

  const number = (value: number) => new Intl.NumberFormat(locale).format(value);

  return { dateTime, date, relative, duration, bytes, number };
}
