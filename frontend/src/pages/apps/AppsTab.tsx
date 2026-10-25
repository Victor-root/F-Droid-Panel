import { IconApps, IconDownload, IconSearch, IconUpload } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { appsQuery, repositoryQuery } from "../../api/queries";
import type { AppSummary } from "../../api/types";
import { AppIcon } from "../../components/AppIcon";
import { Badge, StatusDot } from "../../components/ui/Badge";
import { buttonVariants } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { DropZone } from "../../components/ui/DropZone";
import { EmptyState } from "../../components/ui/EmptyState";
import { Input } from "../../components/ui/Field";
import { Skeleton } from "../../components/ui/Skeleton";
import { DropOverlay } from "../../components/uploads/DropOverlay";
import { useUploads } from "../../components/uploads/UploadContext";
import { UploadTray } from "../../components/uploads/UploadTray";
import { cn } from "../../lib/cn";
import { useFormat } from "../../lib/format";
import { useRepositoryId } from "../repositories/RepositoryLayout";

function AppCard({ app, repositoryId }: { app: AppSummary; repositoryId: number }) {
  const { t } = useTranslation();
  const format = useFormat();
  return (
    <Link
      to="/repositories/$repositoryId/apps/$packageName"
      params={{ repositoryId: String(repositoryId), packageName: app.packageName }}
      className="group flex gap-4 rounded-2xl border border-border bg-surface p-4 shadow-soft transition-all hover:-translate-y-0.5 hover:border-accent-strong/60 hover:shadow-raised"
    >
      <AppIcon name={app.name} url={app.iconUrl} size="xl" className="transition-transform group-hover:scale-105" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold text-text">{app.name}</div>
        <div className="truncate font-mono text-xs text-muted">{app.packageName}</div>
        {app.summary ? <p className="mt-1.5 line-clamp-2 text-sm text-muted">{app.summary}</p> : null}
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {app.latestVersionName ? <Badge>{t("uploads.version", { name: app.latestVersionName })}</Badge> : null}
          {app.unpublished > 0 ? (
            <Badge tone="warning">
              <StatusDot tone="warning" />
              {t("apps.unpublished", { count: app.unpublished })}
            </Badge>
          ) : null}
          {app.versions === 0 ? <Badge tone="danger">{t("apps.noVersion")}</Badge> : null}
          {app.downloads ? (
            <Badge>
              <IconDownload aria-hidden="true" />
              {t("apps.downloads", { count: app.downloads, number: format.number(app.downloads) })}
            </Badge>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

export function AppsTab() {
  const { t } = useTranslation();
  const repositoryId = useRepositoryId();
  const { data: apps } = useQuery(appsQuery(repositoryId));
  const { data: repository } = useQuery(repositoryQuery(repositoryId));
  const { addFiles } = useUploads();
  const [search, setSearch] = useState("");
  const canWrite = repository?.canWrite ?? false;

  const needle = search.trim().toLowerCase();
  const visible = apps?.filter(
    (app) => !needle || app.name.toLowerCase().includes(needle) || app.packageName.toLowerCase().includes(needle),
  );

  return (
    <>
      {canWrite ? (
        <>
          <DropOverlay onFiles={addFiles} />
          <UploadTray repositoryId={repositoryId} />
        </>
      ) : null}
      {apps === undefined ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-28" />
          ))}
        </div>
      ) : apps.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IconApps />}
            title={t("apps.emptyTitle")}
            description={canWrite ? t("apps.emptyDescription") : t("apps.emptyReadOnly")}
            action={
              canWrite ? (
                <DropZone className="mt-2 w-full max-w-md" title={t("apps.drop")} description={t("apps.dropHint")} accept=".apk" multiple onFiles={addFiles} />
              ) : null
            }
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-60 flex-1">
              <IconSearch className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
              <Input aria-label={t("apps.search")} placeholder={t("apps.search")} className="pl-10" value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
            {canWrite ? (
              <label className={cn(buttonVariants(), "cursor-pointer")}>
                <IconUpload className="size-4" />
                {t("apps.add")}
                <input type="file" accept=".apk" multiple className="sr-only" onChange={(event) => {
                  if (event.target.files?.length) addFiles(Array.from(event.target.files));
                  event.target.value = "";
                }} />
              </label>
            ) : null}
          </div>
          {visible?.length ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visible.map((app) => (
                <AppCard key={app.packageName} app={app} repositoryId={repositoryId} />
              ))}
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-muted">{t("apps.noMatch")}</p>
          )}
          {canWrite ? <p className="text-center text-xs text-muted">{t("apps.dropAnywhere")}</p> : null}
        </div>
      )}
    </>
  );
}
