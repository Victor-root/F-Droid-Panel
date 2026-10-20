import { Switch as SwitchPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "../../lib/cn";

export function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent bg-border-strong transition-colors",
        "data-[state=checked]:bg-accent-strong disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-5 rounded-full bg-white shadow-soft transition-transform data-[state=checked]:translate-x-5" />
    </SwitchPrimitive.Root>
  );
}
