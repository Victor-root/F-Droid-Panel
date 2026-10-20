import type { ReactNode } from "react";

import { cn } from "../../lib/cn";

interface EmptyStateProps {
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-14 text-center", className)}>
      <div className="relative mb-5">
        <div className="absolute inset-0 scale-150 rounded-full bg-accent-soft blur-2xl" aria-hidden="true" />
        <div className="relative flex size-14 items-center justify-center overflow-hidden rounded-2xl bg-accent text-accent-contrast shadow-raised [&_svg]:relative [&_svg]:size-7">
          <span className="absolute inset-0 bg-gradient-to-br from-white/35 to-transparent" aria-hidden="true" />
          {icon}
        </div>
      </div>
      <h3 className="text-base font-semibold text-text">{title}</h3>
      {description ? <p className="mt-1.5 max-w-md text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-6 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}
