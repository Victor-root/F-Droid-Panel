import { IconBell, IconPackage } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

import { AUTO_LANGUAGE, LANGUAGE_NAMES, THEME_ICONS, THEME_LABELS, useLanguageChoice } from "../../components/PreferenceMenus";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import { ColorPicker } from "../../components/ui/ColorPicker";
import { Field } from "../../components/ui/Field";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { Select } from "../../components/ui/Select";
import { Switch } from "../../components/ui/Switch";
import { chooseLanguage, type Language, LANGUAGES } from "../../i18n";
import { DEFAULT_ACCENT } from "../../theme/palette";
import { THEME_MODES, useTheme } from "../../theme/ThemeProvider";

function AccentPreview() {
  const { t } = useTranslation();
  return (
    <div className="rounded-2xl border border-border bg-bg p-4">
      <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3 shadow-soft">
        <span className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent-soft-text">
          <IconPackage className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-text">{t("appearance.preview.title")}</div>
          <div className="text-xs text-muted">{t("appearance.preview.description")}</div>
        </div>
        <Badge tone="accent">{t("appearance.preview.badge")}</Badge>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm">{t("appearance.preview.primary")}</Button>
        <Button size="sm" variant="soft">
          <IconBell />
          {t("appearance.preview.soft")}
        </Button>
        <Button size="sm" variant="link">
          {t("appearance.preview.link")}
        </Button>
        <Switch defaultChecked aria-label={t("appearance.preview.switch")} className="ml-auto" />
      </div>
    </div>
  );
}

export function AppearanceSettings() {
  const { t } = useTranslation();
  const { mode, setMode, accent, setAccent } = useTheme();
  const languageChoice = useLanguageChoice();

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader title={t("appearance.theme.title")} description={t("appearance.theme.description")} />
        <CardBody>
          <SegmentedControl
            aria-label={t("theme.label")}
            value={mode}
            onValueChange={setMode}
            className="w-full sm:w-auto"
            segments={THEME_MODES.map((value) => {
              const Icon = THEME_ICONS[value];
              return { value, label: t(THEME_LABELS[value]), icon: <Icon /> };
            })}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={t("appearance.accent.title")}
          description={t("appearance.accent.description")}
          actions={
            accent !== DEFAULT_ACCENT ? (
              <Button variant="ghost" size="sm" onClick={() => setAccent(DEFAULT_ACCENT)}>
                {t("appearance.accent.reset")}
              </Button>
            ) : null
          }
        />
        <CardBody className="grid gap-6 md:grid-cols-2">
          <ColorPicker value={accent} onChange={setAccent} />
          <AccentPreview />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("appearance.language.title")} description={t("appearance.language.description")} />
        <CardBody>
          <Field label={t("language.label")} className="max-w-xs">
            {(control) => (
              <Select
                {...control}
                value={languageChoice}
                onValueChange={(value) => void chooseLanguage(value === AUTO_LANGUAGE ? null : (value as Language))}
                options={[
                  { value: AUTO_LANGUAGE, label: t("language.auto") },
                  ...LANGUAGES.map((language) => ({ value: language, label: LANGUAGE_NAMES[language] })),
                ]}
              />
            )}
          </Field>
        </CardBody>
      </Card>
    </div>
  );
}
