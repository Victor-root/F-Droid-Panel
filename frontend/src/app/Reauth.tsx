import { IconShieldCheck } from "@tabler/icons-react";
import { createContext, type FormEvent, type ReactNode, use, useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { api, isApiError } from "../api/client";
import { Button } from "../components/ui/Button";
import { Dialog, DialogClose, DialogContent } from "../components/ui/Dialog";
import { Field, Input } from "../components/ui/Field";
import { useErrorText } from "../lib/errors";

type WithReauth = <T>(action: () => Promise<T>) => Promise<T>;

const ReauthContext = createContext<WithReauth | null>(null);

interface Pending {
  resolve: () => void;
  reject: (error: unknown) => void;
  error: unknown;
}

/** Runs sensitive actions; when the server asks for the password again, asks for it and retries once. */
export function ReauthProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const errors = useErrorText();
  const pending = useRef<Pending | null>(null);
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const withReauth = useCallback<WithReauth>(async (action) => {
    try {
      return await action();
    } catch (failure) {
      if (!isApiError(failure, "reauthentication_required")) throw failure;
      await new Promise<void>((resolve, reject) => {
        pending.current = { resolve, reject, error: failure };
        setPassword("");
        setError(null);
        setOpen(true);
      });
      return action();
    }
  }, []);

  const close = (confirmed: boolean) => {
    setOpen(false);
    const current = pending.current;
    pending.current = null;
    if (confirmed) current?.resolve();
    else current?.reject(current.error);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await api("/auth/confirm", { method: "POST", body: { password } });
      close(true);
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ReauthContext value={withReauth}>
      {children}
      <Dialog open={open} onOpenChange={(next) => !next && close(false)}>
        <DialogContent
          size="sm"
          title={t("reauth.title")}
          description={t("reauth.description")}
        >
          <form id="reauth-form" className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
            <div className="flex size-11 items-center justify-center rounded-2xl bg-accent-soft text-accent-soft-text">
              <IconShieldCheck className="size-6" />
            </div>
            <Field label={t("login.password")} error={error ? errors.fromError(error) : undefined}>
              {(control) => (
                <Input {...control} type="password" autoFocus autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
              )}
            </Field>
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="secondary">
                  {t("action.cancel")}
                </Button>
              </DialogClose>
              <Button type="submit" loading={busy}>
                {t("reauth.confirm")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </ReauthContext>
  );
}

export function useReauth(): WithReauth {
  const context = use(ReauthContext);
  if (!context) throw new Error("useReauth must be used inside ReauthProvider");
  return context;
}
