import { IconPlus, IconRobot, IconTrash } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import { api } from "../../api/client";
import { uploadKeysQuery } from "../../api/queries";
import type { UploadKey } from "../../api/types";
import { useReauth } from "../../app/Reauth";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card, CardHeader } from "../../components/ui/Card";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { CopyField } from "../../components/ui/CopyButton";
import { Dialog, DialogClose, DialogContent } from "../../components/ui/Dialog";
import { EmptyState } from "../../components/ui/EmptyState";
import { Field, Input } from "../../components/ui/Field";
import { Switch } from "../../components/ui/Switch";
import { Table, Td, Th, Tr } from "../../components/ui/Table";
import { toast } from "../../components/ui/Toast";
import { useErrorText } from "../../lib/errors";
import { useFormat } from "../../lib/format";

type Created = UploadKey & { key: string };

const GUIDE_URL = "https://github.com/Victor-root/F-Droid-Panel/blob/main/docs/AUTOMATION.md";

/** What the build script reads from local.properties. */
function properties(repositoryId: number, key: string): string {
  return [`fdroidPanel.url=${window.location.origin}`, `fdroidPanel.repository=${repositoryId}`, `fdroidPanel.key=${key}`].join("\n");
}

export function UploadKeysCard({ repositoryId }: { repositoryId: number }) {
  const { t } = useTranslation();
  const errors = useErrorText();
  const format = useFormat();
  const queryClient = useQueryClient();
  const withReauth = useReauth();
  const { data: keys } = useQuery(uploadKeysQuery(repositoryId));
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [canPublish, setCanPublish] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const [removing, setRemoving] = useState<UploadKey | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: uploadKeysQuery(repositoryId).queryKey });

  const create = useMutation({
    mutationFn: () =>
      withReauth(() => api<Created>(`/repositories/${repositoryId}/keys`, { method: "POST", body: { name, canPublish } })),
    onSuccess: async (key) => {
      setAdding(false);
      setName("");
      setCanPublish(false);
      setCreated(key);
      await refresh();
    },
  });

  return (
    <Card>
      <CardHeader
        title={t("keys.title")}
        description={t("keys.description")}
        actions={
          <Button variant="secondary" onClick={() => setAdding(true)}>
            <IconPlus />
            {t("keys.add")}
          </Button>
        }
      />
      <div className="mt-4">
        {keys && keys.length === 0 ? (
          <EmptyState icon={<IconRobot />} title={t("keys.emptyTitle")} description={t("keys.emptyDescription")} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t("keys.name")}</Th>
                <Th className="hidden sm:table-cell">{t("keys.createdBy")}</Th>
                <Th>{t("access.lastUsed")}</Th>
                <Th>
                  <span className="sr-only">{t("users.columns.actions")}</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {keys?.map((key) => (
                <Tr key={key.id}>
                  <Td>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{key.name}</span>
                      <code className="font-mono text-xs text-muted">…{key.hint}</code>
                      {key.canPublish ? <Badge tone="accent">{t("keys.publishes")}</Badge> : null}
                    </div>
                  </Td>
                  <Td className="hidden text-muted sm:table-cell">{key.username}</Td>
                  <Td className="text-muted">{key.lastUsedAt ? format.relative(key.lastUsedAt) : t("users.never")}</Td>
                  <Td className="text-right">
                    <Button variant="ghost" size="icon-sm" aria-label={t("keys.remove")} title={t("keys.remove")} onClick={() => setRemoving(key)}>
                      <IconTrash />
                    </Button>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent title={t("keys.addTitle")} description={t("keys.addDescription")}>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              create.mutate();
            }}
          >
            <Field label={t("keys.name")} hint={t("keys.nameHint")} error={create.error ? errors.fromError(create.error) : undefined}>
              {(control) => <Input {...control} required autoFocus maxLength={128} value={name} onChange={(event) => setName(event.target.value)} />}
            </Field>
            <label className="flex items-start justify-between gap-4">
              <span>
                <span className="block text-sm font-medium text-text">{t("keys.canPublish")}</span>
                <span className="mt-0.5 block text-sm text-muted">{t("keys.canPublishHint")}</span>
              </span>
              <Switch checked={canPublish} onCheckedChange={setCanPublish} />
            </label>
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="secondary">
                  {t("action.cancel")}
                </Button>
              </DialogClose>
              <Button type="submit" loading={create.isPending}>
                {t("keys.create")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={created !== null} onOpenChange={(open) => !open && setCreated(null)}>
        <DialogContent title={t("keys.createdTitle", { name: created?.name })} description={t("keys.createdDescription")}>
          {created ? (
            <div className="flex flex-col gap-4">
              <CopyField value={created.key} />
              <div>
                <p className="mb-1.5 text-sm text-muted">{t("keys.properties")}</p>
                <pre className="overflow-x-auto rounded-xl border border-border bg-surface-2 p-3 font-mono text-xs text-text">
                  {properties(repositoryId, created.key)}
                </pre>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <a className="text-sm text-accent-text underline-offset-4 hover:underline" href={GUIDE_URL} target="_blank" rel="noreferrer">
                    {t("keys.guide")}
                  </a>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void navigator.clipboard.writeText(properties(repositoryId, created.key)).then(() => toast.success(t("keys.copied")))}
                  >
                    {t("keys.copyProperties")}
                  </Button>
                </div>
              </div>
              <div className="flex justify-end">
                <DialogClose asChild>
                  <Button>{t("keys.done")}</Button>
                </DialogClose>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        danger
        title={t("keys.removeTitle", { name: removing?.name })}
        description={t("keys.removeDescription")}
        confirmLabel={t("keys.remove")}
        onConfirm={async () => {
          if (!removing) return;
          try {
            await api(`/repositories/${repositoryId}/keys/${removing.id}`, { method: "DELETE" });
            await refresh();
          } catch (error) {
            toast.error(errors.fromError(error));
          }
        }}
      />
    </Card>
  );
}
