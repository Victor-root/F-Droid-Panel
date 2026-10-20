import { IconBrandGithub, IconHeart, IconScale } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

import { LogoMark } from "../../components/Logo";
import { Button } from "../../components/ui/Button";
import { Card, CardBody } from "../../components/ui/Card";

const REPOSITORY_URL = "https://github.com/Victor-root/F-Droid-Panel";

export function AboutSettings() {
  const { t } = useTranslation();
  return (
    <Card>
      <CardBody className="flex flex-col items-start gap-5 sm:flex-row">
        <LogoMark className="size-14 rounded-2xl" />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-text">{t("appName")}</h2>
          <p className="mt-1 text-sm text-muted">{t("about.description")}</p>
          <p className="mt-4 rounded-xl border border-warning/40 bg-warning-soft px-4 py-3 text-sm text-warning-text">{t("about.notAffiliated")}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="secondary" asChild>
              <a href={REPOSITORY_URL} target="_blank" rel="noreferrer">
                <IconBrandGithub />
                {t("about.sourceCode")}
              </a>
            </Button>
            <Button variant="ghost" asChild>
              <a href={`${REPOSITORY_URL}/blob/main/LICENSE`} target="_blank" rel="noreferrer">
                <IconScale />
                {t("about.license")}
              </a>
            </Button>
            <Button variant="ghost" asChild>
              <a href={`${REPOSITORY_URL}/blob/main/CREDITS.md`} target="_blank" rel="noreferrer">
                <IconHeart />
                {t("about.credits")}
              </a>
            </Button>
          </div>
          <p className="mt-4 text-sm text-muted">{t("about.builtWith")}</p>
        </div>
      </CardBody>
    </Card>
  );
}
