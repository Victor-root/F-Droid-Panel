import { IconActivity, IconApps, IconLock, IconRocket, IconSettings, IconShare, IconUsersGroup } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { Outlet, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { meQuery, repositoryQuery } from "../../api/queries";
import { PublishDialog } from "../../components/PublishDialog";
import { RepositoryIcon } from "../../components/RepositoryIcon";
import { RouteTabs } from "../../components/RouteTabs";
import { Badge, StatusDot } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { CopyButton } from "../../components/ui/CopyButton";
import { Skeleton } from "../../components/ui/Skeleton";
import { UploadProvider } from "../../components/uploads/UploadContext";
import { useFormat } from "../../lib/format";

export function useRepositoryId(): number {
  const { repositoryId } = useParams({ strict: false });
  return Number(repositoryId);
}

export function RepositoryLayout() {
  const { t } = useTranslation();
  const format = useFormat();
  const repositoryId = useRepositoryId();
  const { data: repository } = useQuery({ ...repositoryQuery(repositoryId), refetchInterval: 10_000 });
  const { data: me } = useQuery(meQuery);
  const [publishing, setPublishing] = useState(false);

  if (!repository) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20" />
        <Skeleton className="h-10 w-2/3" />
      </div>
    );
  }
  const params = { repositoryId: String(repositoryId) };
  const admin = me?.role === "admin";

  return (
    <UploadProvider key={repositoryId} repositoryId={repositoryId}>
      <header className="mb-8 flex flex-wrap items-start justify-between gap-5">
        <div className="flex min-w-0 items-center gap-4">
          <RepositoryIcon repository={repository} size="xl" className="shadow-soft" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-semibold tracking-tight text-text">{repository.name}</h1>
              {repository.private ? (
                <Badge tone="info">
                  <IconLock />
                  {t("repository.private")}
                </Badge>
              ) : null}
            </div>
            <div className="mt-1 flex min-w-0 items-center gap-1 text-sm text-muted">
              <code className="truncate font-mono text-xs">{repository.repoUrl}</code>
              <CopyButton value={repository.repoUrl} className="size-7" />
            </div>
            <div className="mt-1 text-xs text-muted">
              {repository.publishedAt ? t("repository.publishedAgo", { when: format.relative(repository.publishedAt) }) : t("repository.neverPublished")}
            </div>
          </div>
        </div>
        {repository.canWrite ? (
          <div className="flex items-center gap-3">
            {repository.pendingChanges > 0 ? (
              <Badge tone="warning">
                <StatusDot tone="warning" pulse />
                {t("repository.pending", { count: repository.pendingChanges })}
              </Badge>
            ) : null}
            <Button size="lg" onClick={() => setPublishing(true)}>
              <IconRocket />
              {t("publish.button")}
            </Button>
          </div>
        ) : null}
      </header>

      <RouteTabs
        label={repository.name}
        tabs={[
          { to: "/repositories/$repositoryId/apps", params, label: t("repository.tabs.apps"), icon: <IconApps /> },
          { to: "/repositories/$repositoryId/activity", params, label: t("repository.tabs.activity"), icon: <IconActivity /> },
          { to: "/repositories/$repositoryId/share", params, label: t("repository.tabs.share"), icon: <IconShare /> },
          ...(admin
            ? [{ to: "/repositories/$repositoryId/access" as const, params, label: t("repository.tabs.access"), icon: <IconUsersGroup /> }]
            : []),
          { to: "/repositories/$repositoryId/settings", params, label: t("repository.tabs.settings"), icon: <IconSettings /> },
        ]}
      />
      <Outlet />
      <PublishDialog repository={repository} open={publishing} onOpenChange={setPublishing} />
    </UploadProvider>
  );
}
