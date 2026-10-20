import { IconActivity, IconLayoutDashboard, IconMenu2, IconSettings, type Icon } from "@tabler/icons-react";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Logo } from "../components/Logo";
import { LanguageMenu, ThemeMenu } from "../components/PreferenceMenus";
import { Button } from "../components/ui/Button";
import { Dialog, SheetContent } from "../components/ui/Dialog";
import { cn } from "../lib/cn";

interface NavItem {
  to: "/" | "/activity" | "/settings";
  label: string;
  icon: Icon;
  exact?: boolean;
}

function NavLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      onClick={onNavigate}
      activeOptions={{ exact: item.exact ?? false }}
      className={cn(
        "group flex h-9 items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted transition-colors",
        "hover:bg-surface-2 hover:text-text data-[status=active]:bg-accent-soft data-[status=active]:text-accent-soft-text",
      )}
    >
      <Icon className="size-[18px] shrink-0" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function Sidebar({ onNavigate, footer }: { onNavigate?: () => void; footer?: ReactNode }) {
  const { t } = useTranslation();
  const items: NavItem[] = [
    { to: "/", label: t("nav.overview"), icon: IconLayoutDashboard, exact: true },
    { to: "/activity", label: t("nav.activity"), icon: IconActivity },
    { to: "/settings", label: t("nav.settings"), icon: IconSettings },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center px-5">
        <Link to="/" onClick={onNavigate} className="rounded-xl">
          <Logo />
        </Link>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2" aria-label={t("nav.main")}>
        {items.map((item) => (
          <NavLink key={item.to} item={item} onNavigate={onNavigate} />
        ))}
      </nav>
      <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-3">
        {footer}
        <div className="ml-auto flex items-center gap-1">
          <LanguageMenu />
          <ThemeMenu />
        </div>
      </div>
    </div>
  );
}

export function AppLayout() {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  useEffect(() => {
    document.getElementById("main")?.focus({ preventScroll: true });
  }, [pathname]);

  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="fixed top-3 left-3 z-[70] -translate-y-20 rounded-xl bg-accent px-4 py-2 font-medium text-accent-contrast focus:translate-y-0"
      >
        {t("nav.skipToContent")}
      </a>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-border bg-surface lg:block">
        <Sidebar />
      </aside>

      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-surface/85 px-3 backdrop-blur-md lg:hidden">
        <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
          <Button variant="ghost" size="icon" aria-label={t("nav.openMenu")} onClick={() => setMenuOpen(true)}>
            <IconMenu2 />
          </Button>
          <SheetContent title={t("nav.main")}>
            <Sidebar onNavigate={() => setMenuOpen(false)} />
          </SheetContent>
        </Dialog>
        <Link to="/" className="rounded-xl">
          <Logo />
        </Link>
      </header>

      <main id="main" tabIndex={-1} className="relative isolate outline-none lg:pl-64">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[28rem] overflow-hidden [mask-image:linear-gradient(to_bottom,black_40%,transparent)] lg:left-64"
        >
          <div className="absolute -top-40 right-[-10%] size-[36rem] rounded-full bg-accent-300 opacity-25 blur-3xl dark:bg-accent-700 dark:opacity-20" />
          <div className="absolute -top-56 left-[10%] size-[28rem] rounded-full bg-accent-200 opacity-30 blur-3xl dark:bg-accent-900 dark:opacity-30" />
        </div>
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
