import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import { api } from "../../api/client";
import type { AppDetail } from "../../api/types";
import { CategorySuggestions } from "../../components/CategorySuggestions";
import { Button } from "../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import { Checkbox } from "../../components/ui/Checkbox";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { Field, Input } from "../../components/ui/Field";
import { toast } from "../../components/ui/Toast";
import { useCategories } from "../../lib/categories";
import { useErrorText } from "../../lib/errors";
import { useAppCache } from "./useAppCache";

const TEXT_FIELDS = {
  AuthorName: "app.details.authorName",
  AuthorEmail: "app.details.authorEmail",
  AuthorWebSite: "app.details.authorWebSite",
  WebSite: "app.details.webSite",
  SourceCode: "app.details.sourceCode",
  IssueTracker: "app.details.issueTracker",
  Translation: "app.details.translation",
  Changelog: "app.details.changelog",
  Donate: "app.details.donate",
  License: "app.details.license",
} as const;

type TextField = keyof typeof TEXT_FIELDS;

const GROUPS: { title: "app.details.author" | "app.details.links"; fields: TextField[] }[] = [
  { title: "app.details.author", fields: ["AuthorName", "AuthorEmail", "AuthorWebSite", "License"] },
  { title: "app.details.links", fields: ["WebSite", "SourceCode", "IssueTracker", "Translation", "Changelog", "Donate"] },
];

const INPUT_TYPES: Partial<Record<TextField, string>> = { AuthorEmail: "email" };

// The anti-features F-Droid clients know, with what they warn about.
const ANTI_FEATURES = {
  Ads: { title: "app.antiFeatures.ads.title", description: "app.antiFeatures.ads.description" },
  Tracking: { title: "app.antiFeatures.tracking.title", description: "app.antiFeatures.tracking.description" },
  NonFreeNet: { title: "app.antiFeatures.nonFreeNet.title", description: "app.antiFeatures.nonFreeNet.description" },
  NonFreeAdd: { title: "app.antiFeatures.nonFreeAdd.title", description: "app.antiFeatures.nonFreeAdd.description" },
  NonFreeDep: { title: "app.antiFeatures.nonFreeDep.title", description: "app.antiFeatures.nonFreeDep.description" },
  NonFreeAssets: { title: "app.antiFeatures.nonFreeAssets.title", description: "app.antiFeatures.nonFreeAssets.description" },
  UpstreamNonFree: { title: "app.antiFeatures.upstreamNonFree.title", description: "app.antiFeatures.upstreamNonFree.description" },
  TetheredNet: { title: "app.antiFeatures.tetheredNet.title", description: "app.antiFeatures.tetheredNet.description" },
  NSFW: { title: "app.antiFeatures.nsfw.title", description: "app.antiFeatures.nsfw.description" },
  KnownVuln: { title: "app.antiFeatures.knownVuln.title", description: "app.antiFeatures.knownVuln.description" },
  DisabledAlgorithm: { title: "app.antiFeatures.disabledAlgorithm.title", description: "app.antiFeatures.disabledAlgorithm.description" },
  NoSourceSince: { title: "app.antiFeatures.noSourceSince.title", description: "app.antiFeatures.noSourceSince.description" },
} as const;

type AntiFeature = keyof typeof ANTI_FEATURES;

function asList(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function CheckRow({ checked, onChange, disabled, title, description }: { checked: boolean; onChange: (checked: boolean) => void; disabled: boolean; title: string; description?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-surface-2">
      <Checkbox className="mt-0.5" checked={checked} disabled={disabled} onCheckedChange={(value) => onChange(value === true)} />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-text">{title}</span>
        {description ? <span className="block text-xs text-muted">{description}</span> : null}
      </span>
    </label>
  );
}

function toggle(list: string[], item: string, checked: boolean): string[] {
  return checked ? [...new Set([...list, item])] : list.filter((entry) => entry !== item);
}

export function AppDetails({ app, repositoryId, canWrite }: { app: AppDetail; repositoryId: number; canWrite: boolean }) {
  const { t } = useTranslation();
  const errors = useErrorText();
  const navigate = useNavigate();
  const { store, refreshRepository } = useAppCache(repositoryId, app.packageName);
  const categories = useCategories(repositoryId);
  const [fields, setFields] = useState(() =>
    Object.fromEntries(Object.keys(TEXT_FIELDS).map((key) => [key, String(app.metadata[key] ?? "")])) as Record<TextField, string>,
  );
  const [chosen, setChosen] = useState(() => asList(app.metadata.Categories));
  const [antiFeatures, setAntiFeatures] = useState(() => asList(app.metadata.AntiFeatures));
  const [newCategory, setNewCategory] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  // The categories of the repository and of this app; F-Droid's others are offered while typing.
  const categoryIds = [...new Set([...(categories.defined?.map((category) => category.id) ?? []), ...chosen])].sort((a, b) =>
    categories.name(a).localeCompare(categories.name(b)),
  );

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      store(
        await api<AppDetail>(`/repositories/${repositoryId}/apps/${app.packageName}/metadata`, {
          method: "PUT",
          body: { values: { ...fields, Categories: chosen, AntiFeatures: antiFeatures } },
        }),
      );
      toast.success(t("app.details.saved"), t("app.savedDescription"));
    } catch (error) {
      toast.error(errors.fromError(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-6">
      <form className="grid gap-6" onSubmit={(event) => void save(event)}>
        {GROUPS.map((group) => (
          <Card key={group.title}>
            <CardHeader title={t(group.title)} />
            <CardBody className="grid gap-5 md:grid-cols-2">
              {group.fields.map((field) => (
                <Field key={field} label={t(TEXT_FIELDS[field])}>
                  {(control) => (
                    <Input
                      {...control}
                      type={INPUT_TYPES[field] ?? "text"}
                      disabled={!canWrite}
                      value={fields[field]}
                      onChange={(event) => setFields({ ...fields, [field]: event.target.value })}
                    />
                  )}
                </Field>
              ))}
            </CardBody>
          </Card>
        ))}

        <Card>
          <CardHeader title={t("app.details.categories")} description={t("app.details.categoriesDescription")} />
          <CardBody className="flex flex-col gap-4">
            <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
              {categoryIds.map((id) => (
                <CheckRow key={id} checked={chosen.includes(id)} disabled={!canWrite} title={categories.name(id)} onChange={(checked) => setChosen(toggle(chosen, id, checked))} />
              ))}
            </div>
            {canWrite ? (
              <div className="flex max-w-md gap-2">
                <Input
                  aria-label={t("app.details.newCategory")}
                  placeholder={t("app.details.newCategory")}
                  list="category-suggestions"
                  maxLength={64}
                  value={newCategory}
                  onChange={(event) => setNewCategory(event.target.value)}
                />
                <CategorySuggestions id="category-suggestions" options={categories.options} />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!newCategory.trim()}
                  onClick={() => {
                    setChosen(toggle(chosen, categories.resolve(newCategory), true));
                    setNewCategory("");
                  }}
                >
                  <IconPlus />
                  {t("action.add")}
                </Button>
              </div>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("app.details.antiFeatures")} description={t("app.details.antiFeaturesDescription")} />
          <CardBody className="grid gap-1 md:grid-cols-2">
            {(Object.keys(ANTI_FEATURES) as AntiFeature[]).map((feature) => (
              <CheckRow
                key={feature}
                checked={antiFeatures.includes(feature)}
                disabled={!canWrite}
                title={t(ANTI_FEATURES[feature].title)}
                description={t(ANTI_FEATURES[feature].description)}
                onChange={(checked) => setAntiFeatures(toggle(antiFeatures, feature, checked))}
              />
            ))}
          </CardBody>
        </Card>

        {canWrite ? (
          <div>
            <Button type="submit" loading={saving}>
              {t("action.save")}
            </Button>
          </div>
        ) : null}
      </form>

      {canWrite ? (
        <Card className="border-danger/30">
          <CardHeader title={t("app.details.danger")} />
          <CardBody className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-text">{t("app.details.remove")}</div>
              <div className="text-sm text-muted">{t("app.details.removeHint")}</div>
            </div>
            <Button variant="danger" onClick={() => setRemoving(true)}>
              <IconTrash />
              {t("app.details.remove")}
            </Button>
          </CardBody>
        </Card>
      ) : null}

      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        danger
        title={t("app.details.removeTitle", { name: app.name })}
        description={t("app.details.removeDescription")}
        confirmLabel={t("app.details.remove")}
        onConfirm={async () => {
          try {
            await api(`/repositories/${repositoryId}/apps/${app.packageName}`, { method: "DELETE" });
            await refreshRepository();
            toast.success(t("app.details.removed", { name: app.name }));
            await navigate({ to: "/repositories/$repositoryId/apps", params: { repositoryId: String(repositoryId) } });
          } catch (error) {
            toast.error(errors.fromError(error));
          }
        }}
      />
    </div>
  );
}
