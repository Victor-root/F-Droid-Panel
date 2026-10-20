import { IconCheck, IconCopy } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "../../lib/cn";
import { Button } from "./Button";

export function CopyButton({ value, className }: { value: string; className?: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className={className}
      aria-label={copied ? t("action.copied") : t("action.copy")}
      onClick={() => void navigator.clipboard.writeText(value).then(() => setCopied(true))}
    >
      {copied ? <IconCheck className="text-success" /> : <IconCopy />}
    </Button>
  );
}

/** A monospaced value (URL, fingerprint, command) with a copy button. */
export function CopyField({ value, className }: { value: string; className?: string }) {
  return (
    <div className={cn("flex min-w-0 items-center gap-1 rounded-xl border border-border bg-surface-2 py-1 pr-1 pl-3.5", className)}>
      <code className="min-w-0 flex-1 truncate font-mono text-xs text-text">{value}</code>
      <CopyButton value={value} />
    </div>
  );
}
