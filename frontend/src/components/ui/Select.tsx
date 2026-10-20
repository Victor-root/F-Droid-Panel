import { IconCheck, IconChevronDown } from "@tabler/icons-react";
import { Select as SelectPrimitive } from "radix-ui";
import type { ReactNode } from "react";

import { cn } from "../../lib/cn";

interface Option {
  value: string;
  label: ReactNode;
}

interface SelectProps {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: Option[];
  placeholder?: ReactNode;
  className?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  "aria-label"?: string;
}

export function Select({ id, value, onValueChange, options, placeholder, className, ...aria }: SelectProps) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange}>
      <SelectPrimitive.Trigger
        id={id}
        {...aria}
        className={cn(
          "inline-flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3.5 text-sm text-text shadow-soft",
          "hover:border-border-strong focus-visible:border-accent-strong focus-visible:ring-4 focus-visible:ring-accent-soft-hover focus-visible:outline-none",
          "data-[placeholder]:text-subtle",
          className,
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon>
          <IconChevronDown className="size-4 text-muted" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          className="z-50 max-h-[min(20rem,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl border border-border bg-surface shadow-raised animate-scale-in"
        >
          <SelectPrimitive.Viewport className="p-1.5">
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                className="flex cursor-default items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-sm outline-none select-none data-[highlighted]:bg-surface-2"
              >
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator>
                  <IconCheck className="size-4 text-accent-text" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
