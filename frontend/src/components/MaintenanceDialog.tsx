import { IconCircleCheck, IconCircleX, IconRefresh } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { maintenanceRequestQuery } from "../api/queries";
import type { MaintenanceState } from "../api/types";
import { useErrorText } from "../lib/errors";
import { LogView } from "./LogView";
import { Button } from "./ui/Button";
import { Dialog, DialogContent } from "./ui/Dialog";
import { Spinner } from "./ui/Spinner";

const FINISHED = new Set(["succeeded", "failed"]);

function finished(state: MaintenanceState | undefined): boolean {
  return state !== undefined && FINISHED.has(state.state);
}

interface MaintenanceDialogProps {
  requestId: string | null;
  title: string;
  onClose: () => void;
  onFinished?: (state: MaintenanceState) => void;
  /** After a panel update the page must load the new interface. */
  reloadWhenDone?: boolean;
}

/** Follows a request handled by the root helper; the panel may restart meanwhile, so errors are retried. */
export function MaintenanceDialog({ requestId, title, onClose, onFinished, reloadWhenDone }: MaintenanceDialogProps) {
  const { t } = useTranslation();
  const errors = useErrorText();
  const { data } = useQuery({
    ...maintenanceRequestQuery(requestId ?? ""),
    enabled: requestId !== null,
    retry: true,
    refetchInterval: (query) => (finished(query.state.data) ? false : 1500),
  });
  const notified = useRef<string | null>(null);

  useEffect(() => {
    if (data && finished(data) && requestId && notified.current !== requestId) {
      notified.current = requestId;
      onFinished?.(data);
    }
  }, [data, requestId, onFinished]);

  const done = finished(data);
  return (
    <Dialog open={requestId !== null} onOpenChange={(open) => !open && done && onClose()}>
      <DialogContent size="lg" title={title} description={t("maintenance.description")}>
        <div className="flex flex-col gap-4">
          {!data || !done ? (
            <p className="flex items-center gap-2 text-sm text-muted">
              <Spinner />
              {data?.state === "running" ? t("maintenance.running") : t("maintenance.waiting")}
            </p>
          ) : data.state === "succeeded" ? (
            <p className="flex items-start gap-2 rounded-xl bg-success-soft px-3.5 py-2.5 text-sm text-success-text">
              <IconCircleCheck className="mt-0.5 size-4 shrink-0" />
              {data.code === "up_to_date" ? t("maintenance.upToDate") : t("maintenance.succeeded")}
            </p>
          ) : (
            <p role="alert" className="flex items-start gap-2 rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger-text">
              <IconCircleX className="mt-0.5 size-4 shrink-0" />
              {errors.message(data.code ?? "failed", data.params)}
            </p>
          )}
          <LogView lines={data?.log ?? []} running={!done} label={t("jobs.log")} />
          {done ? (
            <div className="flex justify-end gap-2">
              {reloadWhenDone && data?.state === "succeeded" && data.code !== "up_to_date" ? (
                <Button onClick={() => window.location.reload()}>
                  <IconRefresh />
                  {t("maintenance.reload")}
                </Button>
              ) : (
                <Button variant="secondary" onClick={onClose}>
                  {t("action.close")}
                </Button>
              )}
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
