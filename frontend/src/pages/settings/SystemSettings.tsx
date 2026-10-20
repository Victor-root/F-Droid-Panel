import { IconAlertTriangle, IconCircleCheck, IconPlayerPlay } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";

import { api } from "../../api/client";
import { systemQuery } from "../../api/queries";
import { JobDialog } from "../../components/jobs/JobDialog";
import { JobStatusBadge } from "../../components/jobs/JobStatusBadge";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import { Progress } from "../../components/ui/Progress";
import { Skeleton } from "../../components/ui/Skeleton";
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

export function SystemSettings() {
  const { t } = useTranslation();
  const format = useFormat();
  const errors = useErrorText();
  const queryClient = useQueryClient();
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
