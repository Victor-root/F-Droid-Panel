import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "./Button";
import { Dialog, DialogClose, DialogContent } from "./Dialog";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description: ReactNode;
  confirmLabel: ReactNode;
  onConfirm: () => Promise<void> | void;
  danger?: boolean;
  children?: ReactNode;
}

/** Asks before an action; stays open with a busy button until the action has finished. */
export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, onConfirm, danger, children }: ConfirmDialogProps) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent
        size="sm"
        title={title}
        description={description}
        footer={
          <>
            <DialogClose asChild>
              <Button variant="secondary" disabled={busy}>
                {t("action.cancel")}
              </Button>
            </DialogClose>
            <Button variant={danger ? "danger" : "primary"} loading={busy} onClick={() => void confirm()}>
              {confirmLabel}
            </Button>
          </>
        }
      >
        {children}
      </DialogContent>
    </Dialog>
  );
}
