import type { ComponentProps } from "react";

import { cn } from "../../lib/cn";

export function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full border-collapse text-left text-sm", className)} {...props} />
    </div>
  );
}

export function Th({ className, ...props }: ComponentProps<"th">) {
  return (
    <th
      className={cn("border-b border-border px-4 py-2.5 text-xs font-medium tracking-wide whitespace-nowrap text-muted uppercase", className)}
      {...props}
    />
  );
}

export function Td({ className, ...props }: ComponentProps<"td">) {
  return <td className={cn("border-b border-border px-4 py-3 align-middle text-text", className)} {...props} />;
}

export function Tr({ className, ...props }: ComponentProps<"tr">) {
  return <tr className={cn("transition-colors hover:bg-surface-2 [&:last-child>td]:border-b-0", className)} {...props} />;
}
