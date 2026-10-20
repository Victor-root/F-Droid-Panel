import { IconAlertTriangle, IconCircleCheck, IconInfoCircle, IconX } from "@tabler/icons-react";
import { Toast as ToastPrimitive } from "radix-ui";
import { type ReactNode, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "../../lib/cn";

type ToastTone = "success" | "error" | "info";

interface ToastItem {
  id: number;
  tone: ToastTone;
  title: ReactNode;
  description?: ReactNode;
}

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit(next: ToastItem[]) {
  items = next;
  for (const listener of listeners) listener();
}

function push(tone: ToastTone, title: ReactNode, description?: ReactNode) {
  emit([...items, { id: nextId++, tone, title, description }]);
}

export const toast = {
  success: (title: ReactNode, description?: ReactNode) => push("success", title, description),
  error: (title: ReactNode, description?: ReactNode) => push("error", title, description),
  info: (title: ReactNode, description?: ReactNode) => push("info", title, description),
};

const ICONS = {
  success: <IconCircleCheck className="text-success" />,
  error: <IconAlertTriangle className="text-danger" />,
  info: <IconInfoCircle className="text-info" />,
};

export function Toaster() {
  const { t } = useTranslation();
  const current = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => items,
  );

  return (
    <ToastPrimitive.Provider swipeDirection="right" duration={6000}>
      {current.map((item) => (
        <ToastPrimitive.Root
          key={item.id}
          type={item.tone === "error" ? "foreground" : "background"}
          duration={item.tone === "error" ? 10000 : undefined}
          onOpenChange={(open) => {
            if (!open) emit(items.filter((other) => other.id !== item.id));
          }}
          className={cn(
            "flex items-start gap-3 rounded-2xl border border-border bg-surface p-4 shadow-raised animate-toast-in",
            "data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=end]:opacity-0 [&>svg]:mt-0.5 [&>svg]:size-5 [&>svg]:shrink-0",
          )}
        >
          {ICONS[item.tone]}
          <div className="min-w-0 flex-1">
            <ToastPrimitive.Title className="text-sm font-semibold text-text">{item.title}</ToastPrimitive.Title>
            {item.description ? (
              <ToastPrimitive.Description className="mt-0.5 text-sm text-muted">{item.description}</ToastPrimitive.Description>
            ) : null}
          </div>
          <ToastPrimitive.Close className="rounded-md p-0.5 text-muted hover:bg-surface-2 hover:text-text" aria-label={t("action.close")}>
            <IconX className="size-4" />
          </ToastPrimitive.Close>
        </ToastPrimitive.Root>
      ))}
      <ToastPrimitive.Viewport className="fixed right-0 bottom-0 z-[60] flex w-full max-w-sm flex-col gap-2 p-4 outline-none" />
    </ToastPrimitive.Provider>
  );
}
