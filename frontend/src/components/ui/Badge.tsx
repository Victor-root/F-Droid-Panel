import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "../../lib/cn";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3.5",
  {
    variants: {
      tone: {
        neutral: "bg-surface-3 text-muted",
        accent: "bg-accent-soft text-accent-soft-text",
        success: "bg-success-soft text-success-text",
        warning: "bg-warning-soft text-warning-text",
        danger: "bg-danger-soft text-danger-text",
        info: "bg-info-soft text-info-text",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>["tone"]>;

export function Badge({ className, tone, ...props }: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

/** A colored dot that pulses while something is running. */
export function StatusDot({ tone, pulse }: { tone: BadgeTone; pulse?: boolean }) {
  const color = {
    neutral: "bg-subtle",
    accent: "bg-accent-strong",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
    info: "bg-info",
  }[tone];
  return (
    <span className="relative inline-flex size-2" aria-hidden="true">
      {pulse ? <span className={cn("absolute inset-0 animate-ping rounded-full opacity-60", color)} /> : null}
      <span className={cn("relative inline-flex size-2 rounded-full", color)} />
    </span>
  );
}
