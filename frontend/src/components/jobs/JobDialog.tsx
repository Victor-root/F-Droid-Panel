import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { jobQuery } from "../../api/queries";
import { useErrorText } from "../../lib/errors";
import { useFormat } from "../../lib/format";
import { JOB_KIND_LABELS, labelKey } from "../../lib/labels";
import { Dialog, DialogContent } from "../ui/Dialog";
import { JobLog } from "./JobLog";
import { JobStatusBadge } from "./JobStatusBadge";

export function useJobKindLabel() {
  const { t } = useTranslation();
  return (kind: string) => {
    const key = labelKey(JOB_KIND_LABELS, kind);
    return key ? t(key) : kind;
  };
}

export function JobDialog({ jobId, onClose }: { jobId: number | null; onClose: () => void }) {
  const { t } = useTranslation();
  const format = useFormat();
  const errors = useErrorText();
  const kindLabel = useJobKindLabel();
  const { data: job } = useQuery({ ...jobQuery(jobId ?? 0), enabled: jobId !== null, refetchInterval: (query) => (query.state.data?.finishedAt ? false : 2000) });

  return (
    <Dialog open={jobId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        size="lg"
        title={job ? kindLabel(job.kind) : t("jobs.log")}
        description={job ? t("jobs.startedBy", { who: job.createdBy ?? t("jobs.system"), when: format.dateTime(job.createdAt) }) : undefined}
      >
        {job ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <JobStatusBadge status={job.status} />
              {job.startedAt && job.finishedAt ? (
                <span className="text-xs text-muted">{t("jobs.took", { duration: format.duration(job.startedAt, job.finishedAt) })}</span>
              ) : null}
            </div>
            {job.error ? (
              <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger-text">
                {errors.message(job.error.code, job.error.params)}
              </p>
            ) : null}
            <JobLog jobId={job.id} />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
