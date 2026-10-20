import { IconUpload } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

function carriesFiles(event: DragEvent): boolean {
  return event.dataTransfer?.types.includes("Files") ?? false;
}

/** Lets files be dropped anywhere on the page, with a full screen hint while they are dragged over it. */
export function DropOverlay({ onFiles }: { onFiles: (files: File[]) => void }) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const depth = useRef(0);

  useEffect(() => {
    const enter = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      depth.current += 1;
      setVisible(true);
    };
    const leave = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setVisible(false);
    };
    const over = (event: DragEvent) => {
      if (carriesFiles(event)) event.preventDefault();
    };
    const drop = (event: DragEvent) => {
      depth.current = 0;
      setVisible(false);
      // Drop zones inside the page handle their own files.
      if (!carriesFiles(event) || event.defaultPrevented) return;
      event.preventDefault();
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (files.length > 0) onFiles(files);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, [onFiles]);

  if (!visible) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-bg/70 p-6 backdrop-blur-sm animate-fade-in">
      <div className="flex w-full max-w-lg flex-col items-center gap-4 rounded-3xl border-2 border-dashed border-accent-strong bg-surface px-8 py-14 text-center shadow-raised animate-scale-in">
        <span className="flex size-16 items-center justify-center rounded-2xl bg-accent-soft text-accent-soft-text">
          <IconUpload className="size-8" />
        </span>
        <span className="text-lg font-semibold text-text">{t("apps.dropOverlay")}</span>
        <span className="text-sm text-muted">{t("apps.dropHint")}</span>
      </div>
    </div>
  );
}
