import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "../lib/cn";

function lineClass(line: string): string {
  if (line.startsWith("$ ")) return "text-accent-300 font-medium";
  if (/\b(ERROR|CRITICAL)\b|^Failed:|^Internal error:/.test(line)) return "text-red-300";
  if (/\bWARNING\b/.test(line)) return "text-amber-200";
  return "text-zinc-300";
}

/** A terminal-like log that follows new lines unless the reader scrolled up. */
export function LogView({ lines, running, label, className }: { lines: string[]; running: boolean; label: string; className?: string }) {
  const { t } = useTranslation();
  const container = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  useEffect(() => {
    const element = container.current;
    if (element && stickToBottom.current) element.scrollTop = element.scrollHeight;
  }, [lines]);

  return (
    <div
      ref={container}
      role="log"
      aria-live="polite"
      aria-label={label}
      onScroll={(event) => {
        const element = event.currentTarget;
        stickToBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 24;
      }}
      className={cn(
        "max-h-96 min-h-32 overflow-auto rounded-xl border border-zinc-800 bg-[#0d1210] p-4 font-mono text-xs leading-relaxed",
        className,
      )}
    >
      {lines.map((line, index) => (
        <div key={index} className={cn("break-all whitespace-pre-wrap", lineClass(line))}>
          {line || " "}
        </div>
      ))}
      {running ? <div className="mt-1 inline-block h-3.5 w-2 animate-pulse bg-accent-300" aria-hidden="true" /> : null}
      {!running && lines.length === 0 ? <div className="text-zinc-500">{t("jobs.emptyLog")}</div> : null}
    </div>
  );
}
