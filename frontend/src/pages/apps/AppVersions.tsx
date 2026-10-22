import { IconKey, IconTrash, IconUpload } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { api } from "../../api/client";
import type { AppDetail, AppVersion } from "../../api/types";
import { Badge } from "../../components/ui/Badge";
import { Button, buttonVariants } from "../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { CopyButton } from "../../components/ui/CopyButton";
import { Table, Td, Th, Tr } from "../../components/ui/Table";
import { toast } from "../../components/ui/Toast";
import { Tooltip } from "../../components/ui/Tooltip";
import { useUploads } from "../../components/uploads/UploadContext";
import { cn } from "../../lib/cn";
import { useErrorText } from "../../lib/errors";
import { useFormat } from "../../lib/format";
import { useAppCache } from "./useAppCache";

// Android versions by API level, so people see "Android 8.0" rather than "26".
const ANDROID_VERSIONS: Record<number, string> = {
  14: "4.0",
  15: "4.0.3",
  16: "4.1",
  17: "4.2",
  18: "4.3",
  19: "4.4",
  21: "5.0",
  22: "5.1",
  23: "6.0",
  24: "7.0",
  25: "7.1",
  26: "8.0",
  27: "8.1",
  28: "9",
  29: "10",
  30: "11",
  31: "12",
  32: "12L",
  33: "13",
  34: "14",
  35: "15",
  36: "16",
};

function shortPermission(permission: string): string {
  return permission.replace(/^android\.permission\./, "");
}

function VersionStatus({ version }: { version: AppVersion }) {
  const { t } = useTranslation();
  if (!version.published) return <Badge tone="warning">{t("app.versions.waiting")}</Badge>;
  if (version.section === "archive") return <Badge>{t("app.versions.archived")}</Badge>;
  return <Badge tone="success">{t("app.versions.published")}</Badge>;
}

export function AppVersions({ app, repositoryId, canWrite }: { app: AppDetail; repositoryId: number; canWrite: boolean }) {
  const { t } = useTranslation();
  const format = useFormat();
  const errors = useErrorText();
  const cache = useAppCache(repositoryId, app.packageName);
  const [removing, setRemoving] = useState<AppVersion | null>(null);
  const { addFiles } = useUploads();
  const navigate = useNavigate();
  const android = (sdk: number | null) => (sdk === null ? "" : ANDROID_VERSIONS[sdk] ? t("app.versions.android", { version: ANDROID_VERSIONS[sdk] }) : t("app.versions.api", { level: sdk }));

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader
          title={t("app.versions.title")}
          description={t("app.versions.description")}
          actions={
            canWrite ? (
              <label className={cn(buttonVariants(), "cursor-pointer")}>
                <IconUpload />
                {t("app.versions.addVersion")}
                <input
                  type="file"
                  accept=".apk"
                  className="sr-only"
                  onChange={(event) => {
                    const files = Array.from(event.target.files ?? []);
                    event.target.value = "";
                    if (files.length === 0) return;
                    // The checks and the confirmation happen in the list of files being added.
                    addFiles(files);
                    void navigate({ to: "/repositories/$repositoryId/apps", params: { repositoryId: String(repositoryId) } });
                  }}
                />
              </label>
            ) : null
          }
        />
        <CardBody className="px-0 pb-2">
          <Table>
            <thead>
              <tr>
                <Th>{t("app.versions.version")}</Th>
                <Th>{t("app.versions.status")}</Th>
                <Th>{t("app.versions.requires")}</Th>
                <Th>{t("app.versions.size")}</Th>
                <Th>{t("app.versions.added")}</Th>
                <Th>{t("app.versions.permissions")}</Th>
                {canWrite ? <Th className="w-0" /> : null}
              </tr>
            </thead>
            <tbody>
              {app.versionList.map((version) => (
                <Tr key={`${version.section}-${version.file}`}>
                  <Td>
                    <div className="font-medium">{version.versionName ?? version.versionCode}</div>
                    <div className="font-mono text-xs text-muted">{version.versionCode}</div>
                  </Td>
                  <Td>
                    <VersionStatus version={version} />
                  </Td>
                  <Td className="whitespace-nowrap text-muted">{android(version.minSdk)}</Td>
                  <Td className="whitespace-nowrap text-muted">{format.bytes(version.size)}</Td>
                  <Td className="whitespace-nowrap text-muted">{version.added ? format.date(version.added) : ""}</Td>
                  <Td>
                    {version.permissions.length > 0 ? (
                      <Tooltip content={version.permissions.map(shortPermission).join(", ")}>
                        <button type="button" className="text-sm text-accent-text underline-offset-4 hover:underline">
                          {t("app.versions.permissionCount", { count: version.permissions.length })}
                        </button>
                      </Tooltip>
                    ) : (
                      <span className="text-muted">{t("app.versions.noPermission")}</span>
                    )}
                  </Td>
                  {canWrite ? (
                    <Td>
                      <Button variant="ghost" size="icon-sm" className="text-danger-text" aria-label={t("app.versions.remove", { version: version.versionName ?? version.versionCode })} onClick={() => setRemoving(version)}>
                        <IconTrash />
                      </Button>
                    </Td>
                  ) : null}
                </Tr>
              ))}
            </tbody>
          </Table>
          {app.versionList.length === 0 ? <p className="px-5 py-6 text-sm text-muted">{t("app.versions.none")}</p> : null}
        </CardBody>
      </Card>

      {app.allowedSigners.length > 0 ? (
        <Card>
          <CardHeader title={t("app.versions.signer")} description={t("app.versions.signerDescription")} />
          <CardBody className="flex flex-col gap-2">
            {app.allowedSigners.map((signer) => (
              <div key={signer} className="flex min-w-0 items-center gap-2 rounded-xl bg-surface-2 px-3 py-2">
                <IconKey className="size-4 shrink-0 text-muted" />
                <code className="min-w-0 flex-1 truncate font-mono text-xs text-text">{signer}</code>
                <CopyButton value={signer} className="size-7" />
              </div>
            ))}
          </CardBody>
        </Card>
      ) : null}

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        danger
        title={t("app.versions.removeTitle", { version: removing?.versionName ?? removing?.versionCode })}
        description={t("app.versions.removeDescription")}
        confirmLabel={t("action.delete")}
        onConfirm={async () => {
          if (!removing) return;
          try {
            await api(`/repositories/${repositoryId}/apps/${app.packageName}/versions/${removing.versionCode}`, { method: "DELETE" });
            await cache.refresh();
          } catch (error) {
            toast.error(errors.fromError(error));
          }
        }}
      />
    </div>
  );
}
