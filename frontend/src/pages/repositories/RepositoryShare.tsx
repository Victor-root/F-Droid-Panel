import { IconExternalLink, IconLock } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { repositoryQuery } from "../../api/queries";
import { QrCode } from "../../components/QrCode";
import { Button } from "../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import { CopyField } from "../../components/ui/CopyButton";
import { useRepositoryId } from "./RepositoryLayout";

/** Groups a fingerprint in blocks of four, the way people compare them. */
function grouped(fingerprint: string): string {
  return fingerprint.toUpperCase().match(/.{1,4}/g)?.join(" ") ?? fingerprint;
}

export function RepositoryShare() {
  const { t } = useTranslation();
  const { data: repository } = useQuery(repositoryQuery(useRepositoryId()));
  if (!repository) return null;
  const addUrl = repository.fingerprint ? `${repository.repoUrl}?fingerprint=${repository.fingerprint}` : repository.repoUrl;
  const page = repository.repoUrl.replace(/\/repo$/, "") || "/";

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
      <Card>
        <CardHeader title={t("share.title")} description={t("share.description")} />
        <CardBody className="flex flex-col gap-5">
          {repository.private ? (
            <p className="flex items-start gap-2.5 rounded-xl bg-info-soft p-3.5 text-sm text-info-text">
              <IconLock className="mt-0.5 size-4 shrink-0" />
              {t("share.private")}
            </p>
          ) : null}
          <div>
            <p className="mb-1.5 text-sm font-medium text-text">{t("share.link")}</p>
            <CopyField value={addUrl} />
            <p className="mt-1.5 text-xs text-muted">{t("share.linkHint")}</p>
          </div>
          <div>
            <p className="mb-1.5 text-sm font-medium text-text">{t("share.fingerprint")}</p>
            {repository.fingerprint ? (
              <code className="block rounded-xl bg-surface-2 px-3.5 py-2.5 font-mono text-xs leading-relaxed break-all text-text">
                {grouped(repository.fingerprint)}
              </code>
            ) : (
              <p className="text-sm text-muted">{t("share.noFingerprint")}</p>
            )}
            <p className="mt-1.5 text-xs text-muted">{t("share.fingerprintHint")}</p>
          </div>
          <div>
            <Button variant="secondary" asChild>
              <a href={page} target="_blank" rel="noreferrer">
                <IconExternalLink />
                {t("share.publicPage")}
              </a>
            </Button>
          </div>
        </CardBody>
      </Card>
      <Card className="flex flex-col items-center justify-center gap-3 p-6">
        <QrCode value={addUrl} label={t("share.qr")} className="size-56" />
        <p className="max-w-56 text-center text-xs text-muted">{t("share.qrHint")}</p>
      </Card>
    </div>
  );
}
