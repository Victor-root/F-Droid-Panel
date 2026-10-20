import type { ComponentProps, ReactNode } from "react";

import { cn } from "../../lib/cn";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-2xl border border-border bg-surface shadow-soft", className)} {...props} />;
}

interface CardHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function CardHeader({ title, description, actions, className }: CardHeaderProps) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 px-5 pt-5", className)}>
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-text">{title}</h2>
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function CardBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("p-5", className)} {...props} />;
}
