import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, createRoute, createRouter, Outlet, redirect } from "@tanstack/react-router";

import { authStatusQuery, meQuery } from "../api/queries";
import { ActivityPage } from "../pages/ActivityPage";
import { AuthLayout } from "../pages/auth/AuthLayout";
import { LoginPage } from "../pages/auth/LoginPage";
import { SetupPage } from "../pages/auth/SetupPage";
import { NotFoundPage } from "../pages/NotFoundPage";
import { OverviewPage } from "../pages/OverviewPage";
import { AboutSettings } from "../pages/settings/AboutSettings";
import { AccountSettings } from "../pages/settings/AccountSettings";
import { AppearanceSettings } from "../pages/settings/AppearanceSettings";
import { SettingsPage } from "../pages/settings/SettingsPage";
import { SystemSettings } from "../pages/settings/SystemSettings";
import { UsersSettings } from "../pages/settings/UsersSettings";
import { StyleGuidePage } from "../pages/StyleGuidePage";
import { AppLayout } from "./AppLayout";

interface RouterContext {
  queryClient: QueryClient;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({ component: Outlet, notFoundComponent: NotFoundPage });

const authRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "auth",
  component: AuthLayout,
});

const loginRoute = createRoute({
  getParentRoute: () => authRoute,
  path: "/login",
  validateSearch: (search: Record<string, unknown>): { redirect?: string } =>
    typeof search.redirect === "string" ? { redirect: search.redirect } : {},
  beforeLoad: async ({ context }) => {
    const status = await context.queryClient.fetchQuery(authStatusQuery);
    if (status.setupRequired) throw redirect({ to: "/setup" });
    if (status.authenticated) throw redirect({ to: "/" });
    return { secondFactor: status.secondFactorRequired };
  },
  component: function Login() {
    return <LoginPage secondFactor={loginRoute.useRouteContext().secondFactor} />;
  },
});

const setupRoute = createRoute({
  getParentRoute: () => authRoute,
  path: "/setup",
  beforeLoad: async ({ context }) => {
    const status = await context.queryClient.fetchQuery(authStatusQuery);
    if (!status.setupRequired) throw redirect({ to: status.authenticated ? "/" : "/login" });
  },
  component: SetupPage,
});

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  beforeLoad: async ({ context, location }) => {
    const status = await context.queryClient.fetchQuery(authStatusQuery);
    if (status.setupRequired) throw redirect({ to: "/setup" });
    if (!status.authenticated) throw redirect({ to: "/login", search: { redirect: location.href } });
    await context.queryClient.ensureQueryData(meQuery);
  },
  component: AppLayout,
});

const adminOnly = async ({ context }: { context: RouterContext }) => {
  const me = await context.queryClient.ensureQueryData(meQuery);
  if (me.role !== "admin") throw redirect({ to: "/settings/account" });
};

const overviewRoute = createRoute({ getParentRoute: () => appRoute, path: "/", component: OverviewPage });

const activityRoute = createRoute({ getParentRoute: () => appRoute, path: "/activity", component: ActivityPage });

const settingsRoute = createRoute({ getParentRoute: () => appRoute, path: "/settings", component: SettingsPage });

const settingsIndexRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/settings/account", replace: true });
  },
});

const accountRoute = createRoute({ getParentRoute: () => settingsRoute, path: "/account", component: AccountSettings });

const appearanceRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/appearance",
  component: AppearanceSettings,
});

const usersRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/users",
  beforeLoad: adminOnly,
  component: UsersSettings,
});

const systemRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/system",
  beforeLoad: adminOnly,
  component: SystemSettings,
});

const aboutRoute = createRoute({ getParentRoute: () => settingsRoute, path: "/about", component: AboutSettings });

const styleGuideRoute = createRoute({ getParentRoute: () => appRoute, path: "/style-guide", component: StyleGuidePage });

const routeTree = rootRoute.addChildren([
  authRoute.addChildren([loginRoute, setupRoute]),
  appRoute.addChildren([
    overviewRoute,
    activityRoute,
    settingsRoute.addChildren([settingsIndexRoute, accountRoute, appearanceRoute, usersRoute, systemRoute, aboutRoute]),
    ...(import.meta.env.DEV ? [styleGuideRoute] : []),
  ]),
]);

export function createAppRouter(queryClient: QueryClient) {
  return createRouter({
    routeTree,
    context: { queryClient },
    basepath: "/admin",
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
