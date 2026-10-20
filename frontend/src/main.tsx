import "./index.css";
import "./i18n";

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { setNonce } from "get-nonce";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { isApiError } from "./api/client";
import { authStatusQuery } from "./api/queries";
import { AccentSync } from "./app/PreferenceSync";
import { ReauthProvider } from "./app/Reauth";
import { createAppRouter } from "./app/router";
import { Toaster } from "./components/ui/Toast";
import { TooltipProvider } from "./components/ui/Tooltip";
import { ThemeProvider } from "./theme/ThemeProvider";

// Libraries that insert <style> elements use this nonce, allowed by the Content Security Policy.
const nonce = document.querySelector<HTMLMetaElement>('meta[name="csp-nonce"]')?.content;
if (nonce) setNonce(nonce);

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing #root element");
}

// An expired session sends the user back to the login page, wherever it happens.
const onError = (error: unknown) => {
  if (isApiError(error, "not_authenticated") && !router.state.location.pathname.endsWith("/login")) {
    queryClient.removeQueries();
    void queryClient.invalidateQueries({ queryKey: authStatusQuery.queryKey });
    void router.navigate({ to: "/login", search: { redirect: router.state.location.href } });
  }
};

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError }),
  mutationCache: new MutationCache({ onError }),
  defaultOptions: {
    queries: { retry: (count, error) => count < 1 && !isApiError(error), refetchOnWindowFocus: false },
  },
});
const router = createAppRouter(queryClient);

createRoot(root).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={300}>
          <ReauthProvider>
            <AccentSync />
            <RouterProvider router={router} />
            <Toaster />
          </ReauthProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
