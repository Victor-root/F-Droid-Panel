import "./index.css";
import "./i18n";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { router } from "./app/router";
import { Toaster } from "./components/ui/Toast";
import { TooltipProvider } from "./components/ui/Tooltip";
import { ThemeProvider } from "./theme/ThemeProvider";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing #root element");
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

createRoot(root).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={300}>
          <RouterProvider router={router} />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
