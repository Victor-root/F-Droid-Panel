import { IconCheck, IconChevronRight } from "@tabler/icons-react";
import { DropdownMenu as Menu } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "../../lib/cn";

export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;

export function DropdownMenuContent({ className, align = "end", ...props }: ComponentProps<typeof Menu.Content>) {
  return (
    <Menu.Portal>
      <Menu.Content
        align={align}
        sideOffset={6}
        className={cn(
          "z-50 min-w-48 rounded-xl border border-border bg-surface p-1.5 shadow-raised animate-scale-in",
          className,
        )}
        {...props}
      />
    </Menu.Portal>
  );
}

interface ItemProps extends ComponentProps<typeof Menu.Item> {
  icon?: ReactNode;
  danger?: boolean;
}

export function DropdownMenuItem({ className, icon, danger, children, ...props }: ItemProps) {
  return (
    <Menu.Item
      className={cn(
        "flex cursor-default items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm outline-none select-none",
        "data-[highlighted]:bg-surface-2 data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:text-muted",
        danger && "text-danger-text [&_svg]:text-danger-text",
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </Menu.Item>
  );
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof Menu.Label>) {
  return <Menu.Label className={cn("px-2.5 pt-1.5 pb-1 text-xs font-medium text-muted", className)} {...props} />;
}

export function DropdownMenuSeparator() {
  return <Menu.Separator className="my-1.5 h-px bg-border" />;
}

export const DropdownMenuRadioGroup = Menu.RadioGroup;

export function DropdownMenuRadioItem({ className, children, ...props }: ComponentProps<typeof Menu.RadioItem>) {
  return (
    <Menu.RadioItem
      className={cn(
        "flex cursor-default items-center justify-between gap-2.5 rounded-lg px-2.5 py-2 text-sm outline-none select-none",
        "data-[highlighted]:bg-surface-2 [&_svg]:size-4",
        className,
      )}
      {...props}
    >
      <span className="flex items-center gap-2.5 [&_svg]:text-muted">{children}</span>
      <Menu.ItemIndicator>
        <IconCheck className="text-accent-text" />
      </Menu.ItemIndicator>
    </Menu.RadioItem>
  );
}

export const DropdownMenuSub = Menu.Sub;

export function DropdownMenuSubTrigger({ className, icon, children, ...props }: ComponentProps<typeof Menu.SubTrigger> & { icon?: ReactNode }) {
  return (
    <Menu.SubTrigger
      className={cn(
        "flex cursor-default items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm outline-none select-none",
        "data-[highlighted]:bg-surface-2 data-[state=open]:bg-surface-2 [&_svg]:size-4 [&_svg]:text-muted",
        className,
      )}
      {...props}
    >
      {icon}
      <span className="flex-1">{children}</span>
      <IconChevronRight />
    </Menu.SubTrigger>
  );
}

export function DropdownMenuSubContent({ className, ...props }: ComponentProps<typeof Menu.SubContent>) {
  return (
    <Menu.Portal>
      <Menu.SubContent
        sideOffset={6}
        className={cn("z-50 min-w-44 rounded-xl border border-border bg-surface p-1.5 shadow-raised animate-scale-in", className)}
        {...props}
      />
    </Menu.Portal>
  );
}
