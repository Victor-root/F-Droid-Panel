import { IconLock, IconShieldLock } from "@tabler/icons-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import { api } from "../../api/client";
import { authStatusQuery } from "../../api/queries";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Field, Input } from "../../components/ui/Field";
import { useErrorText } from "../../lib/errors";

interface LoginResult {
  secondFactorRequired: boolean;
}

function safeRedirect(target: string | undefined): string {
  return target?.startsWith("/") && !target.startsWith("//") ? target : "/";
}

export function LoginPage({ secondFactor }: { secondFactor: boolean }) {
  const { t } = useTranslation();
  const errors = useErrorText();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const search: { redirect?: string } = useSearch({ strict: false });
  const [step, setStep] = useState<"password" | "code">(secondFactor ? "code" : "password");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");

  const finish = async () => {
    queryClient.clear();
    await queryClient.fetchQuery(authStatusQuery);
    await navigate({ to: safeRedirect(search.redirect) });
  };

  const login = useMutation({
    mutationFn: () => api<LoginResult>("/auth/login", { method: "POST", body: { username, password } }),
    onSuccess: async (result) => {
      if (result.secondFactorRequired) {
        setStep("code");
      } else {
        await finish();
      }
    },
  });

  const verify = useMutation({
    mutationFn: () => api<LoginResult>("/auth/second-factor", { method: "POST", body: { code } }),
    onSuccess: finish,
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    (step === "password" ? login : verify).mutate();
  };

  const error = step === "password" ? login.error : verify.error;

  return (
    <Card className="p-7 shadow-raised sm:p-8">
      <div className="mb-6 flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent-soft-text">
        {step === "password" ? <IconLock className="size-6" /> : <IconShieldLock className="size-6" />}
      </div>
      <h1 className="text-xl font-semibold tracking-tight text-text">
        {step === "password" ? t("login.title") : t("login.secondFactorTitle")}
      </h1>
      <p className="mt-1.5 text-sm text-muted">
        {step === "password" ? t("login.description") : t("login.secondFactorDescription")}
      </p>
      <form className="mt-6 flex flex-col gap-4" onSubmit={submit}>
        {step === "password" ? (
          <>
            <Field label={t("login.username")}>
              {(control) => (
                <Input {...control} autoComplete="username" autoFocus required value={username} onChange={(event) => setUsername(event.target.value)} />
              )}
            </Field>
            <Field label={t("login.password")}>
              {(control) => (
                <Input {...control} type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
              )}
            </Field>
          </>
        ) : (
          <Field label={t("login.code")} hint={t("login.codeHint")}>
            {(control) => (
              <Input
                {...control}
                autoComplete="one-time-code"
                autoFocus
                required
                className="font-mono tracking-widest"
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
            )}
          </Field>
        )}
        {error ? (
          <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger-text">
            {errors.fromError(error)}
          </p>
        ) : null}
        <Button type="submit" size="lg" loading={login.isPending || verify.isPending} className="mt-2">
          {step === "password" ? t("login.submit") : t("login.verify")}
        </Button>
      </form>
    </Card>
  );
}
