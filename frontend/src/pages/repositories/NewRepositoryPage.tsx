import {
  IconAlertTriangle,
  IconArrowLeft,
  IconCircleCheck,
  IconCircleX,
  IconFolderSearch,
  IconPackageImport,
  IconSparkles,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";

import { api } from "../../api/client";
import { jobQuery, repositoriesQuery, systemQuery } from "../../api/queries";
import type { Inspection, Repository } from "../../api/types";
import { JobLog } from "../../components/jobs/JobLog";
import { PageHeader } from "../../components/PageHeader";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import { Checkbox } from "../../components/ui/Checkbox";
import { Field, Input, Textarea } from "../../components/ui/Field";
import { Select } from "../../components/ui/Select";
import { Switch } from "../../components/ui/Switch";
import { cn } from "../../lib/cn";
import { useErrorText } from "../../lib/errors";
import { useFormat } from "../../lib/format";
import { slugify } from "../../lib/slug";

type Mode = "import" | "create";

function ModeCard({ icon, title, description, onClick }: { icon: ReactNode; title: string; description: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col items-start gap-4 rounded-2xl border border-border bg-surface p-6 text-left shadow-soft transition-all hover:-translate-y-0.5 hover:border-accent-strong hover:shadow-raised"
    >
      <span className="flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent-soft-text transition-transform group-hover:scale-105 [&_svg]:size-6">
        {icon}
      </span>
      <span>
        <span className="block text-base font-semibold text-text">{title}</span>
        <span className="mt-1 block text-sm text-muted">{description}</span>
      </span>
    </button>
  );
}

function Check({ ok, warning, children }: { ok: boolean; warning?: boolean; children: ReactNode }) {
  const Icon = ok ? IconCircleCheck : warning ? IconAlertTriangle : IconCircleX;
  return (
    <li className="flex items-start gap-2.5 text-sm">
      <Icon className={cn("mt-0.5 size-4 shrink-0", ok ? "text-success" : warning ? "text-warning" : "text-danger")} />
      <span className="text-text">{children}</span>
    </li>
  );
}

function ImportForm() {
  const { t } = useTranslation();
  const errors = useErrorText();
  const format = useFormat();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [path, setPath] = useState("");
  const [slug, setSlug] = useState("");
  const [movePasswords, setMovePasswords] = useState(true);
  const [inspection, setInspection] = useState<Inspection | null>(null);

  const check = useMutation({
    mutationFn: () => api<Inspection>(`/repositories/inspect?path=${encodeURIComponent(path)}`),
    onSuccess: (result) => {
      setInspection(result);
      setSlug(slugify(result.urlPrefix || result.repoName || ""));
    },
  });
  const register = useMutation({
    mutationFn: () => api<Repository>("/repositories/import", { method: "POST", body: { path: inspection?.path, slug, movePasswords } }),
    onSuccess: async (repository) => {
      await queryClient.invalidateQueries({ queryKey: repositoriesQuery.queryKey });
      await navigate({ to: "/repositories/$repositoryId", params: { repositoryId: String(repository.id) } });
    },
  });

  const blocking = inspection?.problems.filter((problem) => problem !== "keystore_readable_by_others") ?? [];
  const canImport = inspection !== null && blocking.length === 0 && !inspection.alreadyRegistered;

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader title={t("newRepository.import.title")} description={t("newRepository.import.description")} />
        <CardBody>
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              check.mutate();
            }}
          >
            <Field label={t("newRepository.import.path")} hint={t("newRepository.import.pathHint")} className="flex-1" error={check.error ? errors.fromError(check.error) : undefined}>
              {(control) => <Input {...control} required className="font-mono" placeholder="/srv/fdroid" value={path} onChange={(event) => setPath(event.target.value)} />}
            </Field>
            <Button type="submit" variant="secondary" loading={check.isPending} className="sm:mb-6">
              <IconFolderSearch />
              {t("newRepository.import.check")}
            </Button>
          </form>
        </CardBody>
      </Card>

      {inspection ? (
        <Card className="animate-fade-in">
          <CardHeader
            title={inspection.repoName ?? inspection.path}
            description={<code className="font-mono text-xs">{inspection.path}</code>}
            actions={canImport ? <Badge tone="success">{t("newRepository.import.ready")}</Badge> : <Badge tone="danger">{t("newRepository.import.notReady")}</Badge>}
          />
          <CardBody className="grid gap-6 lg:grid-cols-2">
            <ul className="space-y-2.5">
              <Check ok={inspection.isRepository}>
                {inspection.isRepository
                  ? t("newRepository.checks.config")
                  : errors.message(inspection.exists ? "not_a_repository" : "path_not_found")}
              </Check>
              {inspection.isRepository ? (
                <>
                  <Check ok={inspection.writable}>{inspection.writable ? t("newRepository.checks.writable") : errors.message("not_writable")}</Check>
                  <Check ok={inspection.keystoreFound}>{inspection.keystoreFound ? t("newRepository.checks.keystore") : errors.message("keystore_missing")}</Check>
                  {inspection.problems.includes("keystore_readable_by_others") ? (
                    <Check ok={false} warning>
                      {errors.message("keystore_readable_by_others")}
                    </Check>
                  ) : null}
                  <Check ok={inspection.repoUrl !== null && inspection.urlPrefix !== null}>
                    {inspection.repoUrl ? t("newRepository.checks.url", { url: inspection.repoUrl }) : errors.message("repo_url_missing")}
                  </Check>
                  <Check ok>{t("newRepository.checks.content", { apps: inspection.apps, apks: inspection.apks })}</Check>
                  <Check ok={inspection.publishedAt !== null} warning>
                    {inspection.publishedAt ? t("newRepository.checks.published", { when: format.relative(inspection.publishedAt) }) : t("newRepository.checks.neverPublished")}
                  </Check>
                  {inspection.alreadyRegistered ? <Check ok={false}>{errors.message("repository_already_registered")}</Check> : null}
                </>
              ) : null}
            </ul>
            {canImport ? (
              <form
                className="flex flex-col gap-4"
                onSubmit={(event: FormEvent) => {
                  event.preventDefault();
                  register.mutate();
                }}
              >
                <Field label={t("newRepository.slug")} hint={t("newRepository.slugHint")} error={register.error ? errors.fromError(register.error) : undefined}>
                  {(control) => <Input {...control} required className="font-mono" value={slug} onChange={(event) => setSlug(event.target.value)} />}
                </Field>
                {inspection.passwordsInConfig ? (
                  <label className="flex items-start gap-3 rounded-xl bg-surface-2 p-3.5 text-sm">
                    <Checkbox checked={movePasswords} onCheckedChange={(checked) => setMovePasswords(checked === true)} className="mt-0.5" />
                    <span>
                      <span className="block font-medium text-text">{t("newRepository.import.movePasswords")}</span>
                      <span className="mt-0.5 block text-muted">{t("newRepository.import.movePasswordsHint")}</span>
                    </span>
                  </label>
                ) : null}
                <p className="text-xs text-muted">{t("newRepository.import.safe")}</p>
                <Button type="submit" loading={register.isPending}>
                  <IconPackageImport />
                  {t("newRepository.import.submit")}
                </Button>
              </form>
            ) : null}
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}

const ARCHIVE_CHOICES = [0, 1, 3, 5, 10];

function CreateForm({ rootFree, publicUrl }: { rootFree: boolean; publicUrl: string }) {
  const { t } = useTranslation();
  const errors = useErrorText();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", description: "", slug: "", private: false, archiveOlder: 3 });
  const [slugEdited, setSlugEdited] = useState(false);
  const [useRoot, setUseRoot] = useState(rootFree);
  const [created, setCreated] = useState<{ repositoryId: number; jobId: number } | null>(null);
  const slug = slugEdited ? form.slug : slugify(form.name);
  const address = `${publicUrl}/${useRoot ? "" : `${slug || "…"}/`}repo`;

  const create = useMutation({
    mutationFn: () =>
      api<{ repository: Repository; jobId: number }>("/repositories", {
        method: "POST",
        body: { ...form, slug, urlPrefix: useRoot ? "" : slug },
      }),
    onSuccess: async (result) => {
      setCreated({ repositoryId: result.repository.id, jobId: result.jobId });
      await queryClient.invalidateQueries({ queryKey: repositoriesQuery.queryKey });
    },
  });
  const { data: job } = useQuery({
    ...jobQuery(created?.jobId ?? 0),
    enabled: created !== null,
    refetchInterval: (query) => (query.state.data?.finishedAt ? false : 1000),
  });
  const fieldErrors = errors.fieldErrors(create.error);

  if (created) {
    return (
      <Card>
        <CardHeader
          title={job?.status === "failed" ? t("newRepository.create.failed") : job?.finishedAt ? t("newRepository.create.done") : t("newRepository.create.running")}
          description={job?.error ? errors.message(job.error.code, job.error.params) : t("newRepository.create.runningDescription")}
          actions={
            job?.status === "succeeded" ? (
              <Button onClick={() => void navigate({ to: "/repositories/$repositoryId", params: { repositoryId: String(created.repositoryId) } })}>
                {t("newRepository.create.open")}
              </Button>
            ) : null
          }
        />
        <CardBody>
          <JobLog jobId={created.jobId} />
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader title={t("newRepository.create.title")} description={t("newRepository.create.description")} />
      <CardBody>
        <form
          className="grid gap-5 md:grid-cols-2"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <Field label={t("newRepository.name")} hint={t("newRepository.nameHint")} error={fieldErrors.name}>
            {(control) => <Input {...control} required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />}
          </Field>
          <Field label={t("newRepository.slug")} hint={t("newRepository.slugHint")} error={fieldErrors.slug}>
            {(control) => (
              <Input
                {...control}
                required
                className="font-mono"
                value={slug}
                onChange={(event) => {
                  setSlugEdited(true);
                  setForm({ ...form, slug: event.target.value });
                }}
              />
            )}
          </Field>
          <Field label={t("newRepository.descriptionLabel")} className="md:col-span-2">
            {(control) => <Textarea {...control} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />}
          </Field>
          <div className="flex flex-col gap-2 md:col-span-2">
            <span className="text-sm font-medium text-text">{t("newRepository.address")}</span>
            <code className="rounded-xl bg-surface-2 px-3.5 py-2.5 font-mono text-xs break-all text-text">{address}</code>
            {rootFree ? (
              <label className="flex items-center gap-3 text-sm text-text">
                <Switch checked={useRoot} onCheckedChange={setUseRoot} />
                {t("newRepository.useRoot")}
              </label>
            ) : null}
            <p className="text-xs text-muted">{t("newRepository.addressHint")}</p>
          </div>
          <Field label={t("newRepository.archive")} hint={t("newRepository.archiveHint")}>
            {(control) => (
              <Select
                {...control}
                value={String(form.archiveOlder)}
                onValueChange={(value) => setForm({ ...form, archiveOlder: Number(value) })}
                options={ARCHIVE_CHOICES.map((count) => ({
                  value: String(count),
                  label: count === 0 ? t("newRepository.archiveNever") : t("newRepository.archiveKeep", { count }),
                }))}
              />
            )}
          </Field>
          <label className="flex items-start gap-3 rounded-xl bg-surface-2 p-3.5 text-sm md:self-end">
            <Switch checked={form.private} onCheckedChange={(checked) => setForm({ ...form, private: checked })} className="mt-0.5" />
            <span>
              <span className="block font-medium text-text">{t("newRepository.private")}</span>
              <span className="mt-0.5 block text-muted">{t("newRepository.privateHint")}</span>
            </span>
          </label>
          {create.error && Object.keys(fieldErrors).length === 0 ? (
            <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger-text md:col-span-2">
              {errors.fromError(create.error)}
            </p>
          ) : null}
          <div className="md:col-span-2">
            <Button type="submit" size="lg" loading={create.isPending}>
              <IconSparkles />
              {t("newRepository.create.submit")}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

export function NewRepositoryPage() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode | null>(null);
  const { data: repositories } = useQuery(repositoriesQuery);
  const { data: system } = useQuery(systemQuery);
  const rootFree = !repositories?.some((repository) => repository.urlPrefix === "");

  return (
    <>
      <PageHeader
        title={t("newRepository.title")}
        description={t("newRepository.description")}
        actions={
          mode ? (
            <Button variant="ghost" onClick={() => setMode(null)}>
              <IconArrowLeft />
              {t("newRepository.back")}
            </Button>
          ) : null
        }
      />
      {mode === null ? (
        <div className="grid gap-4 md:grid-cols-2">
          <ModeCard icon={<IconPackageImport />} title={t("newRepository.import.choice")} description={t("newRepository.import.choiceDescription")} onClick={() => setMode("import")} />
          <ModeCard icon={<IconSparkles />} title={t("newRepository.create.choice")} description={t("newRepository.create.choiceDescription")} onClick={() => setMode("create")} />
        </div>
      ) : mode === "import" ? (
        <ImportForm />
      ) : (
        <CreateForm rootFree={rootFree} publicUrl={system?.publicUrl ?? window.location.origin} />
      )}
    </>
  );
}
