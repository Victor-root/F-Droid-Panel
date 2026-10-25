import { IconAlertTriangle, IconArrowBackUp, IconCircleCheck, IconRocket } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { api } from "../api/client";
import { jobQuery, repositoryQuery } from "../api/queries";
import type { PublishResult, RepositoryDetail } from "../api/types";
import { useErrorText } from "../lib/errors";
import { useFormat } from "../lib/format";
import { CHANGE_KIND_LABELS, LEFT_OUT_LABELS, labelKey } from "../lib/labels";
import { JobLog } from "./jobs/JobLog";
import { Button } from "./ui/Button";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { Dialog, DialogClose, DialogContent } from "./ui/Dialog";
import { toast } from "./ui/Toast";

function Result({ result }: { result: PublishResult }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3 rounded-xl bg-success-soft p-3.5 text-sm text-success-text">
        <IconCircleCheck className="mt-0.5 size-5 shrink-0" />
        <span>{t("publish.success", { apps: result.apps, versions: result.versions })}</span>
      </div>
      {result.leftOut.length > 0 ? (
        <div className="rounded-xl bg-warning-soft p-3.5 text-sm text-warning-text">
          <div className="flex items-center gap-2 font-medium">
            <IconAlertTriangle className="size-5 shrink-0" />
            {t("publish.leftOut", { count: result.leftOut.length })}
          </div>
          <ul className="mt-2 space-y-1 pl-7">
            {result.leftOut.map((item) => {
              const key = labelKey(LEFT_OUT_LABELS, item.reason);
              return (
                <li key={item.file}>
                  <code className="font-mono text-xs">{item.file}</code>: {key ? t(key) : item.reason}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function PublishDialog({ repository, open, onOpenChange }: { repository: RepositoryDetail; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation();
  const format = useFormat();
  const errors = useErrorText();
  const queryClient = useQueryClient();
  const [jobId, setJobId] = useState<number | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const publish = useMutation({
    mutationFn: () => api<{ jobId: number }>(`/repositories/${repository.id}/publish`, { method: "POST" }),
    onSuccess: ({ jobId: started }) => setJobId(started),
  });
  const { data: job } = useQuery({
    ...jobQuery(jobId ?? 0),
    enabled: jobId !== null,
    refetchInterval: (query) => (query.state.data?.finishedAt ? false : 1000),
  });
  const finishedAt = job?.finishedAt;
  useEffect(() => {
    if (finishedAt) void queryClient.invalidateQueries({ queryKey: ["repositories"] });
  }, [finishedAt, queryClient]);

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setJobId(null);
      publish.reset();
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        size="lg"
        title={t("publish.title", { name: repository.name })}
        description={t("publish.description")}
        footer={
          jobId === null ? (
            <>
              {repository.changes.length > 0 ? (
                <Button variant="ghost" className="mr-auto text-danger-text" onClick={() => setDiscarding(true)}>
                  <IconArrowBackUp />
                  {t("publish.discard")}
                </Button>
              ) : null}
              <DialogClose asChild>
                <Button variant="secondary">{t("action.cancel")}</Button>
              </DialogClose>
              <Button loading={publish.isPending} onClick={() => publish.mutate()}>
                <IconRocket />
                {t("publish.submit")}
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={() => close(false)} disabled={!job?.finishedAt}>
              {t("action.close")}
            </Button>
          )
        }
      >
        {jobId === null ? (
          repository.changes.length > 0 ? (
            <div>
              <p className="mb-3 text-sm font-medium text-text">{t("publish.pending", { count: repository.changes.length })}</p>
              <ul className="divide-y divide-border rounded-xl border border-border">
                {repository.changes.map((change, index) => {
                  const key = labelKey(CHANGE_KIND_LABELS, change.kind);
                  return (
                    <li key={index} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm">
                      <span className="min-w-0 truncate text-text">
                        {key ? t(key) : change.kind}
                        {change.target ? <span className="text-muted"> · {change.target}</span> : null}
                      </span>
                      <span className="shrink-0 text-xs text-muted">
                        {change.username ?? t("jobs.system")} · {format.relative(change.at)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-muted">{t("publish.nothingPending")}</p>
          )
        ) : (
          <div className="flex flex-col gap-4">
            {job?.status === "succeeded" && job.result ? <Result result={job.result as unknown as PublishResult} /> : null}
            {job?.error ? (
              <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger-text">
                {errors.message(job.error.code, job.error.params)}
              </p>
            ) : null}
            <JobLog jobId={jobId} />
          </div>
        )}
      </DialogContent>
      <ConfirmDialog
        open={discarding}
        onOpenChange={setDiscarding}
        danger
        title={t("publish.discardTitle", { count: repository.changes.length })}
        description={t("publish.discardDescription")}
        confirmLabel={t("publish.discardConfirm")}
        onConfirm={async () => {
          try {
            const updated = await api<RepositoryDetail>(`/repositories/${repository.id}/discard`, { method: "POST" });
            queryClient.setQueryData(repositoryQuery(repository.id).queryKey, updated);
            await queryClient.invalidateQueries({ queryKey: ["repositories"] });
            toast.success(t("publish.discarded"));
            close(false);
          } catch (error) {
            toast.error(errors.fromError(error));
          }
        }}
      />
    </Dialog>
  );
}
