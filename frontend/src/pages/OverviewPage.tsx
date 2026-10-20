import { IconApps, IconLock, IconPackages, IconPlus, IconRocket, IconStack2, type Icon } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { meQuery, repositoriesQuery } from "../api/queries";
import type { Repository } from "../api/types";
import { JobStatusBadge } from "../components/jobs/JobStatusBadge";
import { PageHeader } from "../components/PageHeader";
import { RepositoryIcon } from "../components/RepositoryIcon";
import { Badge, StatusDot } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { Skeleton } from "../components/ui/Skeleton";
import { useFormat } from "../lib/format";

function Stat({ icon: StatIcon, label, value }: { icon: Icon; label: string; value: string }) {
  return (
    <Card className="flex items-center gap-4 p-5">
      <span className="flex size-11 items-center justify-center rounded-2xl bg-accent-soft text-accent-soft-text">
        <StatIcon className="size-5" />
      </span>
      <div>
        <div className="text-2xl font-semibold tracking-tight text-text">{value}</div>
        <div className="text-xs text-muted">{label}</div>
      </div>
    </Card>
  );
}

function RepositoryCard({ repository }: { repository: Repository }) {
  const { t } = useTranslation();
  const format = useFormat();
  return (
    <Link
      to="/repositories/$repositoryId"
      params={{ repositoryId: String(repository.id) }}
      className="group flex flex-col rounded-2xl border border-border bg-surface p-5 shadow-soft transition-all hover:-translate-y-0.5 hover:border-accent-strong/60 hover:shadow-raised"
    >
      <div className="flex items-start gap-4">
        <RepositoryIcon repository={repository} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-base font-semibold text-text">{repository.name}</h2>
            {repository.private ? <IconLock className="size-4 shrink-0 text-muted" aria-label={t("repository.private")} /> : null}
          </div>
          <code className="block truncate font-mono text-xs text-muted">{repository.repoUrl}</code>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-surface-2 px-3 py-2.5">
          <div className="text-lg font-semibold text-text">{format.number(repository.apps)}</div>
          <div className="text-xs text-muted">{t("overview.apps")}</div>
        </div>
        <div className="rounded-xl bg-surface-2 px-3 py-2.5">
          <div className="text-lg font-semibold text-text">{format.number(repository.apks)}</div>
          <div className="text-xs text-muted">{t("overview.versions")}</div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {repository.lastJob ? <JobStatusBadge status={repository.lastJob.status} /> : null}
        {repository.pendingChanges > 0 ? (
          <Badge tone="warning">
            <StatusDot tone="warning" />
            {t("repository.pending", { count: repository.pendingChanges })}
          </Badge>
        ) : null}
        <span className="ml-auto text-xs text-muted">
          {repository.publishedAt ? t("repository.publishedAgo", { when: format.relative(repository.publishedAt) }) : t("repository.neverPublished")}
        </span>
      </div>
    </Link>
  );
}

export function OverviewPage() {
  const { t } = useTranslation();
  const format = useFormat();
  const { data: repositories } = useQuery({ ...repositoriesQuery, refetchInterval: 15_000 });
  const { data: me } = useQuery(meQuery);
  const admin = me?.role === "admin";
  const addButton = admin ? (
    <Button asChild>
      <Link to="/repositories/new">
        <IconPlus />
        {t("overview.empty.action")}
      </Link>
    </Button>
  ) : null;

  if (!repositories) {
    return (
      <>
        <PageHeader title={t("overview.title")} description={t("overview.description")} />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </>
    );
  }

  const total = (pick: (repository: Repository) => number) => format.number(repositories.reduce((sum, repository) => sum + pick(repository), 0));

  return (
    <>
      <PageHeader title={t("overview.title")} description={t("overview.description")} actions={repositories.length ? addButton : null} />
      {repositories.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IconPackages />}
            title={t("overview.empty.title")}
            description={admin ? t("overview.empty.description") : t("overview.empty.descriptionMember")}
            action={addButton}
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-8">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat icon={IconPackages} label={t("overview.repositories")} value={format.number(repositories.length)} />
            <Stat icon={IconApps} label={t("overview.apps")} value={total((repository) => repository.apps)} />
            <Stat icon={IconStack2} label={t("overview.versions")} value={total((repository) => repository.apks)} />
            <Stat icon={IconRocket} label={t("overview.pending")} value={total((repository) => repository.pendingChanges)} />
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {repositories.map((repository) => (
              <RepositoryCard key={repository.id} repository={repository} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
