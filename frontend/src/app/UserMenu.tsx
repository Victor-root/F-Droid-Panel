import { IconChevronUp, IconLogout, IconUserCircle } from "@tabler/icons-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { api, setCsrfToken } from "../api/client";
import { meQuery } from "../api/queries";
import { Avatar } from "../components/ui/Avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/DropdownMenu";
import { ROLE_LABELS } from "../lib/labels";

export function UserMenu({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: me } = useQuery(meQuery);
  if (!me) return null;

  const logout = async () => {
    await api("/auth/logout", { method: "POST" });
    setCsrfToken("");
    queryClient.clear();
    await navigate({ to: "/login" });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl p-1.5 text-left transition-colors hover:bg-surface-2 data-[state=open]:bg-surface-2">
        <Avatar name={me.displayName} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-text">{me.displayName}</span>
          <span className="block truncate text-xs text-muted">{t(ROLE_LABELS[me.role])}</span>
        </span>
        <IconChevronUp className="size-4 shrink-0 text-muted" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-56">
        <DropdownMenuLabel>@{me.username}</DropdownMenuLabel>
        <DropdownMenuItem
          icon={<IconUserCircle />}
          onSelect={() => {
            onNavigate?.();
            void navigate({ to: "/settings/account" });
          }}
        >
          {t("account.title")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={<IconLogout />} onSelect={() => void logout()}>
          {t("account.logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
