import { IconAlertTriangle, IconCircleCheck, IconCircleX, IconPackage, IconPlus, IconX } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import { categoriesQuery } from "../../api/queries";
import type { CheckItem } from "../../api/types";
import { useErrorText } from "../../lib/errors";
import { useFormat } from "../../lib/format";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Field, Input } from "../ui/Field";
import { Progress } from "../ui/Progress";
import { Select } from "../ui/Select";
import { Spinner } from "../ui/Spinner";
import { type UploadItem, useUploads } from "./UploadContext";

function shortPermission(permission: string): string {
  return permission.replace(/^android\.permission\./, "");
}

function CheckList({ items, tone }: { items: CheckItem[]; tone: "danger" | "warning" }) {
  const errors = useErrorText();
  const Icon = tone === "danger" ? IconCircleX : IconAlertTriangle;
  return (
    <ul className={tone === "danger" ? "space-y-1.5 text-danger-text" : "space-y-1.5 text-warning-text"}>
      {items.map((item) => (
        <li key={item.code} className="flex items-start gap-2 text-sm">
          <Icon className="mt-0.5 size-4 shrink-0" />
          <span>
            {errors.message(item.code, {
              ...item.params,
              permissions: Array.isArray(item.params.permissions)
                ? (item.params.permissions as string[]).map(shortPermission).join(", ")
                : undefined,
            })}
          </span>
        </li>
      ))}
    </ul>
  );
}

function NewAppForm({ item, repositoryId }: { item: UploadItem; repositoryId: number }) {
  const { t } = useTranslation();
  const { confirm } = useUploads();
  const { data: categories } = useQuery(categoriesQuery(repositoryId));
  const [name, setName] = useState(item.upload?.info?.label ?? "");
  const [summary, setSummary] = useState("");
  const [category, setCategory] = useState("");
  const options = [...new Set(["Other", ...(categories?.map((entry) => entry.id) ?? [])])];

  return (
    <form
      className="grid gap-3 sm:grid-cols-3"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        void confirm(item.key, { name, summary, categories: category ? [category] : [] });
      }}
    >
      <Field label={t("uploads.name")}>{(control) => <Input {...control} required maxLength={50} value={name} onChange={(event) => setName(event.target.value)} />}</Field>
      <Field label={t("uploads.summary")} hint={t("uploads.summaryHint")}>
        {(control) => <Input {...control} maxLength={80} value={summary} onChange={(event) => setSummary(event.target.value)} />}
      </Field>
      <Field label={t("uploads.category")}>
        {(control) => (
          <Select
            {...control}
            value={category || "Other"}
            onValueChange={setCategory}
            options={options.map((option) => ({ value: option, label: option }))}
          />
        )}
      </Field>
      <div className="sm:col-span-3">
        <Button type="submit" loading={item.phase === "adding"}>
          <IconPlus />
          {t("uploads.addApp")}
        </Button>
      </div>
    </form>
  );
}

function UploadCard({ item, repositoryId }: { item: UploadItem; repositoryId: number }) {
  const { t } = useTranslation();
  const format = useFormat();
  const errors = useErrorText();
  const { confirm, discard } = useUploads();
  const info = item.upload?.info;
  const checks = item.upload?.checks;
  const iconUrl = item.upload && info?.hasIcon ? `/admin/api/repositories/${repositoryId}/uploads/${item.upload.id}/icon` : null;

  return (
    <Card className="animate-scale-in overflow-hidden">
      <div className="flex items-start gap-4 p-4">
        {iconUrl ? (
          <img src={iconUrl} alt="" className="size-12 shrink-0 rounded-xl bg-surface-2" />
        ) : (
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-muted">
            <IconPackage className="size-6" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-semibold text-text">{info?.label ?? item.file.name}</span>
            {info ? <Badge>{t("uploads.version", { name: info.versionName ?? info.versionCode })}</Badge> : null}
            {checks?.newApp && item.phase === "ready" ? <Badge tone="accent">{t("uploads.newApp")}</Badge> : null}
          </div>
          <div className="mt-0.5 truncate font-mono text-xs text-muted">{info?.package ?? item.file.name}</div>
          <div className="mt-0.5 text-xs text-muted">{format.bytes(item.file.size)}</div>
        </div>
        {item.phase !== "adding" ? (
          <Button variant="ghost" size="icon-sm" aria-label={t("uploads.discard")} onClick={() => discard(item.key)}>
            <IconX />
          </Button>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 border-t border-border bg-surface-2/50 px-4 py-3">
        {item.phase === "uploading" ? (
          <div className="flex flex-col gap-1.5">
            <Progress value={(item.sent / item.file.size) * 100} label={t("uploads.uploading")} />
            <span className="text-xs text-muted">{t("uploads.sending", { sent: format.bytes(item.sent), total: format.bytes(item.file.size) })}</span>
          </div>
        ) : null}
        {item.phase === "checking" ? (
          <span className="flex items-center gap-2 text-sm text-muted">
            <Spinner />
            {t("uploads.checking")}
          </span>
        ) : null}
        {item.phase === "failed" ? <CheckList tone="danger" items={[{ code: "upload_failed", params: { reason: errors.fromError(item.error) } }]} /> : null}
        {checks?.blocking.length ? <CheckList tone="danger" items={checks.blocking} /> : null}
        {checks?.warnings.length && item.phase !== "added" ? <CheckList tone="warning" items={checks.warnings} /> : null}
        {item.error && item.phase === "ready" ? <p className="text-sm text-danger-text">{errors.fromError(item.error)}</p> : null}
        {item.phase === "ready" || item.phase === "adding" ? (
          checks?.newApp ? (
            <NewAppForm item={item} repositoryId={repositoryId} />
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-1.5 text-sm text-success-text">
                <IconCircleCheck className="size-4" />
                {t("uploads.sameSigner")}
              </span>
              <Button className="ml-auto" loading={item.phase === "adding"} onClick={() => void confirm(item.key, { name: "", summary: "", categories: [] })}>
                <IconPlus />
                {t("uploads.addVersion")}
              </Button>
            </div>
          )
        ) : null}
        {item.phase === "added" && info ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1.5 text-sm text-success-text">
              <IconCircleCheck className="size-4" />
              {t("uploads.added")}
            </span>
            <Button variant="link" asChild className="ml-auto">
              <Link to="/repositories/$repositoryId/apps/$packageName" params={{ repositoryId: String(repositoryId), packageName: info.package }}>
                {t("uploads.openApp")}
              </Link>
            </Button>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

export function UploadTray({ repositoryId }: { repositoryId: number }) {
  const { t } = useTranslation();
  const { items, clearFinished } = useUploads();
  if (items.length === 0) return null;
  return (
    <section className="mb-8 flex flex-col gap-3" aria-label={t("uploads.title")}>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text">{t("uploads.title")}</h2>
        {items.some((item) => item.phase === "added") ? (
          <Button variant="ghost" size="sm" onClick={clearFinished}>
            {t("uploads.clear")}
          </Button>
        ) : null}
      </div>
      <div className="grid items-start gap-3 lg:grid-cols-2">
        {items.map((item) => (
          <UploadCard key={item.key} item={item} repositoryId={repositoryId} />
        ))}
      </div>
    </section>
  );
}
