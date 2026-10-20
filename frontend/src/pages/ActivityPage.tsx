import { IconActivity } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

import { PageHeader } from "../components/PageHeader";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";

export function ActivityPage() {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t("activity.title")} description={t("activity.description")} />
      <Card>
        <EmptyState icon={<IconActivity />} title={t("activity.empty.title")} description={t("activity.empty.description")} />
      </Card>
    </>
  );
}
