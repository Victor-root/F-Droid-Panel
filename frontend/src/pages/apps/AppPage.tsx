import { IconArrowLeft, IconHistory, IconId, IconPhoto } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { appQuery, repositoryQuery } from "../../api/queries";
import { AppIcon } from "../../components/AppIcon";
import { Badge, StatusDot } from "../../components/ui/Badge";
import { Card } from "../../components/ui/Card";
import { CopyButton } from "../../components/ui/CopyButton";
import { EmptyState } from "../../components/ui/EmptyState";
import { Skeleton } from "../../components/ui/Skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/Tabs";
import { isApiError } from "../../api/client";
import { useErrorText } from "../../lib/errors";
import { useRepositoryId } from "../repositories/RepositoryLayout";
import { AppDetails } from "./AppDetails";
import { AppListing } from "./AppListing";
import { AppVersions } from "./AppVersions";

export function AppPage() {
  const { t } = useTranslation();
  const errors = useErrorText();
  const repositoryId = useRepositoryId();
  const { packageName } = useParams({ from: "/app/repositories/$repositoryId/apps/$packageName" });
  const { data: repository } = useQuery(repositoryQuery(repositoryId));
  const { data: app, error, dataUpdatedAt } = useQuery(appQuery(repositoryId, packageName));
  const params = { repositoryId: String(repositoryId) };

  const back = (
    <Link
      to="/repositories/$repositoryId/apps"
      params={params}
      className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-text"
    >
      <IconArrowLeft className="size-4" />
      {t("app.back")}
    </Link>
  );

  if (error) {
    return (
      <>
        {back}
        <Card>
          <EmptyState icon={<IconId />} title={isApiError(error, "app_not_found") ? t("app.notFound") : errors.fromError(error)} />
        </Card>
      </>
    );
  }
  if (!app || !repository) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  const canWrite = repository.canWrite;

  return (
    <>
      {back}
      <header className="mb-6 flex min-w-0 items-center gap-4">
        <AppIcon name={app.name} url={app.iconUrl ? `${app.iconUrl}?v=${dataUpdatedAt}` : null} size="xl" className="shadow-soft" />
        <div className="min-w-0">
          <h2 className="truncate text-xl font-semibold tracking-tight text-text">{app.name}</h2>
          <div className="flex min-w-0 items-center gap-1">
            <code className="truncate font-mono text-xs text-muted">{app.packageName}</code>
            <CopyButton value={app.packageName} className="size-7" />
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {app.latestVersionName ? <Badge>{t("uploads.version", { name: app.latestVersionName })}</Badge> : null}
            {app.unpublished > 0 ? (
              <Badge tone="warning">
                <StatusDot tone="warning" />
                {t("apps.unpublished", { count: app.unpublished })}
              </Badge>
            ) : null}
            {app.categories.map((category) => (
              <Badge key={category} tone="accent">
                {category}
              </Badge>
            ))}
          </div>
        </div>
      </header>

      <Tabs defaultValue="listing">
        <TabsList>
          <TabsTrigger value="listing">
            <IconPhoto />
            {t("app.tabs.listing")}
          </TabsTrigger>
          <TabsTrigger value="versions">
            <IconHistory />
            {t("app.tabs.versions")}
          </TabsTrigger>
          <TabsTrigger value="details">
            <IconId />
            {t("app.tabs.details")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="listing" forceMount className="data-[state=inactive]:hidden">
          <AppListing app={app} repositoryId={repositoryId} canWrite={canWrite} version={dataUpdatedAt} />
        </TabsContent>
        <TabsContent value="versions" forceMount className="data-[state=inactive]:hidden">
          <AppVersions app={app} repositoryId={repositoryId} canWrite={canWrite} />
        </TabsContent>
        <TabsContent value="details" forceMount className="data-[state=inactive]:hidden">
          <AppDetails app={app} repositoryId={repositoryId} canWrite={canWrite} />
        </TabsContent>
      </Tabs>
    </>
  );
}
