import {
  IconDotsVertical,
  IconKey,
  IconPencil,
  IconPlus,
  IconShieldCheck,
  IconShieldOff,
  IconTrash,
  IconUserCheck,
  IconUserOff,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import { api } from "../../api/client";
import { meQuery, repositoriesQuery, usersQuery } from "../../api/queries";
import type { Role, User } from "../../api/types";
import { useReauth } from "../../app/Reauth";
import { Avatar } from "../../components/ui/Avatar";
import { RepositoryIcon } from "../../components/RepositoryIcon";
import { Badge } from "../../components/ui/Badge";
import { Checkbox } from "../../components/ui/Checkbox";
import { Button } from "../../components/ui/Button";
import { Card, CardHeader } from "../../components/ui/Card";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { Dialog, DialogClose, DialogContent } from "../../components/ui/Dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/DropdownMenu";
import { Field, Input } from "../../components/ui/Field";
import { Select } from "../../components/ui/Select";
import { Skeleton } from "../../components/ui/Skeleton";
import { Table, Td, Th, Tr } from "../../components/ui/Table";
import { toast } from "../../components/ui/Toast";
import { useErrorText } from "../../lib/errors";
import { useFormat } from "../../lib/format";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "../../lib/labels";

const ROLES: Role[] = ["admin", "maintainer", "viewer"];

function RoleSelect({ value, onChange, id }: { value: Role; onChange: (role: Role) => void; id?: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-1.5">
      <Select
        id={id}
        value={value}
        onValueChange={(next) => onChange(next as Role)}
        options={ROLES.map((role) => ({ value: role, label: t(ROLE_LABELS[role]) }))}
      />
      <p className="text-xs text-muted">{t(ROLE_DESCRIPTIONS[value])}</p>
    </div>
  );
}

function RepositoryPicker({ value, onChange }: { value: number[]; onChange: (ids: number[]) => void }) {
  const { t } = useTranslation();
  const { data: repositories } = useQuery(repositoriesQuery);
  if (!repositories?.length) return <p className="text-sm text-muted">{t("users.noRepositories")}</p>;
  return (
    <ul className="max-h-56 divide-y divide-border overflow-y-auto rounded-xl border border-border">
      {repositories.map((repository) => (
        <li key={repository.id}>
          <label className="flex items-center gap-3 px-3.5 py-2.5 text-sm">
            <Checkbox
              checked={value.includes(repository.id)}
              onCheckedChange={(checked) =>
                onChange(checked === true ? [...value, repository.id] : value.filter((id) => id !== repository.id))
              }
            />
            <RepositoryIcon repository={repository} size="sm" className="size-6 rounded-md" />
            <span className="truncate text-text">{repository.name}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}

type Editing = { mode: "create" } | { mode: "edit"; user: User } | { mode: "password"; user: User };

function UserDialog({ editing, onClose }: { editing: Editing | null; onClose: () => void }) {
  const { t } = useTranslation();
  const errors = useErrorText();
  const queryClient = useQueryClient();
  const withReauth = useReauth();
  const user = editing && editing.mode !== "create" ? editing.user : null;
  const [form, setForm] = useState({
    username: "",
    displayName: user?.displayName ?? "",
    role: user?.role ?? ("maintainer" as Role),
    password: "",
    repositoryIds: user?.repositoryIds ?? [],
  });

  const save = useMutation({
    mutationFn: () =>
      withReauth(() => {
        if (editing?.mode === "create") return api("/users", { method: "POST", body: form });
        if (editing?.mode === "edit") {
          return api(`/users/${editing.user.id}`, {
            method: "PATCH",
            body: { displayName: form.displayName, role: form.role, repositoryIds: form.repositoryIds },
          });
        }
        return api(`/users/${user?.id}/password`, { method: "POST", body: { password: form.password } });
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: usersQuery.queryKey });
      toast.success(t("users.saved"));
      onClose();
    },
  });
  const fieldErrors = errors.fieldErrors(save.error);
  const generalError = save.error && Object.keys(fieldErrors).length === 0 ? errors.fromError(save.error) : null;
  const update = (field: "username" | "displayName" | "password") => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  const title =
    editing?.mode === "create"
      ? t("users.createTitle")
      : editing?.mode === "edit"
        ? t("users.editTitle", { name: user?.displayName })
        : t("users.passwordTitle", { name: user?.displayName });

  return (
    <Dialog open={editing !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={title} description={editing?.mode === "password" ? t("users.passwordDescription") : undefined}>
        <form
          id="user-form"
          className="flex flex-col gap-4"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          {editing?.mode === "create" ? (
            <Field label={t("login.username")} hint={t("setup.usernameHint")} error={fieldErrors.username}>
              {(control) => <Input {...control} required autoComplete="off" value={form.username} onChange={update("username")} />}
            </Field>
          ) : null}
          {editing?.mode !== "password" ? (
            <>
              <Field label={t("setup.displayName")} hint={t("setup.displayNameHint")} error={fieldErrors.displayName}>
                {(control) => <Input {...control} required value={form.displayName} onChange={update("displayName")} />}
              </Field>
              <Field label={t("users.role")}>
                {(control) => <RoleSelect id={control.id} value={form.role} onChange={(role) => setForm((current) => ({ ...current, role }))} />}
              </Field>
              {form.role !== "admin" ? (
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-text">{t("users.repositories")}</span>
                  <RepositoryPicker value={form.repositoryIds} onChange={(repositoryIds) => setForm((current) => ({ ...current, repositoryIds }))} />
                </div>
              ) : null}
            </>
          ) : null}
          {editing?.mode !== "edit" ? (
            <Field label={t("users.temporaryPassword")} hint={t("users.temporaryPasswordHint")} error={fieldErrors.password}>
              {(control) => (
                <Input {...control} required type="password" autoComplete="new-password" value={form.password} onChange={update("password")} />
              )}
            </Field>
          ) : null}
          {generalError ? (
            <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger-text">
              {generalError}
            </p>
          ) : null}
          <div className="flex justify-end gap-2 pt-2">
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                {t("action.cancel")}
              </Button>
            </DialogClose>
            <Button type="submit" loading={save.isPending}>
              {editing?.mode === "create" ? t("users.create") : t("action.save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type Confirming = { kind: "delete" | "second-factor"; user: User };

export function UsersSettings() {
  const { t } = useTranslation();
  const format = useFormat();
  const errors = useErrorText();
  const queryClient = useQueryClient();
  const withReauth = useReauth();
  const { data: users } = useQuery(usersQuery);
  const { data: me } = useQuery(meQuery);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [confirming, setConfirming] = useState<Confirming | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: usersQuery.queryKey });

  const toggle = useMutation({
    mutationFn: (user: User) =>
      withReauth(() => api(`/users/${user.id}`, { method: "PATCH", body: { disabled: !user.disabled } })),
    onSuccess: refresh,
    onError: (error) => toast.error(errors.fromError(error)),
  });

  return (
    <Card>
      <CardHeader
        title={t("users.title")}
        description={t("users.description")}
        actions={
          <Button onClick={() => setEditing({ mode: "create" })}>
            <IconPlus />
            {t("users.add")}
          </Button>
        }
      />
      <div className="mt-4">
        {users ? (
          <Table>
            <thead>
              <tr>
                <Th>{t("users.columns.user")}</Th>
                <Th>{t("users.role")}</Th>
                <Th className="hidden md:table-cell">{t("users.columns.security")}</Th>
                <Th className="hidden sm:table-cell">{t("users.columns.lastLogin")}</Th>
                <Th>
                  <span className="sr-only">{t("users.columns.actions")}</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <Tr key={user.id} className={user.disabled ? "opacity-60" : undefined}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <Avatar name={user.displayName} size="sm" />
                      <div className="min-w-0">
                        <div className="truncate font-medium">
                          {user.displayName}
                          {user.id === me?.id ? <span className="ml-1.5 text-xs text-muted">({t("users.you")})</span> : null}
                        </div>
                        <div className="truncate text-xs text-muted">@{user.username}</div>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge tone={user.role === "admin" ? "accent" : "neutral"}>{t(ROLE_LABELS[user.role])}</Badge>
                      {user.disabled ? <Badge tone="danger">{t("users.disabled")}</Badge> : null}
                    </div>
                  </Td>
                  <Td className="hidden md:table-cell">
                    {user.totpEnabled ? (
                      <Badge tone="success">
                        <IconShieldCheck />
                        {t("account.secondFactor.on")}
                      </Badge>
                    ) : (
                      <Badge tone="warning">
                        <IconShieldOff />
                        {t("account.secondFactor.off")}
                      </Badge>
                    )}
                  </Td>
                  <Td className="hidden text-muted sm:table-cell">
                    {user.lastLoginAt ? format.relative(user.lastLoginAt) : t("users.never")}
                  </Td>
                  <Td className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={t("users.columns.actions")}>
                          <IconDotsVertical />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem icon={<IconPencil />} onSelect={() => setEditing({ mode: "edit", user })}>
                          {t("users.edit")}
                        </DropdownMenuItem>
                        <DropdownMenuItem icon={<IconKey />} onSelect={() => setEditing({ mode: "password", user })}>
                          {t("users.resetPassword")}
                        </DropdownMenuItem>
                        {user.totpEnabled ? (
                          <DropdownMenuItem icon={<IconShieldOff />} onSelect={() => setConfirming({ kind: "second-factor", user })}>
                            {t("users.resetSecondFactor")}
                          </DropdownMenuItem>
                        ) : null}
                        {user.id !== me?.id ? (
                          <>
                            <DropdownMenuItem icon={user.disabled ? <IconUserCheck /> : <IconUserOff />} onSelect={() => toggle.mutate(user)}>
                              {user.disabled ? t("users.enable") : t("users.disable")}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem icon={<IconTrash />} danger onSelect={() => setConfirming({ kind: "delete", user })}>
                              {t("users.delete")}
                            </DropdownMenuItem>
                          </>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <div className="space-y-2 p-5">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        )}
      </div>
      {editing ? <UserDialog key={editing.mode + (editing.mode === "create" ? "" : editing.user.id)} editing={editing} onClose={() => setEditing(null)} /> : null}
      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => !open && setConfirming(null)}
        danger
        title={
          confirming?.kind === "delete"
            ? t("users.deleteTitle", { name: confirming.user.displayName })
            : t("users.resetSecondFactorTitle", { name: confirming?.user.displayName })
        }
        description={confirming?.kind === "delete" ? t("users.deleteDescription") : t("users.resetSecondFactorDescription")}
        confirmLabel={confirming?.kind === "delete" ? t("users.delete") : t("users.resetSecondFactor")}
        onConfirm={async () => {
          if (!confirming) return;
          const path = confirming.kind === "delete" ? `/users/${confirming.user.id}` : `/users/${confirming.user.id}/second-factor`;
          try {
            await withReauth(() => api(path, { method: "DELETE" }));
            await refresh();
          } catch (error) {
            toast.error(errors.fromError(error));
          }
        }}
      />
    </Card>
  );
}
