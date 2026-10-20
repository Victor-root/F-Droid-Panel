import { IconInfoCircle, IconLanguage, IconPlus, IconTrash } from "@tabler/icons-react";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import { api } from "../../api/client";
import type { AppDetail, AppLocale } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { Dialog, DialogClose, DialogContent } from "../../components/ui/Dialog";
import { Field, Input, Textarea } from "../../components/ui/Field";
import { toast } from "../../components/ui/Toast";
import { cn } from "../../lib/cn";
import { useErrorText } from "../../lib/errors";
import { useFormat } from "../../lib/format";
import { AppGraphics } from "./AppGraphics";
import { AppScreenshots } from "./AppScreenshots";
import { useAppCache } from "./useAppCache";

const DEFAULT_LOCALE = "en-US";
const LOCALE_PATTERN = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
const SUGGESTED_LOCALES = ["en-US", "fr-FR", "de-DE", "es-ES", "it-IT", "pt-BR", "pt-PT", "nl-NL", "pl-PL", "ru-RU", "uk", "ja-JP", "ko-KR", "zh-CN", "zh-TW", "ar", "tr-TR", "sv-SE", "nb-NO", "da-DK", "fi-FI", "cs-CZ"];
const LIMITS = { name: 50, summary: 80, description: 4000 };

export interface ListingProps {
  app: AppDetail;
  repositoryId: number;
  canWrite: boolean;
  /** Changes whenever the app is reloaded, so images that kept their address are fetched again. */
  version: number;
}

function emptyLocale(locale: string): AppLocale {
  return {
    locale,
    name: "",
    summary: "",
    description: "",
    graphics: { icon: null, featureGraphic: null, promoGraphic: null, tvBanner: null },
    screenshots: { phoneScreenshots: [], sevenInchScreenshots: [], tenInchScreenshots: [], tvScreenshots: [], wearScreenshots: [] },
  };
}

function Counter({ value, limit }: { value: string; limit: number }) {
  return <span className={cn("tabular-nums", value.length > limit * 0.9 && "text-warning-text")}>{`${value.length} / ${limit}`}</span>;
}

function TextsCard({ app, locale, repositoryId, canWrite }: { app: AppDetail; locale: AppLocale; repositoryId: number; canWrite: boolean }) {
  const { t } = useTranslation();
  const errors = useErrorText();
  const { store } = useAppCache(repositoryId, app.packageName);
  // Texts of the app file are moved to the default language on the first save, so they are shown there.
  const legacy = locale.locale === DEFAULT_LOCALE ? app.legacyTexts : {};
  const [form, setForm] = useState({
    name: locale.name || legacy.name || "",
    summary: locale.summary || legacy.summary || "",
    description: locale.description || legacy.description || "",
  });
  const [saving, setSaving] = useState(false);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      store(await api<AppDetail>(`/repositories/${repositoryId}/apps/${app.packageName}/texts/${locale.locale}`, { method: "PUT", body: form }));
      toast.success(t("app.texts.saved"), t("app.savedDescription"));
    } catch (error) {
      toast.error(errors.fromError(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader title={t("app.texts.title")} description={t("app.texts.description")} />
      <CardBody>
        <form className="grid gap-5" onSubmit={(event) => void save(event)}>
          <div className="grid gap-5 md:grid-cols-2">
            <Field label={t("app.texts.name")} hint={<Counter value={form.name} limit={LIMITS.name} />}>
              {(control) => <Input {...control} disabled={!canWrite} maxLength={LIMITS.name} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />}
            </Field>
            <Field label={t("app.texts.summary")} hint={<Counter value={form.summary} limit={LIMITS.summary} />}>
              {(control) => <Input {...control} disabled={!canWrite} maxLength={LIMITS.summary} value={form.summary} onChange={(event) => setForm({ ...form, summary: event.target.value })} />}
            </Field>
          </div>
          <Field
            label={t("app.texts.descriptionLabel")}
            hint={
              <span className="flex justify-between gap-3">
                <span>{t("app.texts.descriptionHint")}</span>
                <Counter value={form.description} limit={LIMITS.description} />
              </span>
            }
          >
            {(control) => (
              <Textarea
                {...control}
                disabled={!canWrite}
                rows={10}
                maxLength={LIMITS.description}
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
              />
            )}
          </Field>
          {canWrite ? (
            <div>
              <Button type="submit" loading={saving}>
                {t("action.save")}
              </Button>
            </div>
          ) : null}
        </form>
      </CardBody>
    </Card>
  );
}

function AddLanguageDialog({ open, onOpenChange, existing, onAdd }: { open: boolean; onOpenChange: (open: boolean) => void; existing: string[]; onAdd: (code: string) => void }) {
  const { t } = useTranslation();
  const format = useFormat();
  const [code, setCode] = useState("");
  const valid = LOCALE_PATTERN.test(code);
  const taken = existing.includes(code);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!valid || taken) return;
    onAdd(code);
    setCode("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="sm"
        title={t("app.languages.addTitle")}
        description={t("app.languages.addDescription")}
        footer={
          <>
            <DialogClose asChild>
              <Button variant="secondary">{t("action.cancel")}</Button>
            </DialogClose>
            <Button type="submit" form="add-language" disabled={!valid || taken}>
              {t("app.languages.add")}
            </Button>
          </>
        }
      >
        <form id="add-language" onSubmit={submit}>
          <Field
            label={t("app.languages.code")}
            hint={valid && !taken ? format.language(code) : t("app.languages.codeHint")}
            error={taken ? t("app.languages.taken") : undefined}
          >
            {(control) => (
              <>
                <Input {...control} list="locale-suggestions" autoFocus placeholder="fr-FR" value={code} onChange={(event) => setCode(event.target.value.trim())} />
                <datalist id="locale-suggestions">
                  {SUGGESTED_LOCALES.filter((item) => !existing.includes(item)).map((item) => (
                    <option key={item} value={item}>
                      {format.language(item)}
                    </option>
                  ))}
                </datalist>
              </>
            )}
          </Field>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AppListing({ app, repositoryId, canWrite, version }: ListingProps) {
  const { t } = useTranslation();
  const format = useFormat();
  const errors = useErrorText();
  const { store } = useAppCache(repositoryId, app.packageName);
  const [added, setAdded] = useState<string[]>([]);
  const [current, setCurrent] = useState(DEFAULT_LOCALE);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState(false);

  const saved = new Map(app.locales.map((entry) => [entry.locale, entry]));
  const codes = [...new Set([DEFAULT_LOCALE, ...saved.keys(), ...added])];
  const locale = saved.get(current) ?? emptyLocale(current);
  const hasLegacy = Object.keys(app.legacyTexts).length > 0;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("app.languages.title")}>
        <IconLanguage className="size-5 text-muted" aria-hidden="true" />
        {codes.map((code) => (
          <button
            key={code}
            type="button"
            aria-pressed={code === current}
            onClick={() => setCurrent(code)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors",
              code === current ? "border-accent-strong bg-accent-soft text-accent-soft-text" : "border-border bg-surface text-muted hover:text-text",
              !saved.has(code) && "border-dashed",
            )}
          >
            {format.language(code)}
            <span className="font-mono text-[0.7rem] opacity-70">{code}</span>
          </button>
        ))}
        {canWrite ? (
          <Button variant="ghost" size="sm" onClick={() => setAdding(true)}>
            <IconPlus />
            {t("app.languages.add")}
          </Button>
        ) : null}
        {canWrite && saved.has(current) ? (
          <Button variant="ghost" size="sm" className="ml-auto text-danger-text" onClick={() => setRemoving(true)}>
            <IconTrash />
            {t("app.languages.remove")}
          </Button>
        ) : null}
      </div>

      {hasLegacy ? (
        <p className="flex items-start gap-2.5 rounded-xl bg-info-soft px-4 py-3 text-sm text-info-text">
          <IconInfoCircle className="mt-0.5 size-4 shrink-0" />
          {t("app.texts.legacy")}
        </p>
      ) : null}

      <TextsCard key={current} app={app} locale={locale} repositoryId={repositoryId} canWrite={canWrite} />
      <AppGraphics app={app} locale={locale} repositoryId={repositoryId} canWrite={canWrite} version={version} />
      <AppScreenshots app={app} locale={locale} repositoryId={repositoryId} canWrite={canWrite} version={version} />

      <AddLanguageDialog
        open={adding}
        onOpenChange={setAdding}
        existing={codes}
        onAdd={(code) => {
          setAdded((list) => [...list, code]);
          setCurrent(code);
        }}
      />
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        danger
        title={t("app.languages.removeTitle", { language: format.language(current) })}
        description={t("app.languages.removeDescription")}
        confirmLabel={t("app.languages.remove")}
        onConfirm={async () => {
          try {
            store(await api<AppDetail>(`/repositories/${repositoryId}/apps/${app.packageName}/locales/${current}`, { method: "DELETE" }));
            setAdded((list) => list.filter((code) => code !== current));
            setCurrent(DEFAULT_LOCALE);
          } catch (error) {
            toast.error(errors.fromError(error));
          }
        }}
      />
    </div>
  );
}
