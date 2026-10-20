import { Link, type LinkProps } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { cn } from "../lib/cn";

interface RouteTab {
  to: LinkProps["to"];
  params?: LinkProps["params"];
  label: ReactNode;
  icon?: ReactNode;
  exact?: boolean;
}

/** Tabs that are links, so every tab has its own address. */
export function RouteTabs({ tabs, label, className }: { tabs: RouteTab[]; label: string; className?: string }) {
  return (
    <nav aria-label={label} className={cn("mb-6 flex gap-1 overflow-x-auto border-b border-border [scrollbar-width:none]", className)}>
      {tabs.map((tab) => (
        <Link
          key={String(tab.to)}
          to={tab.to}
          params={tab.params}
          activeOptions={{ exact: tab.exact ?? false }}
          className={cn(
            "relative -mb-px inline-flex items-center gap-2 border-b-2 border-transparent px-3 py-2.5 text-sm font-medium whitespace-nowrap text-muted",
            "transition-colors hover:text-text data-[status=active]:border-accent-strong data-[status=active]:text-text [&_svg]:size-4",
          )}
        >
          {tab.icon}
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
