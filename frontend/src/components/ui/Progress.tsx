import { cn } from "../../lib/cn";

export function Progress({ value, className, label }: { value: number; className?: string; label: string }) {
  const percent = Math.round(Math.min(100, Math.max(0, value)));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-surface-3", className)}
    >
      <div
        className="h-full rounded-full bg-gradient-to-r from-accent-400 to-accent-600 transition-[width] duration-300"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
