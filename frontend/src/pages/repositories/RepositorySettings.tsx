import { IconArrowBackUp, IconPhotoUp, IconTrash } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import { api, apiRaw } from "../../api/client";
import { meQuery, repositoriesQuery, repositoryQuery } from "../../api/queries";
import type { RepositoryDetail } from "../../api/types";
import { useReauth } from "../../app/Reauth";
import { JobDialog } from "../../components/jobs/JobDialog";
import { RepositoryIcon } from "../../components/RepositoryIcon";
import { Button, buttonVariants } from "../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { Field, Input, Textarea } from "../../components/ui/Field";
import { Select } from "../../components/ui/Select";
import { Switch } from "../../components/ui/Switch";
import { toast } from "../../components/ui/Toast";
import { cn } from "../../lib/cn";
import { useErrorText } from "../../lib/errors";
import { CategoriesCard } from "./CategoriesCard";
import { useRepositoryId } from "./RepositoryLayout";

const ARCHIVE_CHOICES = [0, 1, 2, 3, 5, 10, 20];

function GeneralCard({ repository }: { repository: RepositoryDetail }) {
  const { t } = useTranslation();
  const errors = useErrorText();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: repository.name, description: repository.description, archiveOlder: repository.archiveOlder });
  const save = useMutation({
    mutationFn: () => api<RepositoryDetail>(`/repositories/${repository.id}/settings`, { method: "PUT", body: form }),
    onSuccess: (updated) => {
      queryClient.setQueryData(repositoryQuery(repository.id).queryKey, updated);
      void queryClient.invalidateQueries({ queryKey: repositoriesQuery.queryKey });
      toast.success(t("repositorySettings.saved"), t("repositorySettings.savedDescription"));
    },
  });
  const choices = ARCHIVE_CHOICES.includes(form.archiveOlder) ? ARCHIVE_CHOICES : [...ARCHIVE_CHOICES, form.archiveOlder].sort((a, b) => a - b);

  return (
    <Card>
      <CardHeader title={t("repositorySettings.general")} description={t("repositorySettings.generalDescription")} />
      <CardBody>
        <form
          className="grid gap-5 md:grid-cols-2"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <Field label={t("newRepository.name")} hint={t("newRepository.nameHint")}>
            {(control) => <Input {...control} required disabled={!repository.canWrite} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />}
          </Field>
          <Field label={t("newRepository.archive")} hint={t("newRepository.archiveHint")}>
            {(control) => (
              <Select
                {...control}
                value={String(form.archiveOlder)}
                onValueChange={(value) => setForm({ ...form, archiveOlder: Number(value) })}
                options={choices.map((count) => ({
                  value: String(count),
                  label: count === 0 ? t("newRepository.archiveNever") : t("newRepository.archiveKeep", { count }),
                }))}
              />
            )}
          </Field>
          <Field label={t("newRepository.descriptionLabel")} className="md:col-span-2">
            {(control) => (
              <Textarea {...control} disabled={!repository.canWrite} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
            )}
          </Field>
          {save.error ? (
            <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger-text md:col-span-2">
              {errors.fromError(save.error)}
            </p>
          ) : null}
          {repository.canWrite ? (
            <div className="md:col-span-2">
              <Button type="submit" loading={save.isPending}>
                {t("action.save")}
              </Button>
            </div>
          ) : null}
        </form>
      </CardBody>
    </Card>
  );
}

function IconCard({ repository }: { repository: RepositoryDetail }) {
  const { t } = useTranslation();
  const errors = useErrorText();
  const queryClient = useQueryClient();
  const upload = useMutation({
    mutationFn: (file: File) => apiRaw<RepositoryDetail>(`/repositories/${repository.id}/icon`, { method: "PUT", body: file }),
    onSuccess: (updated) => {
      queryClient.setQueryData(repositoryQuery(repository.id).queryKey, updated);
      void queryClient.invalidateQueries({ queryKey: repositoriesQuery.queryKey });
      toast.success(t("repositorySettings.iconSaved"), t("app.savedDescription"));
    },
    onError: (error) => toast.error(errors.fromError(error)),
  });

  return (
    <Card>
      <CardHeader title={t("repositorySettings.icon")} description={t("repositorySettings.iconDescription")} />
      <CardBody className="flex flex-wrap items-center gap-5">
        <RepositoryIcon key={repository.iconVersion} repository={repository} size="xl" className="shadow-soft" />
        {repository.canWrite ? (
          <label className={cn(buttonVariants({ variant: "secondary" }), "cursor-pointer", upload.isPending && "pointer-events-none opacity-50")}>
            <IconPhotoUp />
            {t("repositorySettings.iconChange")}
            <input
              type="file"
              accept="image/png"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) upload.mutate(file);
                event.target.value = "";
              }}
            />
          </label>
        ) : null}
      </CardBody>
    </Card>
  );
}

function OptionRow({ title, description, checked, onChange }: { title: string; description: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-start justify-between gap-4 py-4">
      <span>
        <span className="block text-sm font-medium text-text">{title}</span>
        <span className="mt-0.5 block text-sm text-muted">{description}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

function AdminCards({ repository }: { repository: RepositoryDetail }) {
  const { t } = useTranslation();
  const errors = useErrorText();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const withReauth = useReauth();
  const [confirm, setConfirm] = useState<"rollback" | "remove" | null>(null);
  const [jobId, setJobId] = useState<number | null>(null);

  const update = useMutation({
    mutationFn: (body: { autoPublish?: boolean; private?: boolean }) =>
      api<RepositoryDetail>(`/repositories/${repository.id}`, { method: "PATCH", body }),
    onSuccess: (updated) => {
      queryClient.setQueryData(repositoryQuery(repository.id).queryKey, updated);
      void queryClient.invalidateQueries({ queryKey: repositoriesQuery.queryKey });
    },
    onError: (error) => toast.error(errors.fromError(error)),
  });

  return (
    <>
      <Card>
        <CardHeader title={t("repositorySettings.options")} />
        <CardBody className="divide-y divide-border py-0">
          <OptionRow
            title={t("repositorySettings.autoPublish")}
            description={t("repositorySettings.autoPublishHint")}
            checked={repository.autoPublish}
            onChange={(value) => update.mutate({ autoPublish: value })}
          />
          <OptionRow
            title={t("newRepository.private")}
            description={t("repositorySettings.privateHint")}
            checked={repository.private}
            onChange={(value) => update.mutate({ private: value })}
          />
        </CardBody>
      </Card>

      <Card className="border-danger/30">
        <CardHeader title={t("repositorySettings.danger")} />
        <CardBody className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-text">{t("repositorySettings.rollback")}</div>
              <div className="text-sm text-muted">{t("repositorySettings.rollbackHint")}</div>
            </div>
            <Button variant="secondary" onClick={() => setConfirm("rollback")}>
              <IconArrowBackUp />
              {t("repositorySettings.rollback")}
            </Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-text">{t("repositorySettings.remove")}</div>
              <div className="text-sm text-muted">{t("repositorySettings.removeHint", { path: repository.path })}</div>
            </div>
            <Button variant="danger" onClick={() => setConfirm("remove")}>
              <IconTrash />
              {t("repositorySettings.remove")}
            </Button>
          </div>
        </CardBody>
      </Card>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        danger={confirm === "remove"}
        title={confirm === "remove" ? t("repositorySettings.removeTitle", { name: repository.name }) : t("repositorySettings.rollbackTitle")}
        description={confirm === "remove" ? t("repositorySettings.removeDescription") : t("repositorySettings.rollbackDescription")}
        confirmLabel={confirm === "remove" ? t("repositorySettings.remove") : t("repositorySettings.rollback")}
        onConfirm={async () => {
          try {
            if (confirm === "remove") {
              await withReauth(() => api(`/repositories/${repository.id}`, { method: "DELETE" }));
              await queryClient.invalidateQueries({ queryKey: repositoriesQuery.queryKey });
              toast.success(t("repositorySettings.removed"));
              await navigate({ to: "/" });
            } else {
              const started = await api<{ jobId: number }>(`/repositories/${repository.id}/rollback`, { method: "POST" });
              setJobId(started.jobId);
            }
          } catch (error) {
            toast.error(errors.fromError(error));
          }
        }}
      />
      <JobDialog jobId={jobId} onClose={() => setJobId(null)} />
    </>
  );
}

export function RepositorySettings() {
  const repositoryId = useRepositoryId();
  const { data: repository } = useQuery(repositoryQuery(repositoryId));
  const { data: me } = useQuery(meQuery);
  if (!repository) return null;
  return (
    <div className="grid gap-6">
      <GeneralCard key={repository.publishedAt} repository={repository} />
      <IconCard repository={repository} />
      <CategoriesCard repositoryId={repository.id} canWrite={repository.canWrite} />
      {me?.role === "admin" ? <AdminCards repository={repository} /> : null}
    </div>
  );
}
