import { useState } from "react";

import { repositoryIconUrl } from "../api/queries";
import { cn } from "../lib/cn";
import { Avatar } from "./ui/Avatar";

interface RepositoryIconProps {
  repository: { id: number; name: string; iconVersion: string | null };
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const SIZES = { sm: "size-8 rounded-lg", md: "size-10 rounded-xl", lg: "size-12 rounded-xl", xl: "size-16 rounded-2xl" };

/** The icon published with the repository, or its initials until it has one. */
export function RepositoryIcon({ repository, size = "md", className }: RepositoryIconProps) {
  const [failed, setFailed] = useState(false);
  if (failed) return <Avatar name={repository.name} size={size} className={className} />;
  return (
    <img
      src={repositoryIconUrl(repository)}
      alt=""
      onError={() => setFailed(true)}
      className={cn(SIZES[size], "shrink-0 bg-surface-2 object-cover", className)}
    />
  );
}
