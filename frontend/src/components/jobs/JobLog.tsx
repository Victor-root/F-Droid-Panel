import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "../../lib/cn";

function lineClass(line: string): string {
  if (line.startsWith("$ ")) return "text-accent-300 font-medium";
  if (/\b(ERROR|CRITICAL)\b|^Failed:|^Internal error:/.test(line)) return "text-red-300";
  if (/\bWARNING\b/.test(line)) return "text-amber-200";
  return "text-zinc-300";
}

/** Live log of a job, streamed from the server; stays readable after the job ended. */
export function JobLog({ jobId, className }: { jobId: number; className?: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [lines, setLines] = useState<string[]>([]);
  const [ended, setEnded] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  useEffect(() => {
    const source = new EventSource(`/admin/api/jobs/${jobId}/stream`);
    source.addEventListener("line", (event) => setLines((current) => [...current, (event as MessageEvent<string>).data]));
    source.addEventListener("end", () => {
      source.close();
      setEnded(true);
      void queryClient.invalidateQueries({ queryKey: ["jobs"] });
    });
    source.onerror = () => {
      source.close();
      setEnded(true);
    };
    return () => {
      source.close();
      setLines([]);
      setEnded(false);
    };
  }, [jobId, queryClient]);

  useEffect(() => {
    const element = container.current;
    if (element && stickToBottom.current) element.scrollTop = element.scrollHeight;
  }, [lines]);

  return (
    <div
      ref={container}
      role="log"
      aria-live="polite"
      aria-label={t("jobs.log")}
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
          {line || " "}
        </div>
      ))}
      {!ended ? <div className="mt-1 inline-block h-3.5 w-2 animate-pulse bg-accent-300" aria-hidden="true" /> : null}
      {ended && lines.length === 0 ? <div className="text-zinc-500">{t("jobs.emptyLog")}</div> : null}
    </div>
  );
}
