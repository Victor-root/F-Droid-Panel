import { IconUpload } from "@tabler/icons-react";
import { type DragEvent, type ReactNode, useId, useRef, useState } from "react";

import { cn } from "../../lib/cn";

interface DropZoneProps {
  title: ReactNode;
  description?: ReactNode;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
  className?: string;
}

export function DropZone({ title, description, accept, multiple, disabled, onFiles, className }: DropZoneProps) {
  const input = useRef<HTMLInputElement>(null);
  const descriptionId = useId();
  const [dragging, setDragging] = useState(false);

  const handleDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (!disabled && event.dataTransfer.files.length > 0) {
      onFiles(Array.from(event.dataTransfer.files));
    }
  };

  return (
    <button
      type="button"
      disabled={disabled}
      aria-describedby={description ? descriptionId : undefined}
      onClick={() => input.current?.click()}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={cn(
        "group flex w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border-strong bg-surface px-6 py-10 text-center transition-all",
        "hover:border-accent-strong hover:bg-accent-soft disabled:pointer-events-none disabled:opacity-50",
        dragging && "scale-[1.01] border-accent-strong bg-accent-soft",
        className,
      )}
    >
      <span
        className={cn(
          "flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent-soft-text transition-transform group-hover:-translate-y-0.5",
          dragging && "-translate-y-1",
        )}
      >
        <IconUpload className="size-6" />
      </span>
      <span className="text-sm font-semibold text-text">{title}</span>
      {description ? (
        <span id={descriptionId} className="text-xs text-muted">
          {description}
        </span>
      ) : null}
      <input
        ref={input}
        type="file"
        className="hidden"
        accept={accept}
        multiple={multiple}
        tabIndex={-1}
        onChange={(event) => {
          if (event.target.files?.length) onFiles(Array.from(event.target.files));
          event.target.value = "";
        }}
      />
    </button>
  );
}
