import { IconPalette } from "@tabler/icons-react";
import { Outlet } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { PageHeader } from "../../components/PageHeader";
import { RouteTabs } from "../../components/RouteTabs";

export function SettingsPage() {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t("settings.title")} description={t("settings.description")} />
      <RouteTabs
        label={t("settings.title")}
        tabs={[{ to: "/settings/appearance", label: t("settings.tabs.appearance"), icon: <IconPalette /> }]}
      />
      <Outlet />
    </>
  );
}
