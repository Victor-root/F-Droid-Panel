import { IconX } from "@tabler/icons-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "../../lib/cn";
import { Button } from "./Button";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

const overlay = "fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] animate-fade-in";

interface DialogContentProps {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function DialogContent({ title, description, children, footer, size = "md", className }: DialogContentProps) {
  const { t } = useTranslation();
  const width = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl" }[size];
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlay} />
      <DialogPrimitive.Content
        className={cn(
          "fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col",
          "rounded-2xl border border-border bg-surface shadow-raised animate-scale-in focus:outline-none",
          width,
          className,
        )}
        {...(description ? {} : { "aria-describedby": undefined })}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-6">
          <div className="min-w-0">
            <DialogPrimitive.Title className="text-lg font-semibold text-text">{title}</DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-1 text-sm text-muted">{description}</DialogPrimitive.Description>
            ) : null}
          </div>
          <DialogPrimitive.Close asChild>
            <Button variant="ghost" size="icon-sm" aria-label={t("action.close")} className="-mt-1 -mr-2">
              <IconX />
            </Button>
          </DialogPrimitive.Close>
        </div>
        {children ? <div className="min-h-0 overflow-y-auto px-6 py-5">{children}</div> : <div className="h-5" />}
        {footer ? (
          <div className="flex flex-wrap justify-end gap-2 border-t border-border px-6 py-4">{footer}</div>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

interface SheetContentProps {
  title: ReactNode;
  children: ReactNode;
}

/** A panel sliding from the left edge, used for navigation on small screens. */
export function SheetContent({ title, children }: SheetContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlay} />
      <DialogPrimitive.Content
        aria-describedby={undefined}
        className="fixed inset-y-0 left-0 z-50 flex w-[min(20rem,85vw)] flex-col bg-surface shadow-raised animate-slide-in-left focus:outline-none"
      >
        <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
