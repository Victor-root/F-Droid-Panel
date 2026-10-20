import { useTranslation } from "react-i18next";

import { cn } from "../lib/cn";

/** The panel mark: a package on an accent tile. Never the F-Droid logo. */
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
        <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3" />
        <path d="M12 12l8-4.5M12 12v9M12 12L4 7.5M16 5.25l-8 4.5" />
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
