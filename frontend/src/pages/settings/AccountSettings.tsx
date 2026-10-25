import { IconDeviceLaptop, IconDownload, IconPhotoUp, IconShieldCheck, IconShieldOff, IconTrash } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import { api, apiRaw } from "../../api/client";
import { meQuery, sessionsQuery } from "../../api/queries";
import type { Me } from "../../api/types";
import { useReauth } from "../../app/Reauth";
import { QrCode } from "../../components/QrCode";
import { Badge } from "../../components/ui/Badge";
import { Avatar } from "../../components/ui/Avatar";
import { Button, buttonVariants } from "../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { CopyField } from "../../components/ui/CopyButton";
import { Dialog, DialogContent } from "../../components/ui/Dialog";
import { Field, Input } from "../../components/ui/Field";
import { Skeleton } from "../../components/ui/Skeleton";
import { toast } from "../../components/ui/Toast";
import { cn } from "../../lib/cn";
import { useErrorText } from "../../lib/errors";
import { useFormat } from "../../lib/format";
import { squarePicture } from "../../lib/image";
import { describeUserAgent } from "../../lib/userAgent";

function PictureRow({ me }: { me: Me }) {
  const { t } = useTranslation();
  const errors = useErrorText();
  const queryClient = useQueryClient();
  const saved = (updated: Me) => {
    queryClient.setQueryData(meQuery.queryKey, updated);
    void queryClient.invalidateQueries({ queryKey: ["users"] });
  };
  const upload = useMutation({
    mutationFn: (picture: Blob) => apiRaw<Me>("/me/avatar", { method: "PUT", body: picture }),
    onSuccess: (updated) => {
      saved(updated);
      toast.success(t("account.profile.pictureSaved"));
    },
    onError: (error) => toast.error(errors.fromError(error)),
  });
  const remove = useMutation({
    mutationFn: () => api<Me>("/me/avatar", { method: "DELETE" }),
    onSuccess: saved,
    onError: (error) => toast.error(errors.fromError(error)),
  });

  return (
    <div className="mb-5 flex flex-wrap items-center gap-4">
      <Avatar name={me.displayName} src={me.avatarUrl} size="xl" />
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <label className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "cursor-pointer", upload.isPending && "pointer-events-none opacity-50")}>
            <IconPhotoUp />
            {t("account.profile.pictureChange")}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                squarePicture(file).then(
                  (picture) => upload.mutate(picture),
                  () => toast.error(t("account.profile.pictureUnreadable")),
                );
              }}
            />
          </label>
          {me.avatarUrl ? (
            <Button variant="ghost" size="sm" className="text-danger-text" loading={remove.isPending} onClick={() => remove.mutate()}>
              <IconTrash />
              {t("account.profile.pictureRemove")}
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-muted">{t("account.profile.pictureHint")}</p>
      </div>
    </div>
  );
}

function ProfileCard({ me }: { me: Me }) {
  const { t } = useTranslation();
  const errors = useErrorText();
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState(me.displayName);
  const save = useMutation({
    mutationFn: () => api<Me>("/me", { method: "PATCH", body: { displayName } }),
    onSuccess: (updated) => {
      queryClient.setQueryData(meQuery.queryKey, updated);
      toast.success(t("account.profile.saved"));
    },
  });

  return (
    <Card>
      <CardHeader title={t("account.profile.title")} description={t("account.profile.description", { username: me.username })} />
      <CardBody>
        <PictureRow me={me} />
        <form
          className="flex flex-col gap-4 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <Field label={t("setup.displayName")} className="flex-1" error={save.error ? errors.fromError(save.error) : undefined}>
            {(control) => <Input {...control} required value={displayName} onChange={(event) => setDisplayName(event.target.value)} />}
          </Field>
          <Button type="submit" variant="secondary" loading={save.isPending} disabled={displayName === me.displayName}>
            {t("action.save")}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

function PasswordCard() {
  const { t } = useTranslation();
  const errors = useErrorText();
  const empty = { currentPassword: "", newPassword: "", confirmation: "" };
  const [form, setForm] = useState(empty);
  const mismatch = form.confirmation.length > 0 && form.confirmation !== form.newPassword;
  const change = useMutation({
    mutationFn: () =>
      api("/me/password", { method: "POST", body: { currentPassword: form.currentPassword, newPassword: form.newPassword } }),
    onSuccess: () => {
      setForm(empty);
      toast.success(t("account.password.changed"), t("account.password.changedDescription"));
    },
  });
  const fieldErrors = errors.fieldErrors(change.error);
  const update = (field: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  return (
    <Card>
      <CardHeader title={t("account.password.title")} description={t("account.password.description")} />
      <CardBody>
        <form
          className="grid gap-4 md:grid-cols-3"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            if (!mismatch) change.mutate();
          }}
        >
          <Field
            label={t("account.password.current")}
            error={change.error && !fieldErrors.newPassword ? errors.fromError(change.error) : undefined}
          >
            {(control) => (
              <Input {...control} type="password" required autoComplete="current-password" value={form.currentPassword} onChange={update("currentPassword")} />
            )}
          </Field>
          <Field label={t("account.password.new")} hint={t("setup.passwordHint")} error={fieldErrors.newPassword}>
            {(control) => <Input {...control} type="password" required autoComplete="new-password" value={form.newPassword} onChange={update("newPassword")} />}
          </Field>
          <Field label={t("setup.passwordConfirm")} error={mismatch ? t("setup.passwordMismatch") : undefined}>
            {(control) => <Input {...control} type="password" required autoComplete="new-password" value={form.confirmation} onChange={update("confirmation")} />}
          </Field>
          <div className="md:col-span-3">
            <Button type="submit" variant="secondary" loading={change.isPending}>
              {t("account.password.submit")}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

function downloadCodes(codes: string[], username: string) {
  const blob = new Blob([`F-Droid Panel recovery codes for ${username}\n\n${codes.join("\n")}\n`], { type: "text/plain" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `fdroid-panel-recovery-codes-${username}.txt`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function RecoveryCodesDialog({ codes, username, onClose }: { codes: string[] | null; username: string; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Dialog open={codes !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={t("account.secondFactor.codesTitle")}
        description={t("account.secondFactor.codesDescription")}
        footer={
          <>
            <Button variant="secondary" onClick={() => codes && downloadCodes(codes, username)}>
              <IconDownload />
              {t("account.secondFactor.download")}
            </Button>
            <Button onClick={onClose}>{t("account.secondFactor.codesSaved")}</Button>
          </>
        }
      >
        <ul className="grid grid-cols-2 gap-2 font-mono text-sm">
          {codes?.map((code) => (
            <li key={code} className="rounded-lg bg-surface-2 px-3 py-2 text-center tracking-wider text-text">
              {code}
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

function SecondFactorCard({ me }: { me: Me }) {
  const { t } = useTranslation();
  const errors = useErrorText();
  const queryClient = useQueryClient();
  const withReauth = useReauth();
  const [enrollment, setEnrollment] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [confirmDisable, setConfirmDisable] = useState(false);
  const refreshMe = () => queryClient.invalidateQueries({ queryKey: meQuery.queryKey });

  const start = useMutation({
    mutationFn: () => api<{ secret: string; uri: string }>("/me/second-factor/setup", { method: "POST" }),
    onSuccess: (result) => {
      setCode("");
      setEnrollment(result);
    },
  });
  const enable = useMutation({
    mutationFn: () => api<{ codes: string[] }>("/me/second-factor/enable", { method: "POST", body: { code } }),
    onSuccess: async (result) => {
      setEnrollment(null);
      setCodes(result.codes);
      await refreshMe();
      toast.success(t("account.secondFactor.enabled"));
    },
  });
  const regenerate = useMutation({
    mutationFn: () => withReauth(() => api<{ codes: string[] }>("/me/recovery-codes", { method: "POST" })),
    onSuccess: (result) => setCodes(result.codes),
    onError: (error) => toast.error(errors.fromError(error)),
  });

  return (
    <Card>
      <CardHeader
        title={t("account.secondFactor.title")}
        description={t("account.secondFactor.description")}
        actions={
          me.totpEnabled ? (
            <Badge tone="success">
              <IconShieldCheck />
              {t("account.secondFactor.on")}
            </Badge>
          ) : (
            <Badge tone="warning">
              <IconShieldOff />
              {t("account.secondFactor.off")}
            </Badge>
          )
        }
      />
      <CardBody>
        {me.totpEnabled ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" loading={regenerate.isPending} onClick={() => regenerate.mutate()}>
              {t("account.secondFactor.regenerate")}
            </Button>
            <Button variant="ghost" className="text-danger-text" onClick={() => setConfirmDisable(true)}>
              {t("account.secondFactor.disable")}
            </Button>
          </div>
        ) : enrollment ? (
          <div className="grid gap-6 md:grid-cols-[auto_1fr] md:items-start">
            <QrCode value={enrollment.uri} label={t("account.secondFactor.qrLabel")} />
            <form
              className="flex flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                enable.mutate();
              }}
            >
              <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted">
                <li>{t("account.secondFactor.step1")}</li>
                <li>{t("account.secondFactor.step2")}</li>
                <li>{t("account.secondFactor.step3")}</li>
              </ol>
              <div>
                <p className="mb-1.5 text-xs text-muted">{t("account.secondFactor.manual")}</p>
                <CopyField value={enrollment.secret} />
              </div>
              <Field label={t("login.code")} error={enable.error ? errors.fromError(enable.error) : undefined}>
                {(control) => (
                  <Input
                    {...control}
                    required
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    className="max-w-48 font-mono tracking-widest"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                  />
                )}
              </Field>
              <div className="flex gap-2">
                <Button type="submit" loading={enable.isPending}>
                  {t("account.secondFactor.activate")}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setEnrollment(null)}>
                  {t("action.cancel")}
                </Button>
              </div>
            </form>
          </div>
        ) : (
          <Button loading={start.isPending} onClick={() => start.mutate()}>
            <IconShieldCheck />
            {t("account.secondFactor.enable")}
          </Button>
        )}
      </CardBody>
      <RecoveryCodesDialog codes={codes} username={me.username} onClose={() => setCodes(null)} />
      <ConfirmDialog
        open={confirmDisable}
        onOpenChange={setConfirmDisable}
        danger
        title={t("account.secondFactor.disableTitle")}
        description={t("account.secondFactor.disableDescription")}
        confirmLabel={t("account.secondFactor.disable")}
        onConfirm={async () => {
          await withReauth(() => api("/me/second-factor/disable", { method: "POST" }));
          await refreshMe();
          toast.info(t("account.secondFactor.disabled"));
        }}
      />
    </Card>
  );
}

function SessionsCard() {
  const { t } = useTranslation();
  const format = useFormat();
  const queryClient = useQueryClient();
  const { data: sessions } = useQuery(sessionsQuery);
  const revoke = useMutation({
    mutationFn: (id: number) => api(`/me/sessions/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionsQuery.queryKey }),
  });

  return (
    <Card>
      <CardHeader title={t("account.sessions.title")} description={t("account.sessions.description")} />
      <CardBody className="pt-3">
        {sessions ? (
          <ul className="divide-y divide-border">
            {sessions.map((session) => (
              <li key={session.id} className="flex items-center gap-3 py-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-muted">
                  <IconDeviceLaptop className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-text" title={session.userAgent}>
                    {(() => {
                      const device = describeUserAgent(session.userAgent);
                      return device ? t("account.sessions.device", device) : t("account.sessions.unknownDevice");
                    })()}
                  </div>
                  <div className="text-xs text-muted">
                    {session.ip} · {t("account.sessions.lastSeen", { when: format.relative(session.lastSeenAt) })}
                  </div>
                </div>
                {session.current ? (
                  <Badge tone="accent">{t("account.sessions.current")}</Badge>
                ) : (
                  <Button variant="ghost" size="sm" loading={revoke.isPending && revoke.variables === session.id} onClick={() => revoke.mutate(session.id)}>
                    {t("account.sessions.revoke")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <Skeleton className="h-14" />
        )}
      </CardBody>
    </Card>
  );
}

export function AccountSettings() {
  const { data: me } = useQuery(meQuery);
  if (!me) return null;
  return (
    <div className="grid gap-6">
      <ProfileCard me={me} />
      <PasswordCard />
      <SecondFactorCard me={me} />
      <SessionsCard />
    </div>
  );
}
