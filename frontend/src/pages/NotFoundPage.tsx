import { IconMapPinQuestion } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon={<IconMapPinQuestion />}
      title={t("notFound.title")}
      description={t("notFound.description")}
      action={
        <Button asChild>
          <Link to="/">{t("notFound.action")}</Link>
        </Button>
      }
    />
  );
}
