import { createRootRoute, createRoute, createRouter, Outlet, redirect } from "@tanstack/react-router";

import { ActivityPage } from "../pages/ActivityPage";
import { NotFoundPage } from "../pages/NotFoundPage";
import { OverviewPage } from "../pages/OverviewPage";
import { AppearanceSettings } from "../pages/settings/AppearanceSettings";
import { SettingsPage } from "../pages/settings/SettingsPage";
import { StyleGuidePage } from "../pages/StyleGuidePage";
import { AppLayout } from "./AppLayout";

const rootRoute = createRootRoute({ component: Outlet, notFoundComponent: NotFoundPage });

const appRoute = createRoute({ getParentRoute: () => rootRoute, id: "app", component: AppLayout });

const overviewRoute = createRoute({ getParentRoute: () => appRoute, path: "/", component: OverviewPage });

const activityRoute = createRoute({ getParentRoute: () => appRoute, path: "/activity", component: ActivityPage });

const settingsRoute = createRoute({ getParentRoute: () => appRoute, path: "/settings", component: SettingsPage });

const settingsIndexRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/settings/appearance", replace: true });
  },
});

const appearanceRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/appearance",
  component: AppearanceSettings,
});

const styleGuideRoute = createRoute({ getParentRoute: () => appRoute, path: "/style-guide", component: StyleGuidePage });

const routeTree = rootRoute.addChildren([
  appRoute.addChildren([
    overviewRoute,
    activityRoute,
    settingsRoute.addChildren([settingsIndexRoute, appearanceRoute]),
    ...(import.meta.env.DEV ? [styleGuideRoute] : []),
  ]),
]);

export const router = createRouter({
  routeTree,
  basepath: "/admin",
  defaultPreload: "intent",
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
