import { useMemo } from "react";
import { renderSVG } from "uqr";

import { cn } from "../lib/cn";

/** Always dark on white, whatever the theme, so every phone camera reads it. */
export function QrCode({ value, label, className }: { value: string; label: string; className?: string }) {
  const source = useMemo(
    () => `data:image/svg+xml;utf8,${encodeURIComponent(renderSVG(value, { border: 2, whiteColor: "#ffffff", blackColor: "#111111" }))}`,
    [value],
  );
  return (
    <img
      src={source}
      alt={label}
      className={cn("size-48 max-w-none shrink-0 rounded-2xl border border-border bg-white p-2 [image-rendering:pixelated]", className)}
    />
  );
}
