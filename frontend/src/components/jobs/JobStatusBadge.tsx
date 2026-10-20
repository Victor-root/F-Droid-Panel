import { useTranslation } from "react-i18next";

import type { JobStatus } from "../../api/types";
import { JOB_STATUS_LABELS, JOB_STATUS_TONES } from "../../lib/labels";
import { Badge, StatusDot } from "../ui/Badge";

export function JobStatusBadge({ status }: { status: JobStatus }) {
  const { t } = useTranslation();
  const tone = JOB_STATUS_TONES[status];
  return (
    <Badge tone={tone}>
      <StatusDot tone={tone} pulse={status === "running" || status === "queued"} />
      {t(JOB_STATUS_LABELS[status])}
    </Badge>
  );
}
