import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "../../lib/cn";
import { Spinner } from "./Spinner";

export const buttonVariants = cva(
  [
    "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium select-none",
    "transition-[background-color,color,box-shadow,transform] duration-150 active:scale-[0.98]",
    "disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-[1.15em] [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        primary:
          "bg-accent text-accent-contrast shadow-soft hover:bg-accent-hover active:bg-accent-active",
        secondary: "border border-border bg-surface text-text shadow-soft hover:bg-surface-2",
        soft: "bg-accent-soft text-accent-soft-text hover:bg-accent-soft-hover",
        ghost: "text-text hover:bg-surface-2",
        danger: "bg-danger text-white shadow-soft hover:bg-danger-hover",
        link: "h-auto px-0 text-accent-text underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-6 text-base",
        icon: "size-10",
        "icon-sm": "size-8 rounded-lg",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

interface ButtonProps extends ComponentProps<"button">, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export function Button({ className, variant, size, asChild, loading, disabled, children, ...props }: ButtonProps) {
  const Component = asChild ? Slot.Root : "button";
  return (
    <Component
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading ? <Spinner /> : null}
          {children}
        </>
      )}
    </Component>
  );
}
