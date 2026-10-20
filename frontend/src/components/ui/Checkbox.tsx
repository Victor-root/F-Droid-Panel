import { IconCheck } from "@tabler/icons-react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "../../lib/cn";

export function Checkbox({ className, ...props }: ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        "inline-flex size-5 shrink-0 items-center justify-center rounded-md border border-border-strong bg-surface transition-colors",
        "data-[state=checked]:border-accent-strong data-[state=checked]:bg-accent-strong data-[state=checked]:text-surface",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator>
        <IconCheck className="size-3.5" stroke={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
