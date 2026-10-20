import { IconKey, IconPlus, IconTrash } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import { api } from "../../api/client";
import { accessAccountsQuery, repositoryQuery } from "../../api/queries";
import type { AccessAccount } from "../../api/types";
import { QrCode } from "../../components/QrCode";
import { Button } from "../../components/ui/Button";
import { Card, CardHeader } from "../../components/ui/Card";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { CopyField } from "../../components/ui/CopyButton";
import { Dialog, DialogClose, DialogContent } from "../../components/ui/Dialog";
import { EmptyState } from "../../components/ui/EmptyState";
import { Field, Input } from "../../components/ui/Field";
import { Table, Td, Th, Tr } from "../../components/ui/Table";
import { useErrorText } from "../../lib/errors";
import { useFormat } from "../../lib/format";
import { slugify } from "../../lib/slug";
import { useRepositoryId } from "./RepositoryLayout";

type Created = AccessAccount & { password: string };

/** The repository address with the credentials in it, which the F-Droid app accepts as is. */
function addUrlWithCredentials(repoUrl: string, fingerprint: string | null, account: Created): string {
  const url = new URL(repoUrl);
  url.username = account.username;
  url.password = account.password;
  if (fingerprint) url.searchParams.set("fingerprint", fingerprint);
  return url.toString();
}

export function RepositoryAccess() {
  const { t } = useTranslation();
  const errors = useErrorText();
  const format = useFormat();
  const queryClient = useQueryClient();
  const repositoryId = useRepositoryId();
  const { data: repository } = useQuery(repositoryQuery(repositoryId));
  const { data: accounts } = useQuery(accessAccountsQuery(repositoryId));
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [created, setCreated] = useState<Created | null>(null);
  const [removing, setRemoving] = useState<AccessAccount | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: accessAccountsQuery(repositoryId).queryKey });

  const create = useMutation({
    mutationFn: () =>
      api<Created>(`/repositories/${repositoryId}/access`, { method: "POST", body: { label, username: slugify(label) || "phone" } }),
    onSuccess: async (account) => {
      setAdding(false);
      setLabel("");
      setCreated(account);
      await refresh();
    },
  });

  if (!repository) return null;

  return (
    <Card>
      <CardHeader
        title={t("access.title")}
        description={repository.private ? t("access.description") : t("access.notPrivate")}
        actions={
          <Button onClick={() => setAdding(true)}>
            <IconPlus />
            {t("access.add")}
          </Button>
        }
      />
      <div className="mt-4">
        {accounts && accounts.length === 0 ? (
          <EmptyState icon={<IconKey />} title={t("access.emptyTitle")} description={t("access.emptyDescription")} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t("access.label")}</Th>
                <Th className="hidden sm:table-cell">{t("login.username")}</Th>
                <Th>{t("access.lastUsed")}</Th>
                <Th>
                  <span className="sr-only">{t("users.columns.actions")}</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {accounts?.map((account) => (
                <Tr key={account.id}>
                  <Td className="font-medium">{account.label}</Td>
                  <Td className="hidden font-mono text-xs sm:table-cell">{account.username}</Td>
                  <Td className="text-muted">{account.lastUsedAt ? format.relative(account.lastUsedAt) : t("users.never")}</Td>
                  <Td className="text-right">
                    <Button variant="ghost" size="icon-sm" aria-label={t("access.remove")} onClick={() => setRemoving(account)}>
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
        <DialogContent title={t("access.addTitle")} description={t("access.addDescription")}>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              create.mutate();
            }}
          >
            <Field label={t("access.label")} hint={t("access.labelHint")} error={create.error ? errors.fromError(create.error) : undefined}>
              {(control) => <Input {...control} required autoFocus value={label} onChange={(event) => setLabel(event.target.value)} />}
            </Field>
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="secondary">
                  {t("action.cancel")}
                </Button>
              </DialogClose>
              <Button type="submit" loading={create.isPending}>
                {t("access.create")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={created !== null} onOpenChange={(open) => !open && setCreated(null)}>
        <DialogContent
          size="lg"
          title={t("access.createdTitle", { label: created?.label })}
          description={t("access.createdDescription")}
          footer={<Button onClick={() => setCreated(null)}>{t("access.done")}</Button>}
        >
          {created ? (
            <div className="grid gap-5 sm:grid-cols-[auto_1fr] sm:items-start">
              <QrCode value={addUrlWithCredentials(repository.repoUrl, repository.fingerprint, created)} label={t("share.qr")} />
              <div className="flex min-w-0 flex-col gap-4">
                <div>
                  <p className="mb-1.5 text-sm font-medium text-text">{t("login.username")}</p>
                  <CopyField value={created.username} />
                </div>
                <div>
                  <p className="mb-1.5 text-sm font-medium text-text">{t("login.password")}</p>
                  <CopyField value={created.password} />
                </div>
                <div>
                  <p className="mb-1.5 text-sm font-medium text-text">{t("access.fullLink")}</p>
                  <CopyField value={addUrlWithCredentials(repository.repoUrl, repository.fingerprint, created)} />
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        danger
        title={t("access.removeTitle", { label: removing?.label })}
        description={t("access.removeDescription")}
        confirmLabel={t("access.remove")}
        onConfirm={async () => {
          if (!removing) return;
          await api(`/repositories/${repositoryId}/access/${removing.id}`, { method: "DELETE" });
          await refresh();
        }}
      />
    </Card>
  );
}
