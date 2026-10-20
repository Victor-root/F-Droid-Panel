import { useState } from "react";

import { cn } from "../lib/cn";
import { Avatar } from "./ui/Avatar";

const SIZES = { sm: "size-8 rounded-lg", md: "size-10 rounded-xl", lg: "size-12 rounded-xl", xl: "size-16 rounded-2xl" };

export function AppIcon({ name, url, size = "lg", className }: { name: string; url: string | null; size?: "sm" | "md" | "lg" | "xl"; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) return <Avatar name={name} size={size} className={className} />;
  return <img src={url} alt="" onError={() => setFailed(true)} className={cn(SIZES[size], "shrink-0 bg-surface-2 object-cover", className)} />;
}
