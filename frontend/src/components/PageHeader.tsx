import type { ReactNode } from "react";

import { cn } from "../lib/cn";

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  leading?: ReactNode;
  eyebrow?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, actions, leading, eyebrow, className }: PageHeaderProps) {
  return (
    <header className={cn("mb-8 flex flex-wrap items-start justify-between gap-4", className)}>
      <div className="flex min-w-0 items-center gap-4">
        {leading}
        <div className="min-w-0">
          {eyebrow ? <div className="mb-1 text-xs font-medium text-muted">{eyebrow}</div> : null}
          <h1 className="truncate text-2xl font-semibold tracking-tight text-text">{title}</h1>
          {description ? <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
