import { IconDeviceDesktop, IconLanguage, IconMoon, IconSun } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

import { chooseLanguage, type Language, LANGUAGES } from "../i18n";
import { readStorage, STORAGE_KEYS } from "../storage";
import { type ThemeMode, useTheme } from "../theme/ThemeProvider";
import { Button } from "./ui/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "./ui/DropdownMenu";
import { Tooltip } from "./ui/Tooltip";

export const THEME_ICONS = { light: IconSun, dark: IconMoon, system: IconDeviceDesktop } satisfies Record<ThemeMode, unknown>;

export const THEME_LABELS = { light: "theme.light", dark: "theme.dark", system: "theme.system" } as const satisfies Record<
  ThemeMode,
  string
>;

export const LANGUAGE_NAMES: Record<Language, string> = { en: "English", fr: "Français" };

export function ThemeMenu() {
  const { t } = useTranslation();
  const { mode, resolved, setMode } = useTheme();
  const Current = resolved === "dark" ? IconMoon : IconSun;

  return (
    <DropdownMenu>
      <Tooltip content={t("theme.label")}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={t("theme.label")}>
            <Current />
          </Button>
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent>
        <DropdownMenuLabel>{t("theme.label")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={mode} onValueChange={(value) => setMode(value as ThemeMode)}>
          {(["light", "dark", "system"] as const).map((value) => {
            const Icon = THEME_ICONS[value];
            return (
              <DropdownMenuRadioItem key={value} value={value}>
                <Icon />
                {t(THEME_LABELS[value])}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const AUTO_LANGUAGE = "auto";

/** The explicit language choice, or "auto" when the browser languages decide. */
export function useLanguageChoice(): Language | typeof AUTO_LANGUAGE {
  useTranslation();
  const stored = readStorage(STORAGE_KEYS.language);
  return LANGUAGES.find((language) => language === stored) ?? AUTO_LANGUAGE;
}

export function LanguageMenu() {
  const { t } = useTranslation();
  const choice = useLanguageChoice();

  return (
    <DropdownMenu>
      <Tooltip content={t("language.label")}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={t("language.label")}>
            <IconLanguage />
          </Button>
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent>
        <DropdownMenuLabel>{t("language.label")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={choice}
          onValueChange={(value) => void chooseLanguage(value === AUTO_LANGUAGE ? null : (value as Language))}
        >
          <DropdownMenuRadioItem value={AUTO_LANGUAGE}>{t("language.auto")}</DropdownMenuRadioItem>
          {LANGUAGES.map((language) => (
            <DropdownMenuRadioItem key={language} value={language} lang={language}>
              {LANGUAGE_NAMES[language]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
