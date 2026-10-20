import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { api } from "../api/client";
import { appearanceQuery, meQuery } from "../api/queries";
import type { Me } from "../api/types";
import { AUTO_LANGUAGE, useLanguageChoice } from "../components/PreferenceMenus";
import { chooseLanguage, type Language, LANGUAGES } from "../i18n";
import { useTheme } from "../theme/ThemeProvider";

/** Applies the panel accent color, for every visitor including the login page. */
export function AccentSync() {
  const { setAccent } = useTheme();
  const { data } = useQuery(appearanceQuery);
  useEffect(() => {
    if (data) setAccent(data.accent);
  }, [data, setAccent]);
  return null;
}

/**
 * Theme and language follow the account: the saved choice is applied after login,
 * then every change made in this browser is saved to the account.
 */
export function PreferenceSync() {
  const queryClient = useQueryClient();
  const { data: me } = useQuery(meQuery);
  const { mode, setMode } = useTheme();
  const languageChoice = useLanguageChoice();
  // "pending" during the render that applies the account preferences, so that render does not save them back.
  const applied = useRef<"no" | "pending" | "done">("no");

  useEffect(() => {
    if (!me || applied.current !== "no") return;
    applied.current = "pending";
    setMode(me.theme);
    const language = LANGUAGES.find((item) => item === me.language) ?? null;
    void chooseLanguage(language as Language | null);
  }, [me, setMode]);

  useEffect(() => {
    if (!me || applied.current === "no") return;
    if (applied.current === "pending") {
      applied.current = "done";
      return;
    }
    const language = languageChoice === AUTO_LANGUAGE ? "" : languageChoice;
    if (mode === me.theme && language === (me.language ?? "")) return;
    void api<Me>("/me", { method: "PATCH", body: { theme: mode, language } }).then((updated) =>
      queryClient.setQueryData(meQuery.queryKey, updated),
    );
  }, [me, mode, languageChoice, queryClient]);

  return null;
}
