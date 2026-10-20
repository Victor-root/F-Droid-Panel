import { IconPackages, IconPlus } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

import { PageHeader } from "../components/PageHeader";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";

export function OverviewPage() {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t("overview.title")} description={t("overview.description")} />
      <Card>
        <EmptyState
          icon={<IconPackages />}
          title={t("overview.empty.title")}
          description={t("overview.empty.description")}
          action={
            <Button>
              <IconPlus />
              {t("overview.empty.action")}
            </Button>
          }
        />
      </Card>
    </>
  );
}
