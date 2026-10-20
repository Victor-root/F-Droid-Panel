import { IconInfoCircle, IconPalette, IconServer, IconUserCircle, IconUsers } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { Outlet } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { meQuery } from "../../api/queries";
import { PageHeader } from "../../components/PageHeader";
import { RouteTabs } from "../../components/RouteTabs";

export function SettingsPage() {
  const { t } = useTranslation();
  const { data: me } = useQuery(meQuery);
  const admin = me?.role === "admin";

  return (
    <>
      <PageHeader title={t("settings.title")} description={t("settings.description")} />
      <RouteTabs
        label={t("settings.title")}
        tabs={[
          { to: "/settings/account", label: t("settings.tabs.account"), icon: <IconUserCircle /> },
          { to: "/settings/appearance", label: t("settings.tabs.appearance"), icon: <IconPalette /> },
          ...(admin
            ? [
                { to: "/settings/users" as const, label: t("settings.tabs.users"), icon: <IconUsers /> },
                { to: "/settings/system" as const, label: t("settings.tabs.system"), icon: <IconServer /> },
              ]
            : []),
          { to: "/settings/about", label: t("settings.tabs.about"), icon: <IconInfoCircle /> },
        ]}
      />
      <Outlet />
    </>
  );
}
