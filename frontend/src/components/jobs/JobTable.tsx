import { IconChevronRight } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

import type { Job } from "../../api/types";
import { useFormat } from "../../lib/format";
import { Table, Td, Th, Tr } from "../ui/Table";
import { useJobKindLabel } from "./JobDialog";
import { JobStatusBadge } from "./JobStatusBadge";

export function JobTable({ jobs, onOpen }: { jobs: Job[]; onOpen: (jobId: number) => void }) {
  const { t } = useTranslation();
  const format = useFormat();
  const kindLabel = useJobKindLabel();

  return (
    <Table>
      <thead>
        <tr>
          <Th>{t("jobs.columns.operation")}</Th>
          <Th>{t("jobs.columns.status")}</Th>
          <Th className="hidden sm:table-cell">{t("jobs.columns.by")}</Th>
          <Th className="hidden md:table-cell">{t("jobs.columns.when")}</Th>
          <Th>
            <span className="sr-only">{t("jobs.log")}</span>
          </Th>
        </tr>
      </thead>
      <tbody>
        {jobs.map((job) => (
          <Tr key={job.id} className="cursor-pointer" onClick={() => onOpen(job.id)}>
            <Td className="font-medium">{kindLabel(job.kind)}</Td>
            <Td>
              <JobStatusBadge status={job.status} />
            </Td>
            <Td className="hidden text-muted sm:table-cell">{job.createdBy ?? t("jobs.system")}</Td>
            <Td className="hidden text-muted md:table-cell" title={format.dateTime(job.createdAt)}>
              {format.relative(job.createdAt)}
            </Td>
            <Td className="text-right">
              <button
                type="button"
                className="rounded-lg p-1 text-muted hover:bg-surface-3 hover:text-text"
                aria-label={t("jobs.open")}
                onClick={(event) => {
                  event.stopPropagation();
                  onOpen(job.id);
                }}
              >
                <IconChevronRight className="size-4" />
              </button>
            </Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}
