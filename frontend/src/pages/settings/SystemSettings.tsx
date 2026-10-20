import { IconAlertTriangle, IconCircleCheck, IconDownload, IconPlayerPlay, IconRefresh, IconTool } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";

import { api } from "../../api/client";
import { maintenanceQuery, systemQuery } from "../../api/queries";
import type { MaintenanceAction, MaintenanceInfo } from "../../api/types";
import { useReauth } from "../../app/Reauth";
import { JobDialog } from "../../components/jobs/JobDialog";
import { MaintenanceDialog } from "../../components/MaintenanceDialog";
import { JobStatusBadge } from "../../components/jobs/JobStatusBadge";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { Progress } from "../../components/ui/Progress";
import { Skeleton } from "../../components/ui/Skeleton";
import { toast } from "../../components/ui/Toast";
import { useErrorText } from "../../lib/errors";
import { useFormat } from "../../lib/format";

function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:gap-4">
      <dt className="w-48 shrink-0 text-sm text-muted">{label}</dt>
      <dd className="min-w-0 text-sm text-text">{children}</dd>
    </div>
  );
}

const ACTION_TITLES = {
  check: "maintenance.check",
  update: "maintenance.update",
  "update-fdroidserver": "maintenance.reinstallFdroid",
} as const;

function shortCommit(commit: string): string {
  return commit.slice(0, 7);
}

function UpdatesCard({ info }: { info: MaintenanceInfo }) {
  const { t } = useTranslation();
  const format = useFormat();
  const errors = useErrorText();
  const queryClient = useQueryClient();
  const withReauth = useReauth();
  const [running, setRunning] = useState<{ id: string; action: Exclude<MaintenanceAction, "grant"> } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const { installed, latest } = info;

  const start = async (action: Exclude<MaintenanceAction, "grant">) => {
    try {
      const request = () => api<{ id: string }>("/system/maintenance", { method: "POST", body: { action } });
      const { id } = action === "check" ? await request() : await withReauth(request);
      setRunning({ id, action });
    } catch (error) {
      toast.error(errors.fromError(error));
    }
  };

  return (
    <Card>
      <CardHeader
        title={t("maintenance.title")}
        description={info.available ? t("maintenance.cardDescription") : t("maintenance.unavailable")}
        actions={
          info.available ? (
            <Button variant="secondary" onClick={() => void start("check")}>
              <IconRefresh />
              {t("maintenance.check")}
            </Button>
          ) : null
        }
      />
      {info.available && installed ? (
        <CardBody>
          <dl className="divide-y divide-border">
            <Row label={t("maintenance.installed")}>
              <span className="inline-flex flex-wrap items-center gap-2">
                <span className="font-mono">{installed.version}</span>
                <Badge>{installed.channel === "edge" ? t("maintenance.channelEdge") : t("maintenance.channelStable")}</Badge>
                <code className="font-mono text-xs text-muted">{shortCommit(installed.commit)}</code>
              </span>
            </Row>
            <Row label={t("maintenance.latest")}>
              {latest ? (
                <span className="inline-flex flex-wrap items-center gap-2">
                  <span className="font-mono">{latest.version}</span>
                  <code className="font-mono text-xs text-muted">{shortCommit(latest.commit)}</code>
                  {latest.newer ? <Badge tone="accent">{t("maintenance.available")}</Badge> : <Badge tone="success">{t("maintenance.current")}</Badge>}
                  <span className="text-xs text-muted">{t("maintenance.checked", { when: format.relative(latest.checkedAt) })}</span>
                </span>
              ) : (
                <span className="text-muted">{t("maintenance.neverChecked")}</span>
              )}
            </Row>
            <Row label={t("maintenance.fdroidserver")}>
              <span className="inline-flex flex-wrap items-center gap-3">
                <span className="font-mono">{installed.fdroidserver || "?"}</span>
                <Button variant="ghost" size="sm" onClick={() => void start("update-fdroidserver")}>
                  <IconTool />
                  {t("maintenance.reinstallFdroid")}
                </Button>
              </span>
            </Row>
          </dl>
          {latest?.newer ? (
            <div className="mt-4">
              <Button onClick={() => setConfirming(true)}>
                <IconDownload />
                {t("maintenance.updateTo", { version: `${latest.version} (${shortCommit(latest.commit)})` })}
              </Button>
            </div>
          ) : null}
        </CardBody>
      ) : null}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t("maintenance.confirmTitle")}
        description={t("maintenance.confirmDescription")}
        confirmLabel={t("maintenance.update")}
        onConfirm={() => start("update")}
      />
      <MaintenanceDialog
        requestId={running?.id ?? null}
        title={running ? t(ACTION_TITLES[running.action]) : ""}
        reloadWhenDone={running?.action === "update"}
        onClose={() => setRunning(null)}
        onFinished={() => void queryClient.invalidateQueries({ queryKey: ["system"] })}
      />
    </Card>
  );
}

export function SystemSettings() {
  const { t } = useTranslation();
  const format = useFormat();
  const errors = useErrorText();
  const queryClient = useQueryClient();
  const { data: maintenance } = useQuery(maintenanceQuery);
  const { data: system } = useQuery({
    ...systemQuery,
    refetchInterval: (query) => (query.state.data?.selfTest?.finishedAt === null ? 2000 : false),
  });
  const [openJob, setOpenJob] = useState<number | null>(null);
  const run = useMutation({
    mutationFn: () => api<{ jobId: number }>("/system/self-test", { method: "POST" }),
    onSuccess: async ({ jobId }) => {
      await queryClient.invalidateQueries({ queryKey: systemQuery.queryKey });
      setOpenJob(jobId);
    },
  });

  if (!system) return <Skeleton className="h-64" />;
  const { fdroid, selfTest, disk } = system;
  const usedPercent = disk.total ? ((disk.total - disk.free) / disk.total) * 100 : 0;

  return (
    <div className="grid gap-6">
      {maintenance ? <UpdatesCard info={maintenance} /> : null}
      <Card>
        <CardHeader
          title={t("system.fdroid.title")}
          description={t("system.fdroid.description")}
          actions={
            <Button variant="secondary" loading={run.isPending} onClick={() => run.mutate()}>
              <IconPlayerPlay />
              {t("system.selfTest.run")}
            </Button>
          }
        />
        <CardBody>
          <dl className="divide-y divide-border">
            <Row label={t("system.fdroid.version")}>
              {fdroid.version ? (
                <span className="inline-flex flex-wrap items-center gap-2">
                  <span className="font-mono">{fdroid.version}</span>
                  {fdroid.supported ? (
                    <Badge tone="success">
                      <IconCircleCheck />
                      {t("system.fdroid.supported")}
                    </Badge>
                  ) : (
                    <Badge tone="warning">
                      <IconAlertTriangle />
                      {t("system.fdroid.tooOld", { minimum: fdroid.minimumVersion })}
                    </Badge>
                  )}
                </span>
              ) : (
                <Badge tone="danger">{errors.message(`fdroid_${fdroid.error ?? "not_runnable"}`, { command: fdroid.command })}</Badge>
              )}
            </Row>
            <Row label={t("system.fdroid.command")}>
              <code className="font-mono text-xs break-all">{fdroid.command}</code>
            </Row>
            <Row label={t("system.selfTest.title")}>
              {selfTest ? (
                <button type="button" className="inline-flex flex-wrap items-center gap-2 text-left" onClick={() => setOpenJob(selfTest.id)}>
                  <JobStatusBadge status={selfTest.status} />
                  <span className="text-xs text-muted underline-offset-2 hover:underline">{format.relative(selfTest.createdAt)}</span>
                </button>
              ) : (
                <span className="text-muted">{t("system.selfTest.never")}</span>
              )}
            </Row>
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("system.server.title")} />
        <CardBody>
          <dl className="divide-y divide-border">
            <Row label={t("system.server.panelVersion")}>
              <span className="font-mono">{system.version}</span>
            </Row>
            <Row label={t("system.server.python")}>
              <span className="font-mono">{system.python}</span>
            </Row>
            <Row label={t("system.server.disk")}>
              <div className="flex w-full max-w-sm flex-col gap-1.5">
                <Progress value={usedPercent} label={t("system.server.disk")} />
                <span className="text-xs text-muted">{t("system.server.diskFree", { free: format.bytes(disk.free), total: format.bytes(disk.total) })}</span>
              </div>
            </Row>
          </dl>
        </CardBody>
      </Card>
      <JobDialog jobId={openJob} onClose={() => setOpenJob(null)} />
    </div>
  );
}
