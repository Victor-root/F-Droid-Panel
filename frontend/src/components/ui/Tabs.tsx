import { Tabs as TabsPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "../../lib/cn";

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn("flex gap-1 overflow-x-auto border-b border-border [scrollbar-width:none]", className)}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "relative -mb-px inline-flex items-center gap-2 border-b-2 border-transparent px-3 py-2.5 text-sm font-medium whitespace-nowrap text-muted",
        "transition-colors hover:text-text data-[state=active]:border-accent-strong data-[state=active]:text-text [&_svg]:size-4",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn("pt-6 focus-visible:outline-none", className)} {...props} />;
}
