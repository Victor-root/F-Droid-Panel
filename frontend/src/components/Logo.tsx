import { useTranslation } from "react-i18next";

import { cn } from "../lib/cn";

/** The panel mark: the Android robot (Tabler Icons) on an accent tile. Never the F-Droid logo. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative inline-flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-accent text-accent-contrast shadow-soft",
        className,
      )}
      aria-hidden="true"
    >
      <span className="absolute inset-0 bg-gradient-to-br from-white/40 via-white/5 to-black/10" />
      <svg viewBox="0 0 24 24" className="relative size-[60%]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 10l0 6" />
        <path d="M20 10l0 6" />
        <path d="M7 9h10v8a1 1 0 0 1 -1 1h-8a1 1 0 0 1 -1 -1v-8a5 5 0 0 1 10 0" />
        <path d="M8 3l1 2" />
        <path d="M16 3l-1 2" />
        <path d="M9 18l0 3" />
        <path d="M15 18l0 3" />
      </svg>
    </span>
  );
}

export function Logo({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="text-[15px] font-semibold tracking-tight text-text">{t("appName")}</span>
    </span>
  );
}
