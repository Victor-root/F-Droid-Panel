import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { LogView } from "../LogView";

/** Live log of a job, streamed from the server; stays readable after the job ended. */
export function JobLog({ jobId, className }: { jobId: number; className?: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [lines, setLines] = useState<string[]>([]);
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    const source = new EventSource(`/admin/api/jobs/${jobId}/stream`);
    source.addEventListener("line", (event) => setLines((current) => [...current, (event as MessageEvent<string>).data]));
    source.addEventListener("end", () => {
      source.close();
      setEnded(true);
      void queryClient.invalidateQueries({ queryKey: ["jobs"] });
    });
    source.onerror = () => {
      source.close();
      setEnded(true);
    };
    return () => {
      source.close();
      setLines([]);
      setEnded(false);
    };
  }, [jobId, queryClient]);

  return <LogView lines={lines} running={!ended} label={t("jobs.log")} className={className} />;
}
