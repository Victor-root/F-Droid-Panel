import { IconUserShield } from "@tabler/icons-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import { api } from "../../api/client";
import { authStatusQuery } from "../../api/queries";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Field, Input } from "../../components/ui/Field";
import { useErrorText } from "../../lib/errors";

export function SetupPage() {
  const { t } = useTranslation();
  const errors = useErrorText();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [form, setForm] = useState({ code: "", username: "", displayName: "", password: "" });
  const [confirmation, setConfirmation] = useState("");
  const mismatch = confirmation.length > 0 && confirmation !== form.password;

  const setup = useMutation({
    mutationFn: () => api("/auth/setup", { method: "POST", body: form }),
    onSuccess: async () => {
      queryClient.clear();
      await queryClient.fetchQuery(authStatusQuery);
      await navigate({ to: "/" });
    },
  });
  const fieldErrors = errors.fieldErrors(setup.error);
  const generalError = setup.error && Object.keys(fieldErrors).length === 0 ? errors.fromError(setup.error) : null;

  const update = (field: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!mismatch) setup.mutate();
  };

  return (
    <Card className="p-7 shadow-raised sm:p-8">
      <div className="mb-6 flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent-soft-text">
        <IconUserShield className="size-6" />
      </div>
      <h1 className="text-xl font-semibold tracking-tight text-text">{t("setup.title")}</h1>
      <p className="mt-1.5 text-sm text-muted">{t("setup.description")}</p>
      <form className="mt-6 flex flex-col gap-4" onSubmit={submit}>
        <Field label={t("setup.code")} hint={t("setup.codeHint")} error={fieldErrors.code}>
          {(control) => (
            <Input {...control} required autoFocus autoComplete="off" className="font-mono uppercase tracking-widest" placeholder="XXXX-XXXX-XXXX" value={form.code} onChange={update("code")} />
          )}
        </Field>
        <Field label={t("setup.displayName")} hint={t("setup.displayNameHint")} error={fieldErrors.displayName}>
          {(control) => <Input {...control} required autoComplete="name" value={form.displayName} onChange={update("displayName")} />}
        </Field>
        <Field label={t("login.username")} hint={t("setup.usernameHint")} error={fieldErrors.username}>
          {(control) => <Input {...control} required autoComplete="username" value={form.username} onChange={update("username")} />}
        </Field>
        <Field label={t("login.password")} hint={t("setup.passwordHint")} error={fieldErrors.password}>
          {(control) => (
            <Input {...control} required type="password" autoComplete="new-password" value={form.password} onChange={update("password")} />
          )}
        </Field>
        <Field label={t("setup.passwordConfirm")} error={mismatch ? t("setup.passwordMismatch") : undefined}>
          {(control) => (
            <Input {...control} required type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
          )}
        </Field>
        {generalError ? (
          <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger-text">
            {generalError}
          </p>
        ) : null}
        <Button type="submit" size="lg" loading={setup.isPending} className="mt-2">
          {t("setup.submit")}
        </Button>
      </form>
    </Card>
  );
}
