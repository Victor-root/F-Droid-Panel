import { Label as LabelPrimitive } from "radix-ui";
import { type ComponentProps, type ReactNode, useId } from "react";

import { cn } from "../../lib/cn";

const control = [
  "w-full rounded-xl border border-border bg-surface px-3.5 text-sm text-text shadow-soft",
  "placeholder:text-subtle transition-[border-color,box-shadow] duration-150",
  "hover:border-border-strong focus-visible:border-accent-strong focus-visible:outline-none",
  "focus-visible:ring-4 focus-visible:ring-accent-soft-hover disabled:cursor-not-allowed disabled:opacity-60",
  "aria-invalid:border-danger aria-invalid:focus-visible:ring-danger-soft",
];

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, "h-10", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-24 py-2.5 leading-relaxed", className)} {...props} />;
}

export function Label({ className, ...props }: ComponentProps<typeof LabelPrimitive.Root>) {
  return <LabelPrimitive.Root className={cn("text-sm font-medium text-text", className)} {...props} />;
}

interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  children: (props: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean }) => ReactNode;
}

/** Label, control, hint and error wired together for assistive technologies. */
export function Field({ label, hint, error, className, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {hint ? (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs font-medium text-danger-text" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
