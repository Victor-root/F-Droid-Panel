import { ToggleGroup } from "radix-ui";
import type { ReactNode } from "react";

import { cn } from "../../lib/cn";

interface Segment<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  segments: Segment<T>[];
  "aria-label": string;
  className?: string;
}

export function SegmentedControl<T extends string>({ value, onValueChange, segments, className, ...aria }: SegmentedControlProps<T>) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(next) => {
        const segment = segments.find((item) => item.value === next);
        if (segment) onValueChange(segment.value);
      }}
      className={cn("inline-flex rounded-xl bg-surface-3 p-1", className)}
      {...aria}
    >
      {segments.map((segment) => (
        <ToggleGroup.Item
          key={segment.value}
          value={segment.value}
          className={cn(
            "inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition-all",
            "hover:text-text data-[state=on]:bg-surface data-[state=on]:text-text data-[state=on]:shadow-soft [&_svg]:size-4",
          )}
        >
          {segment.icon}
          {segment.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
