import { Outlet } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { Logo } from "../../components/Logo";
import { LanguageMenu, ThemeMenu } from "../../components/PreferenceMenus";

export function AuthLayout() {
  const { t } = useTranslation();
  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-hidden">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-48 -left-32 size-[40rem] rounded-full bg-accent-300 opacity-30 blur-3xl dark:bg-accent-800 dark:opacity-25" />
        <div className="absolute -right-40 -bottom-56 size-[36rem] rounded-full bg-accent-200 opacity-40 blur-3xl dark:bg-accent-900 dark:opacity-30" />
      </div>
      <header className="flex items-center justify-between px-5 py-4">
        <Logo />
        <div className="flex items-center gap-1">
          <LanguageMenu />
          <ThemeMenu />
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <Outlet />
        </div>
      </main>
      <footer className="px-5 py-4 text-center text-xs text-muted">{t("about.notAffiliated")}</footer>
    </div>
  );
}
